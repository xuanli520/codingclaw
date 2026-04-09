import { join } from "node:path";
import { GenericCliAdapter } from "../../adapters/generic-cli/adapter.ts";
import { writeApprovalArchive } from "../../ops/archive/approvals.ts";
import { writeContractFreeze } from "../../ops/archive/freeze.ts";
import { ensureJobRootLayout, resolveJobRootLayout } from "../../ops/archive/job-root.ts";
import { writeJobManifest } from "../../ops/archive/manifest.ts";
import { writeDevelopmentPlan } from "../../ops/archive/plan.ts";
import { verifyChecksumFile, writeChecksumFile, sha256File } from "../../ops/checksums/sha256.ts";
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
  uniqueStrings,
  writeJson,
  writeText,
} from "./support.ts";
import type {
  AdapterExecutionResult,
  ApprovalCardSnapshot,
  ApprovalDecisionReceipt,
  ChecksumRecord,
  ContractFreezeMetadata,
  JobManifest,
  JobManifestApprovalRecord,
  JobManifestRunRecord,
  JobManifestStoryRecord,
  JobState,
  RunResult,
  RunEnvelope,
  RunRole,
  TaskPacket,
} from "../contracts/types.ts";

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

function buildApprovalDecision(card: ApprovalCardSnapshot): ApprovalDecisionReceipt {
  return {
    job_id: card.job_id,
    card_id: card.card_id,
    card_type: card.card_type,
    story_id: card.story_id,
    freeze_version: card.freeze_version,
    decision: "approve",
    actor: "local-owner",
    decided_at: "2026-04-08T00:00:00Z",
    card_state: "DECIDED",
    requested_action: card.requested_action,
  };
}

async function loadAdapterInfo(repoRoot: string): Promise<{ adapter_id: string; adapter_version: string }> {
  return readJson<{ adapter_id: string; adapter_version: string }>(join(repoRoot, "adapters", "generic-cli", "adapter.json"));
}

async function buildDependencySnapshotDigest(repoRoot: string): Promise<string> {
  const packageJsonPath = join(repoRoot, "package.json");
  if (await pathExists(packageJsonPath)) {
    return sha256File(packageJsonPath);
  }
  return "absent";
}

async function buildTaskPacket(
  repoRoot: string,
  runRole: RunRole,
  runId: string,
  stateRoot: string,
  artifactRoot: string,
  runtimeHome: string,
  previousHandoffPath: string,
): Promise<TaskPacket> {
  const taskPacketPath = join(artifactRoot, "metadata", "task-packet.en.json");
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
      __STATE_PATH__: stateRoot,
      __ARTIFACT_PATH__: artifactRoot,
      __RUNTIME_HOME__: runtimeHome,
      __TASK_PACKET_SHA256__: "",
      __PREVIOUS_HANDOFF_PATH__: previousHandoffPath,
      __VERIFICATION_TARGETS__: verificationTargets,
      __EXPECTED_ARTIFACTS__: expectedArtifacts,
    },
  );

  await ensureDir(join(artifactRoot, "metadata"));
  const finalPacket: TaskPacket = {
    ...packetWithoutChecksum,
    task_packet_sha256: taskPacketDigest(packetWithoutChecksum),
  };
  await writeJson(taskPacketPath, finalPacket);

  return finalPacket;
}

function taskPacketDigest(taskPacket: TaskPacket): string {
  return sha256Text(`${JSON.stringify({ ...taskPacket, task_packet_sha256: "" }, null, 2)}\n`);
}

async function buildRunEnvelope(
  repoRoot: string,
  taskPacket: TaskPacket,
  previousHandoffPath: string,
  approvalSnapshotPath: string,
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
      __APPROVAL_SNAPSHOT_PATH__: approvalSnapshotPath,
      __TRACE_CONTEXT__: traceContext,
    },
  );
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
    decision_path: layout.relativeToJobRoot(approvalRecord.decision_path),
    summary_zh_ref: layout.relativeToJobRoot(approvalRecord.summary_path),
    decided_at: approvalRecord.decided_at,
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
    takeover_packet_path: null,
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

function buildJobManifest(
  layout: ReturnType<typeof resolveJobRootLayout>,
  taskPacket: TaskPacket,
  baseBranch: string,
  planRecord: Awaited<ReturnType<typeof writeDevelopmentPlan>>,
  freezeRecord: Awaited<ReturnType<typeof writeContractFreeze>>,
  approvalRecord: Awaited<ReturnType<typeof writeApprovalArchive>>,
  executions: AdapterExecutionResult[],
  adapterId: string,
): JobManifest {
  const runs = buildManifestRunRecords(layout, executions);
  const storyRecord = buildManifestStoryRecord(taskPacket, executions);
  const latestRunId = runs.length > 0 ? runs[runs.length - 1].run_id : "";
  const createdAt = approvalRecord.decided_at;
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
    pause_context: {
      is_paused: false,
      pause_reason: null,
      waiting_on: null,
      resume_action: null,
      paused_at: null,
      related_card_id: null,
      expires_at: null,
    },
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
      approved_at: approvalRecord.decided_at,
    },
    freeze: {
      freeze_id: taskPacket.freeze_id,
      version: taskPacket.freeze_version,
      path: layout.relativeToJobRoot(freezeRecord.path),
      json_path: layout.relativeToJobRoot(freezeRecord.json_path),
      checksum_path: layout.relativeToJobRoot(freezeRecord.checksum_path),
      hash: freezeRecord.hash,
      approval_card_id: approvalRecord.card_id,
      approved_at: approvalRecord.decided_at,
    },
    stories: [storyRecord],
    runs,
    approvals: [buildManifestApprovalRecord(layout, approvalRecord)],
    artifacts: {
      runs_root: "artifacts/runs",
      sessions_root: "artifacts/sessions",
      final_root: "artifacts/final",
      shared_metadata_refs: uniqueStrings([
        layout.relativeToJobRoot(planRecord.path),
        layout.relativeToJobRoot(freezeRecord.path),
        layout.relativeToJobRoot(freezeRecord.json_path),
        layout.relativeToJobRoot(freezeRecord.checksum_path),
        layout.relativeToJobRoot(approvalRecord.snapshot_path),
        layout.relativeToJobRoot(approvalRecord.decision_path),
        layout.relativeToJobRoot(approvalRecord.summary_path),
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
  approvalRecord: Awaited<ReturnType<typeof writeApprovalArchive>>,
  executions: AdapterExecutionResult[],
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
    layout.relativeToJobRoot(approvalRecord.snapshot_path),
    layout.relativeToJobRoot(approvalRecord.decision_path),
    layout.relativeToJobRoot(approvalRecord.summary_path),
    "job-manifest.json",
    ...runRelativePaths,
  ]);

  const records: ChecksumRecord[] = [];
  for (const relativePath of relativePaths) {
    records.push({
      algorithm: "sha256",
      path: relativePath,
      hash: await sha256File(join(layout.jobRoot, relativePath)),
    });
  }
  return records;
}

export interface Phase1RunSummary {
  job_id: string;
  job_root: string;
  builder_run_id: string;
  qa_run_id: string;
  builder_status: string;
  qa_status: string;
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
  const decision = buildApprovalDecision(approvalCard);
  const layout = resolveJobRootLayout(repoRoot, approvalCard.job_id);
  await ensureJobRootLayout(layout);

  const builderRunId = createRunId("builder");
  const qaRunId = createRunId("qa");
  const builderRunRoot = layout.runRoot(builderRunId);
  const qaRunRoot = layout.runRoot(qaRunId);
  const builderPreviousHandoffPath = "";
  const qaPreviousHandoffPath = join(builderRunRoot, "reports", "handoff.en.md");

  const builderTaskPacket = await buildTaskPacket(
    repoRoot,
    "builder",
    builderRunId,
    layout.archiveStateRoot,
    builderRunRoot,
    layout.runtimeHomeRoot,
    builderPreviousHandoffPath,
  );
  const qaTaskPacket = await buildTaskPacket(
    repoRoot,
    "qa",
    qaRunId,
    layout.archiveStateRoot,
    qaRunRoot,
    layout.runtimeHomeRoot,
    qaPreviousHandoffPath,
  );

  const approvalRecord = await writeApprovalArchive(layout.approvalRoot(approvalCard.card_id), approvalCard, decision);
  const allExpectedArtifacts = uniqueStrings([
    ...builderTaskPacket.story.expected_artifacts,
    ...qaTaskPacket.story.expected_artifacts,
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
      "Write job-manifest.json and checksums.txt for the complete fixed local job bundle.",
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
      "Checksums must be regenerated after the manifest and run bundles stabilize.",
    ],
    openQuestions: ["none"],
    approvalRequested: approvalCard.requested_action,
  });

  const freezeRecord = await writeContractFreeze(layout.freezePath, layout.freezeJsonPath, {
    metadata: buildFreezeMetadata(
      builderTaskPacket,
      layout.relativeToJobRoot(planRecord.path),
      baseBranch,
      dependencySnapshotDigest,
      adapterInfo,
      builderTaskPacket,
      qaTaskPacket,
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
  await stateStore.recordRun(builderTaskPacket, builderExecution);

  const builderManifest = buildJobManifest(
    layout,
    builderTaskPacket,
    baseBranch,
    planRecord,
    freezeRecord,
    approvalRecord,
    executions,
    adapterInfo.adapter_id,
  );
  await writeJobManifest(layout.manifestPath, builderManifest);

  await stateStore.prepareRun(qaTaskPacket);
  const qaEnvelope = await buildRunEnvelope(
    repoRoot,
    qaTaskPacket,
    qaPreviousHandoffPath,
    approvalRecord.snapshot_path,
    {
      trace_index_path: stateStore.getTraceIndexPath(),
      builder_run_root: builderExecution.runRoot,
      builder_run_result_path: builderExecution.runResultPath,
      builder_artifact_index_path: builderExecution.artifactIndexPath,
    },
  );
  const qaExecution = await normalizeRunArtifacts(layout, await adapter.execute(qaEnvelope));
  executions.push(qaExecution);
  await stateStore.recordRun(qaTaskPacket, qaExecution);

  const finalManifest = buildJobManifest(
    layout,
    qaTaskPacket,
    baseBranch,
    planRecord,
    freezeRecord,
    approvalRecord,
    executions,
    adapterInfo.adapter_id,
  );
  await writeJobManifest(layout.manifestPath, finalManifest);

  const checksumRecords = await buildChecksumRecords(layout, planRecord, freezeRecord, approvalRecord, executions);
  await writeChecksumFile(layout.checksumsPath, checksumRecords);

  const freezeVerification = await verifyChecksumFile(layout.jobRoot, layout.freezeChecksumPath);
  if (!freezeVerification.ok) {
    await failIntegrityCheck(
      layout,
      stateStore,
      finalManifest,
      qaTaskPacket,
      formatChecksumVerificationFailure("freeze checksum verification failed", freezeVerification),
    );
  }

  const checksumVerification = await verifyChecksumFile(layout.jobRoot, layout.checksumsPath);
  if (!checksumVerification.ok) {
    await failIntegrityCheck(
      layout,
      stateStore,
      finalManifest,
      qaTaskPacket,
      formatChecksumVerificationFailure("job checksum verification failed", checksumVerification),
    );
  }

  return {
    job_id: builderTaskPacket.job_id,
    job_root: layout.jobRoot,
    builder_run_id: builderExecution.runResult.run_id,
    qa_run_id: qaExecution.runResult.run_id,
    builder_status: builderExecution.runResult.status,
    qa_status: qaExecution.runResult.status,
    manifest_path: layout.manifestPath,
    checksums_path: layout.checksumsPath,
  };
}
