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
- `approved_adapter_set`
- `language_policy`
- `budget_limits`
- `time_limits`
- `artifact_root`
- `state_root`
- `repo_root`
- `checksum_file`

## Required Nested Objects

### `plan`

- plan path
- approval status
- approval timestamp

### `freeze`

- freeze path
- freeze JSON path
- freeze checksum path
- freeze hash

### `stories`

Each story entry should include:

- story ID
- queue status
- acceptance IDs
- latest run role
- latest run status
- latest evidence refs

### `approvals`

Each approval record should include:

- card ID
- card type
- requested action
- decision
- decided at

### `artifacts`

The manifest should point to:

- reports
- logs
- evidence bundles
- session exports
- metadata files

## Schema Rules

- all file paths must be relative to the job root or otherwise explicitly rooted
- status fields must use standardized state names
- the manifest must remain machine-readable and stable across recovery
- updates should append or replace specific fields, not rewrite history without reason
