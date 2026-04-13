export const RUN_ROLES = ["builder", "qa", "review"] as const;

export type RunRole = (typeof RUN_ROLES)[number];

export const RUN_EXIT_STATUSES = [
  "SUCCESS",
  "FIXBACK_REQUIRED",
  "CHANGE_REQUEST_REQUIRED",
  "AWAITING_APPROVAL",
  "AWAITING_CREDENTIALS",
  "AWAITING_TAKEOVER",
  "FAILED_POLICY",
  "FAILED_EXECUTION",
  "FAILED_INFRA",
  "TIMEOUT",
  "BUDGET_EXCEEDED",
] as const;

export type RunExitStatus = (typeof RUN_EXIT_STATUSES)[number];

export const JOB_STATES = [
  "DRAFT",
  "AWAITING_OWNER",
  "READY_TO_FREEZE",
  "READY_TO_RUN",
  "RUNNING_BUILDER",
  "RUNNING_QA",
  "RUNNING_REVIEW",
  "FIXBACK_PENDING",
  "AWAITING_TAKEOVER",
  "CHANGE_REQUEST_PENDING",
  "ARCHIVE_PENDING",
  "COMPLETED",
  "TERMINATED_WITH_RISK_REPORT",
  "INTEGRITY_FAILED",
] as const;

export type JobState = (typeof JOB_STATES)[number];

export const APPROVAL_CARD_STATES = ["PENDING", "DECIDED", "EXPIRED", "CANCELLED"] as const;

export type ApprovalCardState = (typeof APPROVAL_CARD_STATES)[number];

export type TraceState = "pass" | "fail" | "blocked";

export interface StoryContract {
  story_id: string;
  story_objective: string;
  acceptance_ids: string[];
  in_scope_checklist: string[];
  out_of_scope_checklist: string[];
  acceptance_criteria: string[];
  mandatory_checks: string[];
  verification_targets: string[];
  expected_artifacts: string[];
  stop_conditions: string[];
  escalation_rules: string[];
}

export interface CredentialInjectionRequest {
  secret_handle: string;
  credential_alias: string;
  allowed_host_patterns: string[];
  injection_mode: "env";
}

export interface TaskPacket {
  job_id: string;
  freeze_id: string;
  freeze_version: string;
  story_id: string;
  run_role: RunRole;
  run_attempt: number;
  run_id: string;
  repo_path: string;
  base_commit: string;
  state_path: string;
  artifact_path: string;
  runtime_home: string;
  task_packet_sha256: string;
  language_policy: string;
  budget_limits: Record<string, unknown>;
  time_limits: Record<string, unknown>;
  policy_profile: Record<string, unknown>;
  risk_context: Record<string, unknown>;
  approval_context: Record<string, unknown>;
  previous_handoff_path: string;
  requested_capabilities: string[];
  credential_injection_requests?: CredentialInjectionRequest[];
  story: StoryContract;
}

export type ContainerMountName =
  | "repo"
  | "repo-job-root"
  | "state"
  | "artifacts"
  | "run-artifacts"
  | "repo-run-artifacts"
  | "task-packet"
  | "repo-task-packet"
  | "runtime-home"
  | "repo-runtime-home"
  | "cache";

export interface ContainerPathMount {
  name: ContainerMountName;
  host_path: string;
  container_path: string;
  read_only: boolean;
}

export interface ContainerPathMap {
  repo_path: string;
  state_path: string;
  artifact_path: string;
  runtime_home: string;
  task_packet_path: string;
  previous_handoff_path: string;
  approval_snapshot_path: string;
  trace_context: Record<string, unknown>;
}

export interface ContainerRuntimeConfig {
  runtime: "docker";
  image: string;
  workdir: string;
  envelope_host_path: string;
  envelope_container_path: string;
  mounts: ContainerPathMount[];
  container_paths: ContainerPathMap;
}

export interface RunEnvelope {
  job_id: string;
  freeze_id: string;
  freeze_version: string;
  story_id: string;
  run_id: string;
  run_role: RunRole;
  run_attempt: number;
  repo_path: string;
  base_commit: string;
  state_path: string;
  artifact_path: string;
  runtime_home: string;
  task_packet_path: string;
  task_packet_sha256: string;
  budget_limits: Record<string, unknown>;
  time_limits: Record<string, unknown>;
  policy_profile: Record<string, unknown>;
  risk_context: Record<string, unknown>;
  previous_handoff_path: string;
  approval_context: Record<string, unknown>;
  approval_snapshot_path: string;
  trace_context: Record<string, unknown>;
  requested_capabilities: string[];
  container_runtime?: ContainerRuntimeConfig | null;
}

export interface WorkerOutput {
  status: RunExitStatus;
  completed: string[];
  open: string[];
  blockers: string[];
  next_action: string;
  acceptance_status: TraceState;
  mandatory_check_status: TraceState;
  evidence_paths: string[];
  report_paths: string[];
  test_result_paths: string[];
  fixback_items: string[];
}

export interface RunResult {
  run_id: string;
  run_role: RunRole;
  story_id: string;
  status_family: "run_exit";
  status: RunExitStatus;
  artifact_root: string;
  started_at: string;
  ended_at: string;
  duration_s: number;
  adapter_id: string;
}

export interface FinalSummaryRunRecord {
  run_id: string;
  run_role: RunRole;
  run_exit_status: RunExitStatus;
  started_at: string;
  ended_at: string;
  duration_s: number;
  handoff_path: string;
  report_paths: string[];
  log_paths: string[];
  timing_path: string;
}

export interface FinalSummaryMetadata {
  job_id: string;
  completed_at: string;
  final_job_state: JobState;
  freeze_version: string;
  story_id: string;
  acceptance_ids: string[];
  final_summary_path: string;
  environment_path: string;
  checksum_file: string;
  latest_handoff_path: string;
  runs: FinalSummaryRunRecord[];
}

export interface EnvironmentSnapshotMetadata {
  job_id: string;
  freeze_version: string;
  captured_at: string;
  base_branch: string;
  base_commit: string;
  approved_adapter_set: string[];
  archive_roots: {
    artifact_root: string;
    state_root: string;
    approvals_root: string;
    runtime_home_root: string;
  };
  host: {
    platform: string;
    release: string;
    arch: string;
    hostname: string;
  };
  runtime: {
    bun_version: string;
    node_version: string;
  };
}

export interface RunTimingMetadata {
  job_id: string;
  run_id: string;
  run_role: RunRole;
  story_id: string;
  adapter_id: string;
  worker_exit_code: number;
  started_at: string;
  ended_at: string;
  duration_ms: number;
  duration_s: number;
}

export interface ArtifactIndexEntry {
  path: string;
  category: string;
}

export interface ArtifactIndex {
  run_id: string;
  run_role: RunRole;
  generated_at: string;
  artifacts: ArtifactIndexEntry[];
}

export interface TraceEntry {
  status: TraceState;
  artifacts: string[];
  updated_at: string;
  latest_run_id: string;
}

export interface StoryTrace {
  story_id: string;
  latest_run_id: string;
  latest_run_role: RunRole;
  latest_qa_status: RunExitStatus | "PENDING";
  acceptance: Record<string, TraceEntry>;
  mandatory_checks: Record<string, TraceEntry>;
  artifact_locations: string[];
}

export interface TraceIndex {
  job_id: string;
  freeze_id: string;
  freeze_version: string;
  active_story_id: string;
  stories: Record<string, StoryTrace>;
}

export interface StoryQueueEntry {
  story_id: string;
  queue_state: JobState;
  priority: number;
  depends_on: string[];
  acceptance_ids: string[];
  last_run_id: string;
}

export interface StoryQueueFile {
  job_id: string;
  freeze_version: string;
  stories: StoryQueueEntry[];
}

export interface ActiveStoryFile {
  story_id: string;
  freeze_version: string;
  run_id: string;
  run_role: RunRole;
  objective: string;
  acceptance_ids: string[];
  verification_targets: string[];
  stop_conditions: string[];
  expected_artifacts: string[];
}

export interface LoopMetricEntry {
  run_id: string;
  story_id: string;
  run_role: RunRole;
  started_at: string;
  ended_at: string;
  duration_s: number;
  estimated_cost: number;
  actual_cost: number;
  retry_index: number;
  run_exit_status: RunExitStatus;
}

export interface LoopMetricsFile {
  job_id: string;
  runs: LoopMetricEntry[];
}

export interface ApprovalRequestSnapshot {
  request_id: string;
  job_id: string;
  story_id: string;
  run_id: string;
  run_role: RunRole;
  action_summary: string;
  reason: string;
  risk_level: string;
  requested_capability: string;
  suggested_alternatives: string[];
  timeout_at: string;
}

export interface ApprovalCardSnapshot {
  job_id: string;
  card_id: string;
  card_state: ApprovalCardState;
  card_type: string;
  story_id: string | null;
  freeze_version: string | null;
  risk_level: string;
  summary_zh: string;
  requested_action: string;
  candidate_actions: string[];
  timeout_at: string;
  created_at: string;
  evidence_refs: string[];
  approval_request?: ApprovalRequestSnapshot | null;
  recovery_context?: {
    last_exit_reason: RunExitStatus;
    current_freeze_version: string;
    current_story: string;
    latest_evidence_path: string;
    recommended_next_action: string;
    resume_gate: "owner" | "takeover";
    paused_run_id: string;
    paused_run_role: RunRole;
  } | null;
}

export interface ApprovalDecisionReceipt {
  job_id: string;
  card_id: string;
  card_type: string;
  story_id: string | null;
  freeze_version: string | null;
  decision: string;
  actor: string;
  decided_at: string;
  card_state: ApprovalCardState;
  requested_action: string;
}

export interface ContractFreezeMetadata {
  job_id: string;
  freeze_id: string;
  freeze_version: string;
  plan_path: string;
  base_branch: string;
  base_commit: string;
  dependency_snapshot_digest: string;
  approved_adapters: string[];
  approved_run_roles: RunRole[];
  adapter_versions: Record<string, string>;
  task_packet_digests: Record<string, string>;
  story_ids: string[];
  acceptance_ids: string[];
  in_scope_items: string[];
  out_of_scope_items: string[];
  quality_bar: string[];
  delivery_artifacts: string[];
  language_policy: string;
  budget_limits: Record<string, unknown>;
  time_limits: Record<string, unknown>;
  approval_card_id: string;
  approved_at: string;
}

export interface ChecksumRecord {
  algorithm: "sha256";
  path: string;
  hash: string;
}

export interface JobManifestPlanRecord {
  path: string;
  checksum: string;
  approval_card_id: string;
  summary_zh_ref: string;
  approval_state: ApprovalCardState;
  approved_at: string;
}

export interface JobManifestFreezeRecord {
  freeze_id: string;
  version: string;
  path: string;
  json_path: string;
  checksum_path: string;
  hash: string;
  approval_card_id: string;
  approved_at: string;
}

export interface JobManifestStoryRecord {
  story_id: string;
  queue_state: JobState;
  acceptance_ids: string[];
  latest_run_id: string;
  latest_run_role: RunRole;
  latest_run_status: RunExitStatus | "PENDING";
  latest_evidence_refs: string[];
  last_updated_at: string;
}

export interface JobManifestPauseContext {
  is_paused: boolean;
  pause_reason: string | null;
  waiting_on: string | null;
  resume_action: string | null;
  paused_at: string | null;
  related_card_id: string | null;
  expires_at: string | null;
}

export interface JobManifestRunRecord {
  run_id: string;
  run_role: RunRole;
  story_id: string;
  run_exit_status: RunExitStatus;
  root: string;
  task_packet_path: string;
  run_result_path: string;
  artifact_index_path: string;
  handoff_path: string;
  takeover_packet_path: string | null;
  started_at: string;
  ended_at: string;
}

export interface JobManifestApprovalRecord {
  card_id: string;
  card_state: ApprovalCardState;
  card_type: string;
  requested_action: string;
  decision: string | null;
  snapshot_path: string;
  decision_path: string | null;
  summary_zh_ref: string;
  decided_at: string | null;
  approval_request?: ApprovalRequestSnapshot | null;
}

export interface JobManifestArtifactRecord {
  runs_root: string;
  sessions_root: string;
  final_root: string;
  shared_metadata_refs: string[];
  latest_final_summary: string | null;
}

export interface JobManifest {
  job_id: string;
  project_id: string;
  created_at: string;
  updated_at: string;
  owner_channel: string;
  status: JobState;
  current_freeze_version: string;
  base_branch: string;
  base_commit: string;
  active_story_id: string;
  current_run_id: string;
  approved_adapter_set: string[];
  pause_context: JobManifestPauseContext;
  language_policy: string;
  budget_limits: Record<string, unknown>;
  time_limits: Record<string, unknown>;
  repo_root: string;
  state_root: string;
  approvals_root: string;
  artifact_root: string;
  checksum_file: string;
  plan: JobManifestPlanRecord;
  freeze: JobManifestFreezeRecord;
  stories: JobManifestStoryRecord[];
  runs: JobManifestRunRecord[];
  approvals: JobManifestApprovalRecord[];
  artifacts: JobManifestArtifactRecord;
}

export interface AdapterExecutionResult {
  runResult: RunResult;
  artifactIndex: ArtifactIndex;
  workerOutput: WorkerOutput;
  runRoot: string;
  taskPacketPath: string;
  runResultPath: string;
  artifactIndexPath: string;
  commandLogPath: string;
  handoffPath: string;
  takeoverPacketPath: string | null;
}
