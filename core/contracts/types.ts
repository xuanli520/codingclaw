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
  story: StoryContract;
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
}
