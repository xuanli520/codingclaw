import { dirname, join } from "node:path";
import { buildArtifactIndex } from "../../ops/archive/artifact-index.ts";
import { writeRunTimings, writeWorkerLog } from "../../ops/archive/run-metadata.ts";
import { relativePosix, toPosixPath, writeJson, writeText } from "../../core/loop/support.ts";
import type {
  AdapterExecutionResult,
  RunEnvelope,
  RunResult,
  RunRole,
  RunTimingMetadata,
  WorkerOutput,
} from "../../core/contracts/types.ts";
import { DockerWorkerLauncher, materializeContainerizedRunEnvelope } from "./docker-runtime.ts";

function workerScriptForRole(rootPath: string, runRole: RunRole): string {
  if (runRole === "builder") {
    return toPosixPath(join(rootPath, "ops", "workers", "builder.ts"));
  }
  if (runRole === "qa") {
    return toPosixPath(join(rootPath, "ops", "workers", "qa.ts"));
  }
  throw new Error(`unsupported run role: ${runRole}`);
}

function fallbackWorkerOutput(errorText: string, status: WorkerOutput["status"] = "FAILED_EXECUTION"): WorkerOutput {
  return {
    status,
    completed: [],
    open: ["Inspect the worker stderr output."],
    blockers: errorText ? [errorText.trim()] : ["worker execution failed"],
    next_action: "wait for owner",
    acceptance_status: "blocked",
    mandatory_check_status: "blocked",
    evidence_paths: [],
    report_paths: [],
    test_result_paths: [],
    fixback_items: [],
  };
}

function renderCommandLog(command: string[], exitCode: number, stdout: string, stderr: string): string {
  return [
    `command: ${command.map((value) => value.replaceAll("\\", "/")).join(" ")}`,
    `exit_code: ${exitCode}`,
    "",
    "[stdout]",
    stdout.trimEnd(),
    "",
    "[stderr]",
    stderr.trimEnd(),
    "",
  ].join("\n");
}

function renderHandoff(
  envelope: RunEnvelope,
  status: WorkerOutput["status"],
  workerOutput: WorkerOutput,
  archivedHandoffPath: string,
): string {
  const approvalNeeds = status === "AWAITING_APPROVAL" ? "required" : "none";
  const credentialNeeds = status === "AWAITING_CREDENTIALS" ? "required" : "none";
  const takeoverNeeds = status === "AWAITING_TAKEOVER" ? "required" : "none";
  return [
    "# Handoff",
    "",
    "## Run Identity",
    "",
    `- job ID: ${envelope.job_id}`,
    `- run ID: ${envelope.run_id}`,
    `- freeze version: ${envelope.freeze_version}`,
    `- story ID: ${envelope.story_id}`,
    `- run role: ${envelope.run_role}`,
    `- run attempt: ${envelope.run_attempt}`,
    `- archived handoff path: ${archivedHandoffPath}`,
    "",
    "## Status Summary",
    "",
    `- exit status: ${status}`,
    "- what was completed:",
    ...(workerOutput.completed.length === 0 ? ["- none"] : workerOutput.completed.map((value) => `- ${value}`)),
    "- what remains open:",
    ...(workerOutput.open.length === 0 ? ["- none"] : workerOutput.open.map((value) => `- ${value}`)),
    "",
    "## Key Evidence",
    "",
    "- report paths:",
    ...(workerOutput.report_paths.length === 0 ? ["- none"] : workerOutput.report_paths.map((value) => `- ${value}`)),
    "- log paths:",
    "- logs/command-log.txt",
    "- logs/worker.log",
    "- test result paths:",
    ...(workerOutput.test_result_paths.length === 0 ? ["- none"] : workerOutput.test_result_paths.map((value) => `- ${value}`)),
    "- trace references:",
    ...workerOutput.evidence_paths.map((value) => `- artifact: ${value}`),
    "",
    "## Risks and Blockers",
    "",
    "- current blockers:",
    ...(workerOutput.blockers.length === 0 ? ["- none"] : workerOutput.blockers.map((value) => `- ${value}`)),
    `- approval needs: ${approvalNeeds}`,
    `- credential needs: ${credentialNeeds}`,
    `- takeover needs: ${takeoverNeeds}`,
    "",
    "## Recommended Next Step",
    "",
    `- ${workerOutput.next_action}`,
    "",
  ].join("\n");
}

export class GenericCliAdapter {
  private readonly dockerLauncher: DockerWorkerLauncher;

  constructor(private readonly repoRoot: string) {
    this.dockerLauncher = new DockerWorkerLauncher(repoRoot);
  }

  async execute(envelope: RunEnvelope): Promise<AdapterExecutionResult> {
    const runRoot = envelope.artifact_path;
    const commandLogPath = join(runRoot, "logs", "command-log.txt");
    const workerLogPath = join(runRoot, "logs", "worker.log");
    const runResultPath = join(runRoot, "metadata", "run-result.json");
    const timingsPath = join(runRoot, "metadata", "timings.json");
    const artifactIndexPath = join(runRoot, "metadata", "artifact-index.json");
    const handoffPath = join(runRoot, "reports", "handoff.en.md");
    const materialization = await materializeContainerizedRunEnvelope(envelope);
    const workerScript = workerScriptForRole(
      materialization.runtime.container_paths.repo_path,
      materialization.container_envelope.run_role,
    );

    const startedAtDate = new Date();
    const launchResult = await this.dockerLauncher.launch({
      run_role: materialization.container_envelope.run_role,
      image: materialization.runtime.image,
      worker_script_path: workerScript,
      envelope_path: materialization.runtime.envelope_container_path,
      runtime: materialization.runtime,
    });
    const exitCode = launchResult.exitCode;
    const stdout = launchResult.stdout;
    const stderr = launchResult.stderr;
    const endedAtDate = new Date();

    let workerOutput: WorkerOutput;
    if (exitCode === 0) {
      try {
        workerOutput = JSON.parse(stdout) as WorkerOutput;
      } catch {
        workerOutput = fallbackWorkerOutput("worker output was not valid JSON");
      }
    } else {
      workerOutput = fallbackWorkerOutput(stderr);
    }

    const durationMs = Math.max(0, endedAtDate.getTime() - startedAtDate.getTime());
    const runTimings: RunTimingMetadata = {
      job_id: envelope.job_id,
      run_id: envelope.run_id,
      run_role: envelope.run_role,
      story_id: envelope.story_id,
      adapter_id: "generic-cli",
      worker_exit_code: exitCode,
      started_at: startedAtDate.toISOString(),
      ended_at: endedAtDate.toISOString(),
      duration_ms: durationMs,
      duration_s: Math.max(0, Math.round(durationMs / 1000)),
    };

    await writeText(commandLogPath, renderCommandLog(launchResult.command, exitCode, stdout, stderr));
    await writeWorkerLog(workerLogPath, {
      job_id: envelope.job_id,
      run_id: envelope.run_id,
      run_role: envelope.run_role,
      started_at: runTimings.started_at,
      ended_at: runTimings.ended_at,
      exit_code: exitCode,
      stdout,
      stderr,
    });
    await writeRunTimings(timingsPath, runTimings);

    const runResult: RunResult = {
      run_id: envelope.run_id,
      run_role: envelope.run_role,
      story_id: envelope.story_id,
      status_family: "run_exit",
      status: workerOutput.status,
      artifact_root: relativePosix(this.repoRoot, runRoot),
      started_at: runTimings.started_at,
      ended_at: runTimings.ended_at,
      duration_s: runTimings.duration_s,
      adapter_id: "generic-cli",
    };

    const archivedHandoffPath = relativePosix(this.repoRoot, handoffPath);
    await writeJson(runResultPath, runResult);
    await writeText(handoffPath, renderHandoff(envelope, workerOutput.status, workerOutput, archivedHandoffPath));

    const artifactIndex = await buildArtifactIndex(runRoot, envelope.run_id, envelope.run_role);
    await writeJson(artifactIndexPath, artifactIndex);

    return {
      runResult,
      artifactIndex,
      workerOutput,
      runRoot,
      taskPacketPath: envelope.task_packet_path,
      runResultPath,
      artifactIndexPath,
      commandLogPath,
      handoffPath,
    };
  }
}
