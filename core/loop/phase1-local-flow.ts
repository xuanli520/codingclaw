import { join } from "node:path";
import { GenericCliAdapter } from "../../adapters/generic-cli/adapter.ts";
import { writeApprovalArchive } from "../../ops/archive/approvals.ts";
import {
  buildEnvironmentSnapshotMetadata,
  buildFinalSummaryMetadata,
  finalizeArchive,
} from "../../ops/archive/finalization.ts";
import { writeContractFreeze } from "../../ops/archive/freeze.ts";
import { ensureJobRootLayout, resolveJobRootLayout } from "../../ops/archive/job-root.ts";
import { writeJobManifest } from "../../ops/archive/manifest.ts";
import { writeDevelopmentPlan } from "../../ops/archive/plan.ts";
import { createChecksumRecords, verifyChecksumFile, writeChecksumFile, sha256File } from "../../ops/checksums/sha256.ts";
import { StateStore } from "./state-store.ts";
import { mapRunExitToJobState } from "../contracts/status.ts";
import {
  collectRelativeFiles,
  createRunId,
  detectBaseBranch,
  detectBaseCommit,
  ensureDir,
  materializeJsonTemplate,
  nowIso,
  pathExists,
  readJson,
  readText,
  sha256Text,
  toPosixPath,
  uniqueStrings,
  writeJson,
  writeText,
} from "./support.ts";
import type {
  AdapterExecutionResult,
  ApprovalCardSnapshot,
  ApprovalDecisionReceipt,
  ApprovalRequestSnapshot,
  ChecksumRecord,
  ContractFreezeMetadata,
  JobManifest,
  JobManifestApprovalRecord,
  JobManifestPauseContext,
  JobManifestRunRecord,
  JobManifestStoryRecord,
  JobState,
  RunResult,
  RunEnvelope,
  RunExitStatus,
  RunRole,
  TaskPacket,
} from "../contracts/types.ts";

const BUILDER_EXPECTED_ARTIFACTS = [
  "logs/command-log.txt",
  "logs/worker.log",
  "metadata/task-packet.en.json",
  "metadata/timings.json",
  "metadata/run-result.json",
  "metadata/artifact-index.json",
  "reports/handoff.en.md",
  "reports/implementation-summary.en.md",
  "reports/self-check.en.md",
  "evidence/test-results/builder-check.json",
];

const BUILDER_VERIFICATION_TARGETS = [
  "logs/worker.log",
  "metadata/timings.json",
  "metadata/run-result.json",
  "metadata/artifact-index.json",
  "reports/handoff.en.md",
  "reports/implementation-summary.en.md",
  "reports/self-check.en.md",
];

const QA_EXPECTED_ARTIFACTS = [
  "logs/command-log.txt",
  "logs/worker.log",
  "metadata/task-packet.en.json",
  "metadata/timings.json",
  "metadata/run-result.json",
  "metadata/artifact-index.json",
  "metadata/qa-verdict.json",
  "reports/handoff.en.md",
  "reports/qa-report.en.md",
  "evidence/test-results/qa-check.json",
];

const QA_VERIFICATION_TARGETS = [
  "logs/worker.log",
  "metadata/timings.json",
  "metadata/run-result.json",
  "metadata/artifact-index.json",
  "metadata/qa-verdict.json",
  "reports/handoff.en.md",
  "reports/qa-report.en.md",
];

const DEPENDENCY_SNAPSHOT_INPUTS = ["package.json", "bun.lock", "pyproject.toml", "uv.lock"] as const;

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

async function loadApprovalDecision(repoRoot: string, card: ApprovalCardSnapshot): Promise<ApprovalDecisionReceipt> {
  const decision = await readJson<ApprovalDecisionReceipt>(
    join(repoRoot, "control", "fixtures", "phase1-local-approval-decision.json"),
  );
  if (decision.job_id !== card.job_id || decision.card_id !== card.card_id) {
    throw new Error("phase1 approval decision fixture does not match the plan approval card");
  }
  if (decision.card_state !== "DECIDED") {
    throw new Error("phase1 approval decision fixture must be decided before freeze generation");
  }
  return decision;
}

async function loadAdapterInfo(repoRoot: string): Promise<{ adapter_id: string; adapter_version: string }> {
  return readJson<{ adapter_id: string; adapter_version: string }>(join(repoRoot, "adapters", "generic-cli", "adapter.json"));
}

async function buildDependencySnapshotDigest(repoRoot: string): Promise<string> {
  const inputs: string[] = [];
  for (const relativePath of DEPENDENCY_SNAPSHOT_INPUTS) {
    const absolutePath = join(repoRoot, relativePath);
    if (await pathExists(absolutePath)) {
      inputs.push(`${relativePath}:${await sha256File(absolutePath)}`);
    }
  }
  if (inputs.length > 0) {
    return sha256Text(inputs.join("\n"));
  }
  return "absent";
}

async function assertFreshJobRoot(layout: ReturnType<typeof resolveJobRootLayout>): Promise<void> {
  if (!(await pathExists(layout.jobRoot))) {
    return;
  }
  const archivedFiles = await collectRelativeFiles(layout.jobRoot);
  if (archivedFiles.length === 0) {
    return;
  }
  const sample = archivedFiles.slice(0, 5).join(", ");
  throw new Error(
    `job root already contains archived files under jobs/${layout.jobId}/: ${sample}. remove the existing job root or use a new job_id/freeze_version before rerunning phase1`,
  );
}

async function buildTaskPacket(
  repoRoot: string,
  baseCommit: string,
  runRole: RunRole,
  runId: string,
  stateRoot: string,
  artifactRoot: string,
  runtimeHome: string,
  previousHandoffPath: string,
  persist = true,
): Promise<TaskPacket> {
  const taskPacketPath = join(artifactRoot, "metadata", "task-packet.en.json");
  const normalizedRepoRoot = toPosixPath(repoRoot);
  const normalizedStateRoot = toPosixPath(stateRoot);
  const normalizedArtifactRoot = toPosixPath(artifactRoot);
  const normalizedRuntimeHome = toPosixPath(runtimeHome);
  const normalizedPreviousHandoffPath = previousHandoffPath.length > 0 ? toPosixPath(previousHandoffPath) : "";
  const { expectedArtifacts, verificationTargets } = roleArtifacts(runRole);

  const packetWithoutChecksum = await materializeJsonTemplate<TaskPacket>(
    join(repoRoot, "control", "fixtures", "phase1-local-task-packet.en.json"),
    {
      __RUN_ROLE__: runRole,
      __RUN_ATTEMPT__: 1,
      __RUN_ID__: runId,
      __REPO_PATH__: normalizedRepoRoot,
      __BASE_COMMIT__: baseCommit,
      __STATE_PATH__: normalizedStateRoot,
      __ARTIFACT_PATH__: normalizedArtifactRoot,
      __RUNTIME_HOME__: normalizedRuntimeHome,
      __TASK_PACKET_SHA256__: "",
      __PREVIOUS_HANDOFF_PATH__: normalizedPreviousHandoffPath,
      __VERIFICATION_TARGETS__: verificationTargets,
      __EXPECTED_ARTIFACTS__: expectedArtifacts,
    },
  );

  const finalPacket: TaskPacket = {
    ...packetWithoutChecksum,
    task_packet_sha256: taskPacketDigest(packetWithoutChecksum),
  };
  if (persist) {
    await ensureDir(join(artifactRoot, "metadata"));
    await writeJson(taskPacketPath, finalPacket);
  }

  return finalPacket;
}

function taskPacketDigest(taskPacket: TaskPacket): string {
  return sha256Text(`${JSON.stringify({ ...taskPacket, task_packet_sha256: "" }, null, 2)}\n`);
}

async function buildRunEnvelope(
  repoRoot: string,
  taskPacket: TaskPacket,
  stateRoot: string,
  artifactRoot: string,
  runtimeHome: string,
  previousHandoffPath: string,
  approvalSnapshotPath: string,
  traceContext: Record<string, unknown>,
): Promise<RunEnvelope> {
  const normalizedRepoRoot = toPosixPath(repoRoot);
  const normalizedStateRoot = toPosixPath(stateRoot);
  const normalizedArtifactRoot = toPosixPath(artifactRoot);
  const normalizedRuntimeHome = toPosixPath(runtimeHome);
  const normalizedTaskPacketPath = toPosixPath(join(artifactRoot, "metadata", "task-packet.en.json"));
  const normalizedPreviousHandoffPath = previousHandoffPath.length > 0 ? toPosixPath(previousHandoffPath) : "";
  const normalizedApprovalSnapshotPath = toPosixPath(approvalSnapshotPath);
  const envelope = await materializeJsonTemplate<RunEnvelope>(
    join(repoRoot, "control", "fixtures", "phase1-local-run-envelope.json"),
    {
      __RUN_ID__: taskPacket.run_id,
      __RUN_ROLE__: taskPacket.run_role,
      __RUN_ATTEMPT__: taskPacket.run_attempt,
      __REPO_PATH__: normalizedRepoRoot,
      __BASE_COMMIT__: taskPacket.base_commit,
      __STATE_PATH__: normalizedStateRoot,
      __ARTIFACT_PATH__: normalizedArtifactRoot,
      __RUNTIME_HOME__: normalizedRuntimeHome,
      __TASK_PACKET_PATH__: normalizedTaskPacketPath,
      __TASK_PACKET_SHA256__: taskPacket.task_packet_sha256,
      __PREVIOUS_HANDOFF_PATH__: normalizedPreviousHandoffPath,
      __APPROVAL_SNAPSHOT_PATH__: normalizedApprovalSnapshotPath,
      __TRACE_CONTEXT__: traceContext,
    },
  );

  return {
    ...envelope,
    budget_limits: taskPacket.budget_limits,
    time_limits: taskPacket.time_limits,
    requested_capabilities: taskPacket.requested_capabilities,
    container_runtime: null,
  };
}

async function normalizeRunArtifacts(
  layout: ReturnType<typeof resolveJobRootLayout>,
  execution: AdapterExecutionResult,
): Promise<AdapterExecutionResult> {
  const runRootRelative = `artifacts/runs/${execution.runResult.run_id}`;
  const handoffRelative = `${runRootRelative}/reports/handoff.en.md`;
  const runResult = await readJson<RunResult>(execution.runResultPath);
  runResult.artifact_root = runRootRelative;
  await writeJson(execution.runResultPath, runResult);
  execution.runResult.artifact_root = runRootRelative;

  const handoffText = await readText(execution.handoffPath);
  const normalizedHandoff = handoffText.replace(/- archived handoff path: .*/u, `- archived handoff path: ${handoffRelative}`);
  await writeText(execution.handoffPath, normalizedHandoff);

  const commandLogPath = layout.relativeToJobRoot(execution.commandLogPath);
  if (!commandLogPath.startsWith(runRootRelative)) {
    throw new Error("run command log escaped the canonical job root");
  }
  const workerLogPath = layout.relativeToJobRoot(join(execution.runRoot, "logs", "worker.log"));
  if (!workerLogPath.startsWith(runRootRelative)) {
    throw new Error("run worker log escaped the canonical job root");
  }
  const timingsPath = layout.relativeToJobRoot(join(execution.runRoot, "metadata", "timings.json"));
  if (!timingsPath.startsWith(runRootRelative)) {
    throw new Error("run timings metadata escaped the canonical job root");
  }

  return execution;
}

function buildFreezeMetadata(
  taskPacket: TaskPacket,
  planPath: string,
  baseBranch: string,
  dependencySnapshotDigest: string,
  adapterInfo: { adapter_id: string; adapter_version: string },
  builderTaskPacket: TaskPacket,
  qaTaskPacket: TaskPacket,
  approvedAt: string,
): ContractFreezeMetadata {
  return {
    job_id: taskPacket.job_id,
    freeze_id: taskPacket.freeze_id,
    freeze_version: taskPacket.freeze_version,
    plan_path: planPath,
    base_branch: baseBranch,
    base_commit: taskPacket.base_commit,
    dependency_snapshot_digest: dependencySnapshotDigest,
    approved_adapters: [adapterInfo.adapter_id],
    approved_run_roles: ["builder", "qa"],
    adapter_versions: {
      [adapterInfo.adapter_id]: adapterInfo.adapter_version,
    },
    task_packet_digests: {
      [builderTaskPacket.run_id]: builderTaskPacket.task_packet_sha256,
      [qaTaskPacket.run_id]: qaTaskPacket.task_packet_sha256,
    },
    story_ids: [taskPacket.story.story_id],
    acceptance_ids: taskPacket.story.acceptance_ids,
    in_scope_items: taskPacket.story.in_scope_checklist,
    out_of_scope_items: taskPacket.story.out_of_scope_checklist,
    quality_bar: [
      "The canonical job bundle must contain the required governance, archive, and integrity files.",
      "The builder then QA flow must complete against the same approved story.",
      "State mirrors under state/ must reference the archived run handoff paths.",
    ],
    delivery_artifacts: uniqueStrings([
      "DEVELOPMENT_PLAN.en.md",
      "CONTRACT_FREEZE.en.md",
      "contract-freeze.json",
      "contract-freeze.sha256",
      "job-manifest.json",
      "checksums.txt",
      "approvals/<card_id>/approval-card.json",
      "approvals/<card_id>/decision.json",
      "approvals/<card_id>/summary.zh.md",
      "artifacts/final/final-summary.en.md",
      "artifacts/metadata/environment.json",
      ...BUILDER_EXPECTED_ARTIFACTS,
      ...QA_EXPECTED_ARTIFACTS,
    ]),
    language_policy: taskPacket.language_policy,
    budget_limits: taskPacket.budget_limits,
    time_limits: taskPacket.time_limits,
    approval_card_id: String(taskPacket.approval_context.approval_card_id),
    approved_at: approvedAt,
  };
}

function approvalRelativePaths(
  layout: ReturnType<typeof resolveJobRootLayout>,
  approvalRecord: Awaited<ReturnType<typeof writeApprovalArchive>>,
): string[] {
  const relativePaths = [
    layout.relativeToJobRoot(approvalRecord.snapshot_path),
    layout.relativeToJobRoot(approvalRecord.summary_path),
  ];
  if (approvalRecord.decision_path !== null) {
    relativePaths.push(layout.relativeToJobRoot(approvalRecord.decision_path));
  }
  return uniqueStrings(relativePaths);
}

function buildManifestApprovalRecord(
  layout: ReturnType<typeof resolveJobRootLayout>,
  approvalRecord: Awaited<ReturnType<typeof writeApprovalArchive>>,
): JobManifestApprovalRecord {
  return {
    card_id: approvalRecord.card_id,
    card_state: approvalRecord.card_state,
    card_type: approvalRecord.card_type,
    requested_action: approvalRecord.requested_action,
    decision: approvalRecord.decision,
    snapshot_path: layout.relativeToJobRoot(approvalRecord.snapshot_path),
    decision_path:
      approvalRecord.decision_path === null ? null : layout.relativeToJobRoot(approvalRecord.decision_path),
    summary_zh_ref: layout.relativeToJobRoot(approvalRecord.summary_path),
    decided_at: approvalRecord.decided_at,
    ...(approvalRecord.approval_request === null ? {} : { approval_request: approvalRecord.approval_request }),
  };
}

function buildManifestRunRecords(
  layout: ReturnType<typeof resolveJobRootLayout>,
  executions: AdapterExecutionResult[],
): JobManifestRunRecord[] {
  return executions.map((execution) => ({
    run_id: execution.runResult.run_id,
    run_role: execution.runResult.run_role,
    story_id: execution.runResult.story_id,
    run_exit_status: execution.runResult.status,
    root: `artifacts/runs/${execution.runResult.run_id}`,
    task_packet_path: layout.relativeToJobRoot(execution.taskPacketPath),
    run_result_path: layout.relativeToJobRoot(execution.runResultPath),
    artifact_index_path: layout.relativeToJobRoot(execution.artifactIndexPath),
    handoff_path: layout.relativeToJobRoot(execution.handoffPath),
    takeover_packet_path:
      execution.takeoverPacketPath === null ? null : layout.relativeToJobRoot(execution.takeoverPacketPath),
    started_at: execution.runResult.started_at,
    ended_at: execution.runResult.ended_at,
  }));
}

function buildManifestStoryRecord(
  taskPacket: TaskPacket,
  executions: AdapterExecutionResult[],
): JobManifestStoryRecord {
  if (executions.length === 0) {
    return {
      story_id: taskPacket.story.story_id,
      queue_state: "READY_TO_RUN",
      acceptance_ids: taskPacket.story.acceptance_ids,
      latest_run_id: "",
      latest_run_role: "builder",
      latest_run_status: "PENDING",
      latest_evidence_refs: [],
      last_updated_at: nowIso(),
    };
  }

  const latestExecution = executions[executions.length - 1];
  return {
    story_id: taskPacket.story.story_id,
    queue_state: mapRunExitToJobState(latestExecution.runResult.status, latestExecution.runResult.run_role),
    acceptance_ids: taskPacket.story.acceptance_ids,
    latest_run_id: latestExecution.runResult.run_id,
    latest_run_role: latestExecution.runResult.run_role,
    latest_run_status: latestExecution.runResult.status,
    latest_evidence_refs: latestExecution.workerOutput.evidence_paths.map(
      (path) => `artifacts/runs/${latestExecution.runResult.run_id}/${path}`,
    ),
    last_updated_at: latestExecution.runResult.ended_at,
  };
}

function emptyPauseContext(): JobManifestPauseContext {
  return {
    is_paused: false,
    pause_reason: null,
    waiting_on: null,
    resume_action: null,
    paused_at: null,
    related_card_id: null,
    expires_at: null,
  };
}

function waitingOnForState(state: JobState): string | null {
  if (state === "AWAITING_OWNER") {
    return "owner";
  }
  if (state === "AWAITING_TAKEOVER") {
    return "takeover";
  }
  return null;
}

function latestEvidencePath(execution: AdapterExecutionResult): string {
  const relativePath = execution.workerOutput.evidence_paths[0] ?? "reports/handoff.en.md";
  return `artifacts/runs/${execution.runResult.run_id}/${relativePath}`;
}

function recoveryRiskLevel(status: RunExitStatus): string {
  if (
    status === "FAILED_POLICY" ||
    status === "FAILED_EXECUTION" ||
    status === "FAILED_INFRA" ||
    status === "TIMEOUT" ||
    status === "BUDGET_EXCEEDED"
  ) {
    return "high";
  }
  return "medium";
}

function recoveryRequestedAction(status: RunExitStatus, resumeGate: "owner" | "takeover"): string {
  if (status === "AWAITING_APPROVAL") {
    return "Review the executor approval request before continuing.";
  }
  if (status === "AWAITING_CREDENTIALS") {
    return "Provide the required credential or choose an alternative before continuing.";
  }
  if (resumeGate === "takeover") {
    return "Review the blocked run and trigger takeover before continuing.";
  }
  return "Review the blocked run and decide how to resume the job.";
}

function recoveryCandidateActions(status: RunExitStatus, resumeGate: "owner" | "takeover"): string[] {
  if (status === "AWAITING_APPROVAL") {
    return ["approve requested action", "request revision", "trigger takeover"];
  }
  if (status === "AWAITING_CREDENTIALS") {
    return ["provide credentials", "request revision", "trigger takeover"];
  }
  if (resumeGate === "takeover") {
    return ["trigger takeover", "resume job", "request revision"];
  }
  return ["resume job", "request revision", "trigger takeover"];
}

function approvalRequestReason(execution: AdapterExecutionResult): string {
  const blocker = execution.workerOutput.blockers.find((value) => value.trim().length > 0);
  if (blocker !== undefined) {
    return blocker;
  }
  if (execution.workerOutput.next_action.trim().length > 0) {
    return execution.workerOutput.next_action;
  }
  return `worker reported ${execution.runResult.status}`;
}

function buildRecoveryApprovalRequest(
  taskPacket: TaskPacket,
  execution: AdapterExecutionResult,
  timeoutAt: string,
  riskLevel: string,
): ApprovalRequestSnapshot | null {
  if (execution.runResult.status === "AWAITING_APPROVAL") {
    return {
      request_id: `approval-request-${execution.runResult.run_id}`,
      job_id: taskPacket.job_id,
      story_id: taskPacket.story.story_id,
      run_id: execution.runResult.run_id,
      run_role: execution.runResult.run_role,
      action_summary: `${execution.runResult.run_role} requested owner approval before continuing.`,
      reason: approvalRequestReason(execution),
      risk_level: riskLevel,
      requested_capability: "interactive_approval",
      suggested_alternatives: ["request revision", "trigger takeover"],
      timeout_at: timeoutAt,
    };
  }
  if (execution.runResult.status === "AWAITING_CREDENTIALS") {
    return {
      request_id: `approval-request-${execution.runResult.run_id}`,
      job_id: taskPacket.job_id,
      story_id: taskPacket.story.story_id,
      run_id: execution.runResult.run_id,
      run_role: execution.runResult.run_role,
      action_summary: `${execution.runResult.run_role} requested credentials before continuing.`,
      reason: approvalRequestReason(execution),
      risk_level: riskLevel,
      requested_capability: "secret_injection",
      suggested_alternatives: ["continue without credentials", "request revision", "trigger takeover"],
      timeout_at: timeoutAt,
    };
  }
  return null;
}

function buildRecoveryCard(taskPacket: TaskPacket, execution: AdapterExecutionResult): ApprovalCardSnapshot {
  const jobState = mapRunExitToJobState(execution.runResult.status, execution.runResult.run_role);
  const resumeGate = jobState === "AWAITING_TAKEOVER" ? "takeover" : "owner";
  const latestEvidenceRef = latestEvidencePath(execution);
  const timeoutAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const riskLevel = recoveryRiskLevel(execution.runResult.status);
  const approvalRequest = buildRecoveryApprovalRequest(taskPacket, execution, timeoutAt, riskLevel);
  return {
    job_id: taskPacket.job_id,
    card_id: `card-recovery-${execution.runResult.run_id}`,
    card_state: "PENDING",
    card_type: "recovery",
    story_id: taskPacket.story.story_id,
    freeze_version: taskPacket.freeze_version,
    risk_level: riskLevel,
    summary_zh: `运行 ${execution.runResult.run_id} 已以 ${execution.runResult.status} 停止，当前故事需要${resumeGate === "takeover" ? "接管" : "人工决策"}后继续。`,
    requested_action: recoveryRequestedAction(execution.runResult.status, resumeGate),
    candidate_actions: recoveryCandidateActions(execution.runResult.status, resumeGate),
    timeout_at: timeoutAt,
    created_at: execution.runResult.ended_at,
    evidence_refs: uniqueStrings([
      latestEvidenceRef,
      `artifacts/runs/${execution.runResult.run_id}/metadata/run-result.json`,
      `artifacts/runs/${execution.runResult.run_id}/reports/handoff.en.md`,
    ]),
    ...(approvalRequest === null ? {} : { approval_request: approvalRequest }),
    recovery_context: {
      last_exit_reason: execution.runResult.status,
      current_freeze_version: taskPacket.freeze_version,
      current_story: taskPacket.story.story_id,
      latest_evidence_path: latestEvidenceRef,
      recommended_next_action: execution.workerOutput.next_action,
      resume_gate: resumeGate,
      paused_run_id: execution.runResult.run_id,
      paused_run_role: execution.runResult.run_role,
    },
  };
}

async function writeRecoveryTakeoverPacket(
  taskPacket: TaskPacket,
  execution: AdapterExecutionResult,
  approvalRecord: Awaited<ReturnType<typeof writeApprovalArchive>>,
): Promise<void> {
  const takeoverPacketPath = execution.takeoverPacketPath ?? join(execution.runRoot, "takeover", "takeover-packet.en.md");
  execution.takeoverPacketPath = takeoverPacketPath;
  await writeText(
    takeoverPacketPath,
    [
      "# Takeover Packet",
      "",
      "## Run Identity",
      "",
      `- job ID: ${taskPacket.job_id}`,
      `- run ID: ${execution.runResult.run_id}`,
      `- freeze version: ${taskPacket.freeze_version}`,
      `- story ID: ${taskPacket.story.story_id}`,
      `- triggering run role: ${execution.runResult.run_role}`,
      `- triggering exit status: ${execution.runResult.status}`,
      "",
      "## Blocked Step",
      "",
      `- exact blocked action: ${execution.workerOutput.open[0] ?? execution.workerOutput.next_action}`,
      `- reason automation cannot continue: ${approvalRequestReason(execution)}`,
      "- current page, tool, or environment when relevant: generic-cli worker container",
      "",
      "## Required Human Action",
      "",
      `- concrete human task: ${execution.workerOutput.next_action}`,
      "- allowed action boundary: stay inside the active story, freeze, and archived run root",
      "- forbidden actions: do not widen scope, rewrite approvals, or bypass evidence capture",
      "- expected completion signal: archive the takeover outcome under the same run_id takeover root",
      "",
      "## Access And Approval Context",
      "",
      `- approval card ID: ${approvalRecord.card_id}`,
      "- approved access method: governed local takeover",
      "- credential handling rule: do not place long-lived secrets in takeover artifacts",
      `- timeout or expiry condition: ${approvalRecord.timeout_at}`,
      "",
      "## Expected Result",
      "",
      `- expected output: ${execution.workerOutput.next_action}`,
      `- artifact destination: artifacts/runs/${execution.runResult.run_id}/takeover/result.en.md`,
      `- evidence destination: artifacts/runs/${execution.runResult.run_id}/takeover/result.en.md`,
      `- resume criteria: update pause context via ${approvalRecord.card_id} and reference the same run_id takeover root in the manifest`,
      "",
      "## Resume Notes",
      "",
      `- next loop role: ${execution.runResult.run_role}`,
      "- next command or check: review the archived takeover result and decide whether to resume or terminate",
      "- rollback instruction if the takeover fails: stop the job and return control to owner review",
      "",
    ].join("\n"),
  );
}

function buildPauseContext(
  execution: AdapterExecutionResult | null,
  approvalRecord: Awaited<ReturnType<typeof writeApprovalArchive>> | null,
): JobManifestPauseContext {
  if (execution === null) {
    return emptyPauseContext();
  }
  const jobState = mapRunExitToJobState(execution.runResult.status, execution.runResult.run_role);
  const waitingOn = waitingOnForState(jobState);
  if (waitingOn === null) {
    return emptyPauseContext();
  }
  return {
    is_paused: true,
    pause_reason: execution.runResult.status,
    waiting_on: approvalRecord?.waiting_on ?? waitingOn,
    resume_action: approvalRecord?.resume_action ?? execution.workerOutput.next_action,
    paused_at: execution.runResult.ended_at,
    related_card_id: approvalRecord?.card_id ?? null,
    expires_at: approvalRecord?.timeout_at ?? null,
  };
}

function buildRunRecoveryState(
  approvalRecord: Awaited<ReturnType<typeof writeApprovalArchive>> | null,
): { card_id: string; waiting_on: "owner" | "takeover"; resume_action: string } | null {
  if (approvalRecord === null || approvalRecord.waiting_on === null || approvalRecord.resume_action === null) {
    return null;
  }
  return {
    card_id: approvalRecord.card_id,
    waiting_on: approvalRecord.waiting_on,
    resume_action: approvalRecord.resume_action,
  };
}

function buildJobManifest(
  layout: ReturnType<typeof resolveJobRootLayout>,
  taskPacket: TaskPacket,
  baseBranch: string,
  planRecord: Awaited<ReturnType<typeof writeDevelopmentPlan>>,
  freezeRecord: Awaited<ReturnType<typeof writeContractFreeze>>,
  approvalRecord: Awaited<ReturnType<typeof writeApprovalArchive>>,
  approvalRecords: Array<Awaited<ReturnType<typeof writeApprovalArchive>>>,
  executions: AdapterExecutionResult[],
  adapterId: string,
): JobManifest {
  const runs = buildManifestRunRecords(layout, executions);
  const storyRecord = buildManifestStoryRecord(taskPacket, executions);
  const latestRunId = runs.length > 0 ? runs[runs.length - 1].run_id : "";
  const latestExecution = executions.length > 0 ? executions[executions.length - 1] : null;
  const latestApprovalRecord = approvalRecords.length > 0 ? approvalRecords[approvalRecords.length - 1] : null;
  const createdAt = approvalRecord.decided_at ?? nowIso();
  const updatedAt = executions.length > 0 ? executions[executions.length - 1].runResult.ended_at : nowIso();
  const status = storyRecord.queue_state;

  return {
    job_id: taskPacket.job_id,
    project_id: "codingclaw-phase1",
    created_at: createdAt,
    updated_at: updatedAt,
    owner_channel: "local-fixture",
    status,
    current_freeze_version: taskPacket.freeze_version,
    base_branch: baseBranch,
    base_commit: taskPacket.base_commit,
    active_story_id: taskPacket.story.story_id,
    current_run_id: latestRunId,
    approved_adapter_set: [adapterId],
    pause_context: buildPauseContext(latestExecution, latestApprovalRecord),
    language_policy: taskPacket.language_policy,
    budget_limits: taskPacket.budget_limits,
    time_limits: taskPacket.time_limits,
    repo_root: "repo",
    state_root: "state",
    approvals_root: "approvals",
    artifact_root: "artifacts",
    checksum_file: "checksums.txt",
    plan: {
      path: layout.relativeToJobRoot(planRecord.path),
      checksum: planRecord.checksum,
      approval_card_id: approvalRecord.card_id,
      summary_zh_ref: layout.relativeToJobRoot(approvalRecord.summary_path),
      approval_state: approvalRecord.card_state,
      approved_at: approvalRecord.decided_at ?? createdAt,
    },
    freeze: {
      freeze_id: taskPacket.freeze_id,
      version: taskPacket.freeze_version,
      path: layout.relativeToJobRoot(freezeRecord.path),
      json_path: layout.relativeToJobRoot(freezeRecord.json_path),
      checksum_path: layout.relativeToJobRoot(freezeRecord.checksum_path),
      hash: freezeRecord.hash,
      approval_card_id: approvalRecord.card_id,
      approved_at: approvalRecord.decided_at ?? createdAt,
    },
    stories: [storyRecord],
    runs,
    approvals: approvalRecords.map((record) => buildManifestApprovalRecord(layout, record)),
    artifacts: {
      runs_root: "artifacts/runs",
      sessions_root: "artifacts/sessions",
      final_root: "artifacts/final",
      shared_metadata_refs: uniqueStrings([
        layout.relativeToJobRoot(planRecord.path),
        layout.relativeToJobRoot(freezeRecord.path),
        layout.relativeToJobRoot(freezeRecord.json_path),
        layout.relativeToJobRoot(freezeRecord.checksum_path),
        ...approvalRecords.flatMap((record) => approvalRelativePaths(layout, record)),
        "job-manifest.json",
        "checksums.txt",
      ]),
      latest_final_summary: null,
    },
  };
}

function setJobManifestStatus(manifest: JobManifest, status: JobState): JobManifest {
  const updatedAt = nowIso();
  return {
    ...manifest,
    status,
    updated_at: updatedAt,
    stories: manifest.stories.map((story) => ({
      ...story,
      queue_state: status,
      last_updated_at: updatedAt,
    })),
  };
}

function formatChecksumVerificationFailure(
  context: string,
  verification: Awaited<ReturnType<typeof verifyChecksumFile>>,
): string {
  const details = [...verification.format_errors, ...verification.invalid_paths];
  return details.length > 0 ? `${context}: ${details.join(", ")}` : context;
}

async function failIntegrityCheck(
  layout: ReturnType<typeof resolveJobRootLayout>,
  stateStore: StateStore,
  manifest: JobManifest,
  taskPacket: TaskPacket,
  reason: string,
): Promise<never> {
  await writeJobManifest(layout.manifestPath, setJobManifestStatus(manifest, "INTEGRITY_FAILED"));
  await stateStore.recordIntegrityFailure(taskPacket, reason);
  throw new Error(reason);
}

async function buildChecksumRecords(
  layout: ReturnType<typeof resolveJobRootLayout>,
  planRecord: Awaited<ReturnType<typeof writeDevelopmentPlan>>,
  freezeRecord: Awaited<ReturnType<typeof writeContractFreeze>>,
  approvalRecords: Array<Awaited<ReturnType<typeof writeApprovalArchive>>>,
  executions: AdapterExecutionResult[],
  extraRelativePaths: string[] = [],
): Promise<ChecksumRecord[]> {
  const runRelativePaths: string[] = [];
  for (const execution of executions) {
    const runRootRelative = layout.relativeToJobRoot(execution.runRoot);
    const files = await collectRelativeFiles(execution.runRoot);
    for (const file of files) {
      runRelativePaths.push(`${runRootRelative}/${file}`);
    }
  }

  const relativePaths = uniqueStrings([
    layout.relativeToJobRoot(planRecord.path),
    layout.relativeToJobRoot(freezeRecord.path),
    layout.relativeToJobRoot(freezeRecord.json_path),
    layout.relativeToJobRoot(freezeRecord.checksum_path),
    ...approvalRecords.flatMap((record) => approvalRelativePaths(layout, record)),
    "job-manifest.json",
    ...runRelativePaths,
    ...extraRelativePaths,
  ]);

  return createChecksumRecords(layout.jobRoot, relativePaths);
}

export interface Phase1RunSummary {
  job_id: string;
  job_root: string;
  builder_run_id: string;
  qa_run_id: string | null;
  builder_status: string;
  qa_status: string | null;
  manifest_path: string;
  checksums_path: string;
}

export async function runPhase1Local(repoRoot: string): Promise<Phase1RunSummary> {
  const adapterInfo = await loadAdapterInfo(repoRoot);
  const baseBranch = detectBaseBranch(repoRoot);
  const baseCommit = detectBaseCommit(repoRoot);
  const approvalCard = await readJson<ApprovalCardSnapshot>(
    join(repoRoot, "control", "fixtures", "phase1-local-approval-card.json"),
  );
  const layout = resolveJobRootLayout(repoRoot, approvalCard.job_id);
  await assertFreshJobRoot(layout);
  await ensureJobRootLayout(layout);

  const builderRunId = createRunId("builder");
  const qaRunId = createRunId("qa");
  const builderRunRoot = layout.runRoot(builderRunId);
  const qaRunRoot = layout.runRoot(qaRunId);
  const builderPreviousHandoffPath = "";
  const qaPreviousHandoffPath = join(builderRunRoot, "reports", "handoff.en.md");

  const builderTaskPacket = await buildTaskPacket(
    repoRoot,
    baseCommit,
    "builder",
    builderRunId,
    layout.archiveStateRoot,
    builderRunRoot,
    layout.runtimeHomeRoot,
    builderPreviousHandoffPath,
  );
  const qaTaskPacketPreview = await buildTaskPacket(
    repoRoot,
    baseCommit,
    "qa",
    qaRunId,
    layout.archiveStateRoot,
    qaRunRoot,
    layout.runtimeHomeRoot,
    qaPreviousHandoffPath,
  );

  const allExpectedArtifacts = uniqueStrings([
    ...builderTaskPacket.story.expected_artifacts,
    ...qaTaskPacketPreview.story.expected_artifacts,
    "artifacts/final/final-summary.en.md",
    "artifacts/metadata/environment.json",
  ]);
  const dependencySnapshotDigest = await buildDependencySnapshotDigest(repoRoot);
  const planRecord = await writeDevelopmentPlan(layout.planPath, {
    planId: `plan-${builderTaskPacket.job_id}`,
    jobId: builderTaskPacket.job_id,
    preparedAt: approvalCard.created_at,
    preparedBy: "phase1-local-fixture",
    baseBranch,
    baseCommit,
    adapters: [adapterInfo.adapter_id],
    runRoles: ["builder", "qa"],
    architectureDirection: [
      "Use one canonical job root under jobs/<job_id>/ for governance, approvals, state, runtime-home, and run bundles.",
      "Preserve the existing builder to QA worker order and local generic CLI adapter.",
      "Mirror the latest canonical state files into state/ for control-shell recovery.",
    ],
    milestones: [
      "Write the fixed plan and approval archive.",
      "Generate the contract freeze and checksum outputs before execution.",
      "Run builder then QA and archive both run bundles under artifacts/runs/<run_id>/.",
      "Finalize the archive with environment metadata, final summary, job-manifest.json, and checksums.txt.",
    ],
    storyId: builderTaskPacket.story.story_id,
    storyObjective: builderTaskPacket.story.story_objective,
    acceptanceIds: builderTaskPacket.story.acceptance_ids,
    inScopeItems: builderTaskPacket.story.in_scope_checklist,
    outOfScopeItems: builderTaskPacket.story.out_of_scope_checklist,
    mandatoryChecks: builderTaskPacket.story.mandatory_checks,
    expectedArtifacts: allExpectedArtifacts,
    risks: [
      "The canonical handoff path must remain relative to the job root even though the worker adapter writes from the repository root.",
      "Checksums must be regenerated after the final summary, environment snapshot, manifest, and run bundles stabilize.",
    ],
    openQuestions: ["none"],
    approvalRequested: approvalCard.requested_action,
  });
  const decision = await loadApprovalDecision(repoRoot, approvalCard);
  const approvalRecord = await writeApprovalArchive(layout.approvalRoot(approvalCard.card_id), approvalCard, decision);
  if (approvalRecord.decision_path === null || approvalRecord.decided_at === null) {
    throw new Error("phase1 fixture approval must be decided before freeze generation");
  }
  if (decision.decision !== "approve") {
    throw new Error("phase1 local execution requires an approved Development Plan before freeze generation");
  }
  const approvalRecords: Array<Awaited<ReturnType<typeof writeApprovalArchive>>> = [approvalRecord];

  const freezeRecord = await writeContractFreeze(layout.freezePath, layout.freezeJsonPath, {
    metadata: buildFreezeMetadata(
      builderTaskPacket,
      layout.relativeToJobRoot(planRecord.path),
      baseBranch,
      dependencySnapshotDigest,
      adapterInfo,
      builderTaskPacket,
      qaTaskPacketPreview,
      decision.decided_at,
    ),
    approvalSnapshotPath: layout.relativeToJobRoot(approvalRecord.snapshot_path),
    approvalDecisionPath: layout.relativeToJobRoot(approvalRecord.decision_path),
    freezeJsonPath: layout.relativeToJobRoot(layout.freezeJsonPath),
    freezeChecksumPath: layout.relativeToJobRoot(layout.freezeChecksumPath),
  });
  freezeRecord.checksum_path = layout.freezeChecksumPath;

  await writeChecksumFile(layout.freezeChecksumPath, [
    {
      algorithm: "sha256",
      path: layout.relativeToJobRoot(layout.freezeJsonPath),
      hash: freezeRecord.hash,
    },
  ]);

  const adapter = new GenericCliAdapter(repoRoot);
  const stateStore = new StateStore(repoRoot, {
    archiveStateRoot: layout.archiveStateRoot,
    liveStateRoot: layout.liveStateRoot,
  });

  await stateStore.bootstrap(builderTaskPacket);

  const executions: AdapterExecutionResult[] = [];
  await stateStore.prepareRun(builderTaskPacket);
  const builderEnvelope = await buildRunEnvelope(
    repoRoot,
    builderTaskPacket,
    layout.archiveStateRoot,
    builderRunRoot,
    layout.runtimeHomeRoot,
    builderPreviousHandoffPath,
    approvalRecord.snapshot_path,
    {
      trace_index_path: stateStore.getTraceIndexPath(),
      builder_run_root: "",
      builder_run_result_path: "",
      builder_artifact_index_path: "",
    },
  );
  const builderExecution = await normalizeRunArtifacts(layout, await adapter.execute(builderEnvelope));
  executions.push(builderExecution);
  let builderRecoveryRecord: Awaited<ReturnType<typeof writeApprovalArchive>> | null = null;
  const builderJobState = mapRunExitToJobState(builderExecution.runResult.status, builderExecution.runResult.run_role);
  if (builderJobState === "AWAITING_OWNER" || builderJobState === "AWAITING_TAKEOVER") {
    const recoveryCard = buildRecoveryCard(builderTaskPacket, builderExecution);
    builderRecoveryRecord = await writeApprovalArchive(layout.approvalRoot(recoveryCard.card_id), recoveryCard, null);
    if (builderJobState === "AWAITING_TAKEOVER") {
      await writeRecoveryTakeoverPacket(builderTaskPacket, builderExecution, builderRecoveryRecord);
    }
    approvalRecords.push(builderRecoveryRecord);
  }
  await stateStore.recordRun(builderTaskPacket, builderExecution, buildRunRecoveryState(builderRecoveryRecord));

  const builderManifest = buildJobManifest(
    layout,
    builderTaskPacket,
    baseBranch,
    planRecord,
    freezeRecord,
    approvalRecord,
    approvalRecords,
    executions,
    adapterInfo.adapter_id,
  );
  await writeJobManifest(layout.manifestPath, builderManifest);

  let qaTaskPacket: TaskPacket | null = null;
  let qaExecution: AdapterExecutionResult | null = null;
  let manifestForChecksums = builderManifest;
  let latestTaskPacketForIntegrity = builderTaskPacket;
  const extraChecksumPaths: string[] = [];
  if (builderExecution.runResult.status === "SUCCESS") {
    qaTaskPacket = await buildTaskPacket(
      repoRoot,
      baseCommit,
      "qa",
      qaRunId,
      layout.archiveStateRoot,
      qaRunRoot,
      layout.runtimeHomeRoot,
      qaPreviousHandoffPath,
    );
    latestTaskPacketForIntegrity = qaTaskPacket;
    await stateStore.prepareRun(qaTaskPacket);
    const qaEnvelope = await buildRunEnvelope(
      repoRoot,
      qaTaskPacket,
      layout.archiveStateRoot,
      qaRunRoot,
      layout.runtimeHomeRoot,
      qaPreviousHandoffPath,
      approvalRecord.snapshot_path,
      {
        trace_index_path: stateStore.getTraceIndexPath(),
        builder_run_root: builderExecution.runRoot,
        builder_run_result_path: builderExecution.runResultPath,
        builder_artifact_index_path: builderExecution.artifactIndexPath,
      },
    );
    qaExecution = await normalizeRunArtifacts(layout, await adapter.execute(qaEnvelope));
    executions.push(qaExecution);
    let qaRecoveryRecord: Awaited<ReturnType<typeof writeApprovalArchive>> | null = null;
    const qaJobState = mapRunExitToJobState(qaExecution.runResult.status, qaExecution.runResult.run_role);
    if (qaJobState === "AWAITING_OWNER" || qaJobState === "AWAITING_TAKEOVER") {
      const recoveryCard = buildRecoveryCard(qaTaskPacket, qaExecution);
      qaRecoveryRecord = await writeApprovalArchive(layout.approvalRoot(recoveryCard.card_id), recoveryCard, null);
      if (qaJobState === "AWAITING_TAKEOVER") {
        await writeRecoveryTakeoverPacket(qaTaskPacket, qaExecution, qaRecoveryRecord);
      }
      approvalRecords.push(qaRecoveryRecord);
    }
    await stateStore.recordRun(qaTaskPacket, qaExecution, buildRunRecoveryState(qaRecoveryRecord));

    const finalManifest = buildJobManifest(
      layout,
      qaTaskPacket,
      baseBranch,
      planRecord,
      freezeRecord,
      approvalRecord,
      approvalRecords,
      executions,
      adapterInfo.adapter_id,
    );
    manifestForChecksums = finalManifest;
    await writeJobManifest(layout.manifestPath, finalManifest);

    if (qaExecution.runResult.status === "SUCCESS") {
      const completedAt = nowIso();
      const finalization = await finalizeArchive({
        layout,
        manifest: finalManifest,
        environment: buildEnvironmentSnapshotMetadata(layout, finalManifest),
        finalSummary: buildFinalSummaryMetadata(layout, qaTaskPacket, finalManifest, executions, completedAt),
      });
      manifestForChecksums = finalization.manifest;
      extraChecksumPaths.push(finalization.environment_path, finalization.final_summary_path);
      await writeJobManifest(layout.manifestPath, manifestForChecksums);
      await stateStore.recordArchiveFinalization(
        qaTaskPacket,
        qaExecution.runResult.run_id,
        qaExecution.runResult.run_role,
        finalization.final_summary_path,
      );
    }
  } else {
    extraChecksumPaths.push(layout.relativeToJobRoot(join(qaRunRoot, "metadata", "task-packet.en.json")));
  }

  const checksumRecords = await buildChecksumRecords(
    layout,
    planRecord,
    freezeRecord,
    approvalRecords,
    executions,
    extraChecksumPaths,
  );
  await writeChecksumFile(layout.checksumsPath, checksumRecords);

  const freezeVerification = await verifyChecksumFile(layout.jobRoot, layout.freezeChecksumPath);
  if (!freezeVerification.ok) {
    await failIntegrityCheck(
      layout,
      stateStore,
      manifestForChecksums,
      latestTaskPacketForIntegrity,
      formatChecksumVerificationFailure("freeze checksum verification failed", freezeVerification),
    );
  }

  const checksumVerification = await verifyChecksumFile(layout.jobRoot, layout.checksumsPath);
  if (!checksumVerification.ok) {
    await failIntegrityCheck(
      layout,
      stateStore,
      manifestForChecksums,
      latestTaskPacketForIntegrity,
      formatChecksumVerificationFailure("job checksum verification failed", checksumVerification),
    );
  }

  return {
    job_id: builderTaskPacket.job_id,
    job_root: layout.jobRoot,
    builder_run_id: builderExecution.runResult.run_id,
    qa_run_id: qaExecution?.runResult.run_id ?? null,
    builder_status: builderExecution.runResult.status,
    qa_status: qaExecution?.runResult.status ?? null,
    manifest_path: layout.manifestPath,
    checksums_path: layout.checksumsPath,
  };
}
