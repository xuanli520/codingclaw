# Executor Adapter Contract

## Purpose

This document defines the canonical boundary between the control shell and any executor adapter.

The goal is to keep CodingClaw executor-agnostic while preserving approval, budget, policy, evidence, and archive guarantees.

## Scope

This contract applies to every adapter that can launch a builder, QA, or review run.

It complements:

- [SYSTEM_BLUEPRINT.md](SYSTEM_BLUEPRINT.md)
- [ARCHITECTURE_OVERVIEW.md](ARCHITECTURE_OVERVIEW.md)
- [TASK_PACKET_TEMPLATE.en.md](TASK_PACKET_TEMPLATE.en.md)
- [STATUS_MODEL.md](STATUS_MODEL.md)
- [OFFICIAL_REFERENCE_NOTES.md](OFFICIAL_REFERENCE_NOTES.md)

## Core Rule

The control shell and loop kernel may rely only on these adapter-facing objects:

- adapter registration objects
- the standard run input envelope
- the task packet
- the capability manifest
- approval request objects
- the standard output bundle
- the standard run exit statuses

The control shell must not depend on any executor's private prompt contract as the sole execution protocol.

## Adapter Registration Objects

Every adapter must register at least:

- `adapter.json`
- `adapter-capability.json`
- `adapter-policy.json`

`adapter.json` must include:

- `adapter_id`
- `executor_family`
- `adapter_version`
- `supported_run_roles`
- `supported_run_modes`
- `supported_approval_hooks`
- `supported_credential_model`
- `supported_sandbox_model`
- `supported_artifact_outputs`
- `supported_trace_schema`

## Standard Run Input Envelope

Before each run, the control shell must provide one standard run input envelope.

The envelope must include:

- `job_id`
- `freeze_id`
- `freeze_version`
- `story_id`
- `run_id`
- `run_role`
- `run_attempt`
- `repo_path`
- `base_commit`
- `state_path`
- `artifact_path`
- `runtime_home`
- `task_packet_path`
- `task_packet_sha256`
- `budget_limits`
- `time_limits`
- `policy_profile`
- `risk_context`
- `previous_handoff_path`
- `approval_context`
- `approval_snapshot_path`
- `trace_context`
- `requested_capabilities`

`run_role` may only be:

- `builder`
- `qa`
- `review`

Phase 1 implementations are required to support `builder` and `qa`. `review` remains optional until the review executor is enabled.

Phase 1 role binding is profile-specific:

- builder should use a Claude Code adapter profile
- qa should use a Codex adapter profile

## Task Packet Boundary

`task-packet.en.json` must follow [TASK_PACKET_TEMPLATE.en.md](TASK_PACKET_TEMPLATE.en.md).

Only the control shell may generate the task packet. Executors may read it but must not rewrite scope-defining fields.

The adapter must treat the task packet as the run-scoped execution contract for:

- story objective
- acceptance IDs
- in-scope and out-of-scope boundaries
- mandatory checks
- verification targets
- expected artifacts
- language policy
- stop conditions
- escalation rules

## Capability Manifest

Every adapter must explicitly declare its capabilities.

The capability manifest is scoped to a concrete adapter profile rather than an executor family in the abstract.

If one adapter can run against multiple model, runtime, or deployment profiles, it must publish a distinct capability manifest for each supported profile instead of implying one universal tool surface.

The capability set must cover at least:

- filesystem read
- filesystem write
- shell command
- git
- network
- browser
- container control
- screenshot
- secret injection
- interactive approval
- session export

Each capability entry must include:

- allow or deny
- scope or allowlist
- cost level
- risk level
- approval requirement

## Approval Request Object

If the executor needs approval for a privileged action, it must return a standard approval request object instead of continuing silently.

The approval request object must include:

- `request_id`
- `job_id`
- `story_id`
- `run_id`
- `run_role`
- `action_summary`
- `reason`
- `risk_level`
- `requested_capability`
- `suggested_alternatives`
- `timeout_at`

## Standard Output Bundle

After execution, every adapter must return:

- `run-result.json`
- `artifact-index.json`
- `command-log.txt`
- `handoff.en.md`

Role-specific outputs are:

- builder: `implementation-summary.en.md`, `self-check.en.md`, `test-results/`
- qa: `qa-report.en.md`, `fixback-items.en.md` when needed, `qa-verdict.json`
- review: `review-report.en.md`

When takeover is triggered, the adapter must also produce:

- `takeover/takeover-packet.en.md`

## Standard Exit Statuses

Adapters must reuse the run exit vocabulary from [STATUS_MODEL.md](STATUS_MODEL.md).

They must not invent alternate machine-readable spellings.

## Consistency Test

Before a new adapter is accepted for live use, it must pass a consistency check for:

- input envelope parsing
- baseline binding
- task packet boundary enforcement
- output bundle completeness
- exit status compliance
- approval interruption and resume behavior
- traceability completeness
- archive exportability
- log redaction

## Phase 1 Rollout Rule

Phase 1 should freeze this contract first, then implement:

1. one generic CLI adapter
2. one Claude Code builder adapter profile
3. one Codex QA adapter profile
4. later adapters such as Aider
