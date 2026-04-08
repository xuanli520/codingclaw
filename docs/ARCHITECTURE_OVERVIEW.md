# CodingClaw Architecture Overview

## Objective

This document describes the runtime architecture of CodingClaw and the boundaries between its control, execution, and audit layers.

## Top-Level Architecture

```text
[Owner / Mobile Control]
   |
   v
[Control Shell]
   |- Commander
   |- Scheduler
   |- Approval Gate
   |- Policy Guard
   |- Budget Guard
   |- Channel Adapters
   |
   v
[Coding Loop Kernel]
   |- Planner Loop
   |- Builder Loop
   |- QA Loop
   |- Fixback Loop
   |
   v
[Execution Workers]
   |- Builder Worker
   |- QA Worker
   |- Optional Review Worker
   |
   v
[Artifact and Metadata Plane]
   |- Repo Workspace
   |- State Store
   |- Reports
   |- Logs
   |- Evidence
   |- Checksums
```

## Layer Responsibilities

### Owner and Mobile Control

- send commands in Chinese
- approve or reject plans, freezes, and change requests
- receive risk summaries and next-step reports

### Control Shell

- translate owner intent into English execution objects
- enforce plan-before-code and freeze-before-execution gates
- route jobs to adapters and workers
- manage stop switches, limits, and escalation

### Coding Loop Kernel

- read approved scope and persistent state
- select the next story
- generate the task packet
- launch the correct execution role
- collect outputs and update traceability

### Execution Workers

- run isolated implementation or validation jobs
- read only declared inputs
- write only declared outputs
- return standardized status codes

### Artifact and Metadata Plane

- preserve everything needed for replay and audit
- serve as the only long-lived memory source
- support recovery after crash, timeout, or handoff

## Runtime Objects

The architecture depends on the following runtime objects:

- Development Plan
- Contract Freeze
- Task Packet
- Approval Card
- Recovery Card
- Run Result
- Artifact Index
- Trace Index
- Job Manifest

## Repository Shape

```text
codingclaw/
  docs/
  control/
  core/
  adapters/
  channels/
  ops/
  state/
  artifacts/
  scripts/
  docker/
  tests/
```

## Phase 1 Required Modules

### `control/`

- `commander/`
- `scheduler/`
- `approvals/`
- `policy/`
- `budget/`
- `alerts/`

### `core/`

- `loop/`
- `planning/`
- `qa/`
- `contracts/`
- `roles/`
- `patching/`

### `adapters/`

- `generic-cli/`

### `ops/`

- `workers/`
- `guards/`
- `archive/`
- `checksums/`
- `recovery/`

### `state/`

- `schemas/`
- `templates/`

## Control and Data Flow

1. The owner submits a Chinese request.
2. The Commander produces an English Development Plan and Chinese summary.
3. After approval, the control shell generates the Contract Freeze bound to a baseline.
4. The loop kernel selects one story and emits `task-packet.en.json`.
5. A worker executes the story through an adapter.
6. The worker returns outputs, evidence, and a standardized exit status.
7. QA validates scope, reproducibility, language policy, and evidence closure.
8. The control shell either archives success or routes fixback or change request flow.

## Architecture Constraints

- Control logic must not depend on any single executor's private prompt contract.
- Adapters must translate between CodingClaw standard objects and executor-specific APIs.
- Workers must remain short-lived and replaceable.
- All state needed across loops must be externalized.
- Approval must interrupt execution rather than run in parallel with unapproved work.

## Phase 1 Architecture Decision

Phase 1 ships a single-node topology:

- control shell on one host
- local or same-host Docker workers
- one active job at a time
- one active story at a time
- local artifact volume plus SQLite or Postgres metadata

This keeps the first release small enough to verify end-to-end governance before scaling scheduler complexity.
