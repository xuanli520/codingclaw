import { join } from "node:path";
import { GenericCliAdapter } from "../../adapters/generic-cli/adapter.ts";
import { StateStore } from "../../state/store/store.ts";
import {
  createRunId,
  detectBaseCommit,
  ensureDir,
  materializeJsonTemplate,
  sha256Text,
  writeJson,
} from "./support.ts";
import type { RunEnvelope, RunRole, TaskPacket } from "../contracts/types.ts";

const BUILDER_EXPECTED_ARTIFACTS = [
  "logs/command-log.txt",
  "metadata/task-packet.en.json",
  "metadata/run-result.json",
  "metadata/artifact-index.json",
  "reports/handoff.en.md",
  "reports/implementation-summary.en.md",
  "reports/self-check.en.md",
  "evidence/test-results/builder-check.json",
];

const BUILDER_VERIFICATION_TARGETS = [
  "metadata/run-result.json",
  "metadata/artifact-index.json",
  "reports/handoff.en.md",
  "reports/implementation-summary.en.md",
  "reports/self-check.en.md",
];

const QA_EXPECTED_ARTIFACTS = [
  "logs/command-log.txt",
  "metadata/task-packet.en.json",
  "metadata/run-result.json",
  "metadata/artifact-index.json",
  "metadata/qa-verdict.json",
  "reports/handoff.en.md",
  "reports/qa-report.en.md",
  "evidence/test-results/qa-check.json",
];

const QA_VERIFICATION_TARGETS = [
  "metadata/run-result.json",
  "metadata/artifact-index.json",
  "metadata/qa-verdict.json",
  "reports/handoff.en.md",
  "reports/qa-report.en.md",
];

function roleArtifacts(runRole: RunRole): { expectedArtifacts: string[]; verificationTargets: string[] } {
  if (runRole === "builder") {
    return {
      expectedArtifacts: BUILDER_EXPECTED_ARTIFACTS,
      verificationTargets: BUILDER_VERIFICATION_TARGETS,
    };
  }
  return {
    expectedArtifacts: QA_EXPECTED_ARTIFACTS,
    verificationTargets: QA_VERIFICATION_TARGETS,
  };
}

async function buildTaskPacket(
  repoRoot: string,
  runRole: RunRole,
  previousHandoffPath: string,
): Promise<TaskPacket> {
  const runId = createRunId(runRole);
  const runRoot = join(repoRoot, "artifacts", "runs", runId);
  const runtimeHome = join(repoRoot, "runtime-home", "phase1-local");
  const taskPacketPath = join(runRoot, "metadata", "task-packet.en.json");
  const { expectedArtifacts, verificationTargets } = roleArtifacts(runRole);
  const baseCommit = detectBaseCommit(repoRoot);

  const packetWithoutChecksum = await materializeJsonTemplate<TaskPacket>(
    join(repoRoot, "control", "fixtures", "phase1-local-task-packet.en.json"),
    {
      __RUN_ROLE__: runRole,
      __RUN_ATTEMPT__: 1,
      __RUN_ID__: runId,
      __REPO_PATH__: repoRoot,
      __BASE_COMMIT__: baseCommit,
      __STATE_PATH__: join(repoRoot, "state"),
      __ARTIFACT_PATH__: runRoot,
      __RUNTIME_HOME__: runtimeHome,
      __TASK_PACKET_SHA256__: "",
      __PREVIOUS_HANDOFF_PATH__: previousHandoffPath,
      __VERIFICATION_TARGETS__: verificationTargets,
      __EXPECTED_ARTIFACTS__: expectedArtifacts,
    },
  );

  const digest = sha256Text(JSON.stringify(packetWithoutChecksum));
  const finalPacket = await materializeJsonTemplate<TaskPacket>(
    join(repoRoot, "control", "fixtures", "phase1-local-task-packet.en.json"),
    {
      __RUN_ROLE__: runRole,
      __RUN_ATTEMPT__: 1,
      __RUN_ID__: runId,
      __REPO_PATH__: repoRoot,
      __BASE_COMMIT__: baseCommit,
      __STATE_PATH__: join(repoRoot, "state"),
      __ARTIFACT_PATH__: runRoot,
      __RUNTIME_HOME__: runtimeHome,
      __TASK_PACKET_SHA256__: digest,
      __PREVIOUS_HANDOFF_PATH__: previousHandoffPath,
      __VERIFICATION_TARGETS__: verificationTargets,
      __EXPECTED_ARTIFACTS__: expectedArtifacts,
    },
  );

  await ensureDir(join(runRoot, "metadata"));
  await writeJson(taskPacketPath, finalPacket);
  return finalPacket;
}

async function buildRunEnvelope(
  repoRoot: string,
  taskPacket: TaskPacket,
  previousHandoffPath: string,
  traceContext: Record<string, unknown>,
): Promise<RunEnvelope> {
  return materializeJsonTemplate<RunEnvelope>(
    join(repoRoot, "control", "fixtures", "phase1-local-run-envelope.json"),
    {
      __RUN_ID__: taskPacket.run_id,
      __RUN_ROLE__: taskPacket.run_role,
      __RUN_ATTEMPT__: taskPacket.run_attempt,
      __REPO_PATH__: taskPacket.repo_path,
      __BASE_COMMIT__: taskPacket.base_commit,
      __STATE_PATH__: taskPacket.state_path,
      __ARTIFACT_PATH__: taskPacket.artifact_path,
      __RUNTIME_HOME__: taskPacket.runtime_home,
      __TASK_PACKET_PATH__: join(taskPacket.artifact_path, "metadata", "task-packet.en.json"),
      __TASK_PACKET_SHA256__: taskPacket.task_packet_sha256,
      __PREVIOUS_HANDOFF_PATH__: previousHandoffPath,
      __APPROVAL_SNAPSHOT_PATH__: join(repoRoot, "control", "fixtures", "phase1-local-approval-card.json"),
      __TRACE_CONTEXT__: traceContext,
    },
  );
}

export interface Phase1RunSummary {
  builder_run_id: string;
  qa_run_id: string;
  builder_status: string;
  qa_status: string;
}

export async function runPhase1Local(repoRoot: string): Promise<Phase1RunSummary> {
  await ensureDir(join(repoRoot, "artifacts", "runs"));
  await ensureDir(join(repoRoot, "state"));
  await ensureDir(join(repoRoot, "runtime-home", "phase1-local"));

  const adapter = new GenericCliAdapter(repoRoot);
  const stateStore = new StateStore(repoRoot);

  const builderTaskPacket = await buildTaskPacket(repoRoot, "builder", "");
  const builderEnvelope = await buildRunEnvelope(repoRoot, builderTaskPacket, "", {
    trace_index_path: stateStore.getTraceIndexPath(),
    builder_run_root: "",
    builder_run_result_path: "",
  });

  await stateStore.bootstrap(builderTaskPacket);
  await stateStore.prepareRun(builderTaskPacket);
  const builderExecution = await adapter.execute(builderEnvelope);
  await stateStore.recordRun(builderTaskPacket, builderExecution);

  const qaTaskPacket = await buildTaskPacket(repoRoot, "qa", builderExecution.handoffPath);
  const qaEnvelope = await buildRunEnvelope(repoRoot, qaTaskPacket, builderExecution.handoffPath, {
    trace_index_path: stateStore.getTraceIndexPath(),
    builder_run_root: builderExecution.runRoot,
    builder_run_result_path: builderExecution.runResultPath,
    builder_artifact_index_path: builderExecution.artifactIndexPath,
  });

  await stateStore.prepareRun(qaTaskPacket);
  const qaExecution = await adapter.execute(qaEnvelope);
  await stateStore.recordRun(qaTaskPacket, qaExecution);

  return {
    builder_run_id: builderExecution.runResult.run_id,
    qa_run_id: qaExecution.runResult.run_id,
    builder_status: builderExecution.runResult.status,
    qa_status: qaExecution.runResult.status,
  };
}
