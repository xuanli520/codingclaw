# Job Manifest Schema

## Purpose

`job-manifest.json` is the canonical metadata envelope for one CodingClaw job archive.

## Required Top-Level Fields

- `job_id`
- `project_id`
- `created_at`
- `updated_at`
- `owner_channel`
- `status`
- `current_freeze_version`
- `base_branch`
- `base_commit`
- `active_story_id`
- `current_run_id`
- `approved_adapter_set`
- `pause_context`
- `language_policy`
- `budget_limits`
- `time_limits`
- `repo_root`
- `state_root`
- `approvals_root`
- `artifact_root`
- `checksum_file`
- `plan`
- `freeze`
- `stories`
- `runs`
- `approvals`
- `artifacts`

## Required Nested Objects

### `plan`

- `path`
- `checksum`
- `approval_card_id`
- `summary_zh_ref`
- `approval_state`
- `approved_at`

### `freeze`

- `freeze_id`
- `version`
- `path`
- `json_path`
- `checksum_path`
- `hash`
- `approval_card_id`
- `approved_at`

### `stories[]`

- `story_id`
- `queue_state`
- `acceptance_ids`
- `latest_run_id`
- `latest_run_role`
- `latest_run_status`
- `latest_evidence_refs`
- `last_updated_at`

### `pause_context`

- `is_paused`
- `pause_reason`
- `waiting_on`
- `resume_action`
- `paused_at`
- `related_card_id`
- `expires_at`

### `runs[]`

- `run_id`
- `run_role`
- `story_id`
- `run_exit_status`
- `root`
- `task_packet_path`
- `run_result_path`
- `artifact_index_path`
- `handoff_path`
- `takeover_packet_path`
- `started_at`
- `ended_at`

### `approvals[]`

- `card_id`
- `card_state`
- `card_type`
- `requested_action`
- `decision`
- `snapshot_path`
- `decision_path`
- `summary_zh_ref`
- `decided_at`

### `artifacts`

- `runs_root`
- `sessions_root`
- `final_root`
- `shared_metadata_refs`
- `latest_final_summary`

## Schema Rules

- all file paths must be relative to the job root or otherwise explicitly rooted
- nested keys must use the exact names listed above
- top-level job status must use the job state vocabulary from `STATUS_MODEL.md`
- run exit fields must use the run exit vocabulary from `STATUS_MODEL.md`
- approval records must use the approval card state vocabulary from `STATUS_MODEL.md`
- `pause_context` must explain every non-terminal suspended job without inventing a new job state
- the manifest must remain machine-readable and stable across recovery
- updates should append or replace specific fields, not rewrite history without reason
