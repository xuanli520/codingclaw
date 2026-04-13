import { join } from "node:path";
import { buildArtifactIndex } from "../../ops/archive/artifact-index.ts";
import { writeRunTimings, writeWorkerLog } from "../../ops/archive/run-metadata.ts";
import { ensureDir, readJson, relativePosix, toPosixPath, uniqueStrings, writeJson, writeText } from "../../core/loop/support.ts";
import type {
  AdapterExecutionResult,
  RunEnvelope,
  RunResult,
  RunRole,
  RunTimingMetadata,
  TaskPacket,
  WorkerOutput,
} from "../../core/contracts/types.ts";
import { DockerWorkerLauncher, type DockerWorkerLaunchResult, materializeContainerizedRunEnvelope } from "./docker-runtime.ts";
import { CapabilityGate, type CapabilityGateDecision } from "./capability-gate.ts";
import { CredentialInjector } from "../../ops/guards/credential-injector.ts";

const REQUIRED_LAUNCH_CAPABILITIES = ["container_control"] as const;

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

function formatErrorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function launchFailureText(launchResult: DockerWorkerLaunchResult): string {
  if (launchResult.failure_status === "TIMEOUT") {
    return "worker timed out before producing a complete result";
  }
  if (launchResult.failure_status === "BUDGET_EXCEEDED") {
    return "worker exceeded the configured budget";
  }
  const stderr = launchResult.stderr.trim();
  if (stderr) {
    return stderr;
  }
  const stdout = launchResult.stdout.trim();
  if (stdout) {
    return stdout;
  }
  return `launcher exited with code ${launchResult.exitCode}`;
}

function unexpectedLaunchResult(error: unknown): DockerWorkerLaunchResult {
  return {
    command: ["<launcher-error>"],
    exitCode: -1,
    stdout: "",
    stderr: formatErrorText(error),
    failure_status: "FAILED_INFRA",
  };
}

const BUILDER_FALLBACK_REPORT_PATHS = ["reports/implementation-summary.en.md", "reports/self-check.en.md"];
const BUILDER_FALLBACK_TEST_RESULT_PATHS = ["evidence/test-results/builder-check.json"];
const BUILDER_FALLBACK_EVIDENCE_PATHS = [
  ...BUILDER_FALLBACK_REPORT_PATHS,
  ...BUILDER_FALLBACK_TEST_RESULT_PATHS,
];
const QA_FALLBACK_REPORT_PATHS = ["reports/qa-report.en.md", "reports/fixback-items.en.md"];
const QA_FALLBACK_TEST_RESULT_PATHS = ["evidence/test-results/qa-check.json"];
const QA_FALLBACK_METADATA_PATHS = ["metadata/qa-verdict.json"];
const QA_FALLBACK_EVIDENCE_PATHS = [
  ...QA_FALLBACK_REPORT_PATHS,
  ...QA_FALLBACK_TEST_RESULT_PATHS,
  ...QA_FALLBACK_METADATA_PATHS,
];

async function ensureHostWritableRunLayout(runRoot: string): Promise<void> {
  await ensureDir(join(runRoot, "logs"));
  await ensureDir(join(runRoot, "reports"));
  await ensureDir(join(runRoot, "metadata"));
  await ensureDir(join(runRoot, "evidence", "test-results"));
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

function withBuilderFallbackPaths(workerOutput: WorkerOutput): WorkerOutput {
  return {
    ...workerOutput,
    evidence_paths: uniqueStrings([...workerOutput.evidence_paths, ...BUILDER_FALLBACK_EVIDENCE_PATHS]),
    report_paths: uniqueStrings([...workerOutput.report_paths, ...BUILDER_FALLBACK_REPORT_PATHS]),
    test_result_paths: uniqueStrings([...workerOutput.test_result_paths, ...BUILDER_FALLBACK_TEST_RESULT_PATHS]),
  };
}

function qaFallbackItems(workerOutput: WorkerOutput): string[] {
  if (workerOutput.fixback_items.length > 0) {
    return workerOutput.fixback_items;
  }
  if (workerOutput.blockers.length > 0) {
    return workerOutput.blockers;
  }
  return ["QA did not produce its required outputs."];
}

function withQaFallbackPaths(workerOutput: WorkerOutput): WorkerOutput {
  const fixbackItems = qaFallbackItems(workerOutput);
  return {
    ...workerOutput,
    evidence_paths: uniqueStrings([...workerOutput.evidence_paths, ...QA_FALLBACK_EVIDENCE_PATHS]),
    report_paths: uniqueStrings([...workerOutput.report_paths, ...QA_FALLBACK_REPORT_PATHS]),
    test_result_paths: uniqueStrings([...workerOutput.test_result_paths, ...QA_FALLBACK_TEST_RESULT_PATHS]),
    fixback_items: fixbackItems,
  };
}

async function writeBuilderFallbackArtifacts(
  runRoot: string,
  envelope: RunEnvelope,
  workerOutput: WorkerOutput,
): Promise<void> {
  await writeText(
    join(runRoot, "reports", "implementation-summary.en.md"),
    [
      "# Implementation Summary",
      "",
      `- job_id: ${envelope.job_id}`,
      `- run_id: ${envelope.run_id}`,
      `- story_id: ${envelope.story_id}`,
      `- status: ${workerOutput.status}`,
      "- completed work:",
      "- worker execution did not produce the builder implementation bundle",
      "- adapter synthesized the required builder reports for archival completeness",
      "",
    ].join("\n"),
  );
  await writeText(
    join(runRoot, "reports", "self-check.en.md"),
    [
      "# Self Check",
      "",
      "- required checks executed:",
      "- scope-compliance: blocked",
      "- artifact-presence: failed",
      "- evidence-completeness: failed",
      `- next required action: ${workerOutput.next_action}`,
      "",
    ].join("\n"),
  );
  await writeJson(join(runRoot, "evidence", "test-results", "builder-check.json"), {
    run_id: envelope.run_id,
    run_role: envelope.run_role,
    story_id: envelope.story_id,
    status: workerOutput.status,
    checked_items: [],
    blockers: workerOutput.blockers,
  });
}

async function writeQaFallbackArtifacts(
  runRoot: string,
  envelope: RunEnvelope,
  taskPacket: TaskPacket,
  workerOutput: WorkerOutput,
): Promise<void> {
  await writeText(
    join(runRoot, "reports", "qa-report.en.md"),
    [
      "# QA Report",
      "",
      `- job_id: ${envelope.job_id}`,
      `- run_id: ${envelope.run_id}`,
      `- story_id: ${taskPacket.story.story_id}`,
      `- QA verdict: ${workerOutput.status}`,
      "- checked artifacts:",
      "- none",
      "",
      "- missing artifacts:",
      ...workerOutput.fixback_items.map((value) => `- ${value}`),
      "",
    ].join("\n"),
  );
  await writeText(
    join(runRoot, "reports", "fixback-items.en.md"),
    ["# Fixback Items", "", ...workerOutput.fixback_items.map((value) => `- ${value}`), ""].join("\n"),
  );
  await writeJson(join(runRoot, "evidence", "test-results", "qa-check.json"), {
    run_id: envelope.run_id,
    run_role: envelope.run_role,
    story_id: taskPacket.story.story_id,
    status: workerOutput.status,
    checked_items: [],
    blockers: workerOutput.blockers,
  });
  await writeJson(join(runRoot, "metadata", "qa-verdict.json"), {
    story_id: taskPacket.story.story_id,
    status_family: "run_exit",
    status: workerOutput.status,
    acceptance_closure: {
      pass: 0,
      fail: 0,
      blocked: taskPacket.story.acceptance_ids.length,
      total: taskPacket.story.acceptance_ids.length,
    },
  });
}

export class GenericCliAdapter {
  private readonly dockerLauncher: DockerWorkerLauncher;
  private readonly capabilityGate: CapabilityGate;
  private readonly credentialInjector: CredentialInjector;

  constructor(private readonly repoRoot: string) {
    this.dockerLauncher = new DockerWorkerLauncher(repoRoot);
    this.capabilityGate = new CapabilityGate(repoRoot);
    this.credentialInjector = new CredentialInjector(repoRoot);
  }

  async execute(envelope: RunEnvelope): Promise<AdapterExecutionResult> {
    const runRoot = envelope.artifact_path;
    const commandLogPath = join(runRoot, "logs", "command-log.txt");
    const workerLogPath = join(runRoot, "logs", "worker.log");
    const runResultPath = join(runRoot, "metadata", "run-result.json");
    const timingsPath = join(runRoot, "metadata", "timings.json");
    const artifactIndexPath = join(runRoot, "metadata", "artifact-index.json");
    const handoffPath = join(runRoot, "reports", "handoff.en.md");
    await ensureHostWritableRunLayout(runRoot);
    let taskPacketPath = envelope.task_packet_path;
    const taskPacket = await readJson<TaskPacket>(taskPacketPath);
    const canonicalRequestedCapabilities = uniqueStrings(taskPacket.requested_capabilities);
    const envelopeRequestedCapabilities = uniqueStrings(envelope.requested_capabilities);

    const startedAtDate = new Date();
    let launchResult: DockerWorkerLaunchResult;
    let capabilityDecision: CapabilityGateDecision;
    const credentialInjection = await this.credentialInjector.resolve(taskPacket, envelope);
    if (canonicalRequestedCapabilities.join("\n") !== envelopeRequestedCapabilities.join("\n")) {
      launchResult = {
        command: ["<capability-gate>", ...canonicalRequestedCapabilities],
        exitCode: 1,
        stdout: "",
        stderr: "run envelope requested_capabilities do not match the canonical task packet",
        failure_status: "FAILED_POLICY",
      };
      capabilityDecision = {
        allowed: false,
        reason: launchResult.stderr,
        status: launchResult.failure_status,
      };
    } else {
    try {
      capabilityDecision = await this.capabilityGate.evaluate(
        canonicalRequestedCapabilities,
        [
          ...REQUIRED_LAUNCH_CAPABILITIES,
          ...(taskPacket.credential_injection_requests?.length ? ["secret_injection"] : []),
        ],
      );
    } catch (error) {
      capabilityDecision = {
        allowed: false,
        reason: `capability gate could not load adapter policy: ${formatErrorText(error)}`,
        status: "FAILED_POLICY",
      };
    }
    }
    if (!capabilityDecision.allowed) {
      launchResult = {
        command: ["<capability-gate>", ...canonicalRequestedCapabilities],
        exitCode: 1,
        stdout: "",
        stderr: capabilityDecision.reason ?? "capability gate rejected the launch",
        failure_status: capabilityDecision.status ?? "FAILED_POLICY",
      };
    } else if (!credentialInjection.allowed) {
      launchResult = {
        command: ["<credential-injector>"],
        exitCode: 1,
        stdout: "",
        stderr: credentialInjection.reason ?? "credential injection rejected the launch",
        failure_status: credentialInjection.status ?? "FAILED_POLICY",
      };
    } else {
      try {
        const materialization = await materializeContainerizedRunEnvelope(envelope);
        taskPacketPath = materialization.canonical_task_packet_path;
        const workerScript = workerScriptForRole(
          materialization.runtime.container_paths.repo_path,
          materialization.container_envelope.run_role,
        );
        launchResult = await this.dockerLauncher.launch({
          run_role: materialization.container_envelope.run_role,
          image: materialization.runtime.image,
          worker_script_path: workerScript,
          envelope_path: materialization.runtime.envelope_container_path,
          runtime: materialization.runtime,
          time_limits: envelope.time_limits,
          environment: credentialInjection.environment,
        });
      } catch (error) {
        launchResult = unexpectedLaunchResult(error);
      }
    }
    const redactedLaunchResult: DockerWorkerLaunchResult = {
      ...launchResult,
      command: credentialInjection.redactor.redactCommand(launchResult.command),
      stdout: credentialInjection.redactor.redactText(launchResult.stdout),
      stderr: credentialInjection.redactor.redactText(launchResult.stderr),
    };
    const exitCode = launchResult.exitCode;
    const stdout = redactedLaunchResult.stdout;
    const stderr = redactedLaunchResult.stderr;
    const endedAtDate = new Date();

    let workerOutput: WorkerOutput;
    let usedFallbackWorkerOutput = false;
    if (exitCode === 0) {
      try {
        workerOutput = JSON.parse(launchResult.stdout) as WorkerOutput;
      } catch {
        workerOutput = fallbackWorkerOutput("worker output was not valid JSON");
        usedFallbackWorkerOutput = true;
      }
    } else {
      workerOutput = fallbackWorkerOutput(
        launchFailureText(redactedLaunchResult),
        launchResult.failure_status ?? "FAILED_EXECUTION",
      );
      usedFallbackWorkerOutput = true;
    }
    workerOutput = credentialInjection.redactor.redactWorkerOutput(workerOutput);

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

    await writeText(commandLogPath, renderCommandLog(redactedLaunchResult.command, exitCode, stdout, stderr));
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
    if (usedFallbackWorkerOutput) {
      if (envelope.run_role === "builder") {
        workerOutput = withBuilderFallbackPaths(workerOutput);
        await writeBuilderFallbackArtifacts(runRoot, envelope, workerOutput);
      }
      if (envelope.run_role === "qa") {
        workerOutput = withQaFallbackPaths(workerOutput);
        await writeQaFallbackArtifacts(runRoot, envelope, taskPacket, workerOutput);
      }
    }

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
    const takeoverPacketPath =
      workerOutput.status === "AWAITING_TAKEOVER"
        ? join(runRoot, "takeover", "takeover-packet.en.md")
        : null;

    const artifactIndex = await buildArtifactIndex(runRoot, envelope.run_id, envelope.run_role);
    await writeJson(artifactIndexPath, artifactIndex);

    return {
      runResult,
      artifactIndex,
      workerOutput,
      runRoot,
      taskPacketPath,
      runResultPath,
      artifactIndexPath,
      commandLogPath,
      handoffPath,
      takeoverPacketPath,
    };
  }
}
