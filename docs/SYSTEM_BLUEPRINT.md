# CodingClaw System Blueprint

## Purpose

This document defines the operating model of CodingClaw, an IronClaw-based coding orchestration system designed for Chinese control, English engineering delivery, auditable short loops, and strict scope governance.

## System Definition

CodingClaw is:

- a control shell built on an IronClaw fork
- a coding loop kernel that executes short, restartable stories
- a builder and QA dual-track delivery model
- an artifact-first audit system
- a governed automation system with explicit approval gates

CodingClaw is not:

- a fully autonomous coding black box
- a long-context memory dependent agent
- a system that can bypass owner approval
- a system that can expand scope without a new contract

## Core Principles

1. Plan before code. No implementation starts before the owner approves a Development Plan.
2. Freeze before execution. Every build round must bind to a Contract Freeze and a verifiable base commit.
3. One story per loop. Each loop handles one explicit story with clear acceptance IDs and evidence targets.
4. Files over memory. State lives in versioned files and manifests, not in session memory.
5. Builder and QA stay separate. Implementation and validation cannot collapse into one undocumented step.
6. English delivery boundary. All repository-facing deliverables are written in English.
7. Audit everything that matters. Contracts, reports, evidence, logs, manifests, and checksums must be preserved.

## System Layers

### Control Shell

The control shell accepts Chinese commands, normalizes requirements, manages approval gates, budgets, policy guards, and dispatches loop work through adapters.

### Coding Loop Kernel

The loop kernel turns the approved contract into executable stories, launches the correct worker role, collects outputs, updates state, and decides the next transition.

### Execution Workers

Workers run in isolated environments. Builder produces implementation artifacts. QA validates scope, reproducibility, language compliance, and acceptance evidence.

### Artifact and Metadata Plane

This plane stores all long-lived state, reports, logs, evidence, sessions, checksums, and manifests required for replay and audit.

### GUI Exception Plane

Aliyun Wuying Desktop is reserved for GUI-only tasks, human takeover, and assisted recovery. It is not a primary coding surface.

## Mandatory Lifecycle

```text
INTAKE
 -> REQUIREMENT_NORMALIZATION
 -> DEVELOPMENT_PLAN_DRAFT
 -> OWNER_REVIEW
 -> DEVELOPMENT_PLAN_APPROVED
 -> CONTRACT_FREEZE
 -> STORY_QUEUE_READY
 -> BUILD_EXECUTION
 -> QA_VALIDATION
 -> FIXBACK(optional)
 -> FINAL_APPROVAL(optional)
 -> ARCHIVE
```

## Required Persistent State

The system must maintain at least:

- `state/progress.en.md`
- `state/story-queue.json`
- `state/active-story.json`
- `state/handoff.en.md`
- `state/risk-register.en.md`
- `state/loop-metrics.json`
- `state/decisions.en.md`
- `state/trace-index.json`

## Required Governance Objects

Before execution:

- `DEVELOPMENT_PLAN.en.md`
- Chinese summary for owner approval
- `CONTRACT_FREEZE.en.md`
- `contract-freeze.json`
- `contract-freeze.sha256`

Per loop:

- `task-packet.en.json`
- `implementation-summary.en.md` or `qa-report.en.md`
- `self-check.en.md` for builder runs
- `fixback-items.en.md` for QA failure loops
- `handoff.en.md`
- `run-result.json`
- `artifact-index.json`

## Phase 1 Scope

Phase 1 is the minimum working product. It includes:

- one Chinese mobile entry channel
- one control shell
- one generic CLI adapter
- one builder worker
- one QA worker
- contract binding to `base_commit`
- traceability from story to acceptance to QA verdict
- local artifact archival and checksums

Phase 1 excludes:

- multi-channel concurrency
- multi-adapter parallel execution
- Wuying automation
- dashboards
- historical job reuse
- production-scale multi-tenant scheduling

## Related Documents

- `ARCHITECTURE_OVERVIEW.md`
- `DEPLOYMENT_PLAN.md`
- `CONTRACT_POLICY.md`
- `LOOP_SPEC.md`
- `ARTIFACT_LAYOUT_SPEC.md`
- `WUYING_INTEGRATION_PLAN.md`
