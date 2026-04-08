# State Store Specification

## Purpose

This document defines the required long-lived state files under `state/` and the minimum stable fields each one must expose.

## Scope

The state store is the canonical recovery surface between loop runs.

Worker artifacts may snapshot state, but the authoritative live copies remain under `state/`.

## Required Files

The system must maintain:

- `state/progress.en.md`
- `state/story-queue.json`
- `state/active-story.json`
- `state/handoff.en.md`
- `state/risk-register.en.md`
- `state/loop-metrics.json`
- `state/decisions.en.md`
- `state/trace-index.json`

## `progress.en.md`

`progress.en.md` is the human-readable control-shell summary.

It must include:

- `job_id`
- current job state from `STATUS_MODEL.md`
- current freeze version
- active story ID
- latest run ID
- latest run role
- next required action
- last updated timestamp
- short factual progress summary

## `story-queue.json`

`story-queue.json` is the canonical execution order record.

It must include:

- `job_id`
- `freeze_version`
- `stories[]`

Each `stories[]` entry must include:

- `story_id`
- `queue_state`
- `priority`
- `depends_on`
- `acceptance_ids`
- `last_run_id`

## `active-story.json`

`active-story.json` is the single-story execution contract for the currently selected story.

It must include:

- `story_id`
- `freeze_version`
- `run_id`
- `run_role`
- `objective`
- `acceptance_ids`
- `verification_targets`
- `stop_conditions`
- `expected_artifacts`

## `handoff.en.md`

`handoff.en.md` must follow [HANDOFF_TEMPLATE.en.md](HANDOFF_TEMPLATE.en.md).

The active copy in `state/` is the latest control-shell mirror of the archived run handoff.

It must include the source `run_id` and the archived handoff path under `artifacts/runs/<run_id>/reports/handoff.en.md`.

If drift is detected, the archived per-run handoff is authoritative for that run. `state/handoff.en.md` is authoritative only for the latest resume point.

## `risk-register.en.md`

`risk-register.en.md` is the durable risk log.

It must include:

- open risks
- mitigation status
- escalated risks
- owner review needs
- last updated timestamp

## `loop-metrics.json`

`loop-metrics.json` is the append-only run metrics ledger.

It must include:

- `job_id`
- `runs[]`

Each `runs[]` entry must include:

- `run_id`
- `story_id`
- `run_role`
- `started_at`
- `ended_at`
- `duration_s`
- `estimated_cost`
- `actual_cost`
- `retry_index`
- `run_exit_status`

## `decisions.en.md`

`decisions.en.md` is the durable decision log for approvals, rejections, and operator overrides.

Each decision entry must include:

- decision timestamp
- related `card_id` when applicable
- related `run_id` when applicable
- decision summary
- resulting job state
- next required action

## `trace-index.json`

`trace-index.json` must follow [TRACEABILITY_SPEC.md](TRACEABILITY_SPEC.md).

It is the machine-readable bridge from story, to acceptance, to evidence, to verdict.

## Update Rules

- control-shell state files must be updated before a new loop starts
- `active-story.json` must change only when story selection changes or a new `run_id` is allocated
- `reports/handoff.en.md` must be written under the run root before `state/handoff.en.md` is mirrored
- `handoff.en.md`, `loop-metrics.json`, and `trace-index.json` must be updated after every run
- old state must not be silently discarded if it is still needed for audit or recovery
