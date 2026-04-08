# Status Model

## Purpose

This document defines the canonical machine-readable status vocabularies used by CodingClaw.

## Status Families

CodingClaw uses three distinct status families:

- job states for `job-manifest.json` and control-shell orchestration
- run exit statuses for executor results
- approval card states for owner decision objects

These families must not be mixed.

## Job States

Canonical job states are:

- `DRAFT`
- `AWAITING_OWNER`
- `READY_TO_FREEZE`
- `READY_TO_RUN`
- `RUNNING_BUILDER`
- `RUNNING_QA`
- `RUNNING_REVIEW`
- `FIXBACK_PENDING`
- `AWAITING_TAKEOVER`
- `CHANGE_REQUEST_PENDING`
- `ARCHIVE_PENDING`
- `COMPLETED`
- `TERMINATED_WITH_RISK_REPORT`
- `INTEGRITY_FAILED`

`RUNNING_REVIEW` is reserved for deployments that enable the optional review executor. Phase 1 may omit this state from live transitions.

There is no standalone `PAUSED` machine-readable job state. A paused job must be represented by the waiting state that caused the pause, plus `pause_context` in [JOB_MANIFEST_SCHEMA.md](JOB_MANIFEST_SCHEMA.md).

## Run Exit Statuses

Canonical run exit statuses are:

- `SUCCESS`
- `FIXBACK_REQUIRED`
- `CHANGE_REQUEST_REQUIRED`
- `AWAITING_APPROVAL`
- `AWAITING_CREDENTIALS`
- `AWAITING_TAKEOVER`
- `FAILED_POLICY`
- `FAILED_EXECUTION`
- `FAILED_INFRA`
- `TIMEOUT`
- `BUDGET_EXCEEDED`

## Approval Card States

Canonical approval card states are:

- `PENDING`
- `DECIDED`
- `EXPIRED`
- `CANCELLED`

## Mapping Rules

- a run exit of `AWAITING_APPROVAL` maps the job to `AWAITING_OWNER`
- a run exit of `AWAITING_CREDENTIALS` normally maps the job to `AWAITING_OWNER`
- a run exit of `AWAITING_TAKEOVER` maps the job to `AWAITING_TAKEOVER`
- a run exit of `CHANGE_REQUEST_REQUIRED` maps the job to `CHANGE_REQUEST_PENDING`
- a run exit of `FIXBACK_REQUIRED` maps the job to `FIXBACK_PENDING`
- a run exit of `FAILED_POLICY` maps the job to `AWAITING_OWNER`, unless the security policy requires `TERMINATED_WITH_RISK_REPORT`
- a successful builder run normally maps the job to `RUNNING_QA` or `ARCHIVE_PENDING`, and may map to `RUNNING_REVIEW` only when the review executor is enabled
- a successful QA or review run that closes the story maps the job to `ARCHIVE_PENDING` or `COMPLETED`
- `TIMEOUT`, `FAILED_EXECUTION`, `FAILED_INFRA`, and `BUDGET_EXCEEDED` normally map the job to `AWAITING_OWNER` with recovery context, unless policy requires `TERMINATED_WITH_RISK_REPORT`
- checksum verification failure maps the job to `INTEGRITY_FAILED`

## Usage Rule

Every document that uses machine-readable statuses must name which family it is using and must reuse the exact values defined here.

Alternate machine-readable spellings such as `AWAITING_OWNER_DECISION` and `AWAITING_HUMAN_TAKEOVER` are invalid.
