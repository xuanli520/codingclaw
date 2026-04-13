# Lightweight Runtime Plan

## Purpose

This document defines the minimum runtime hardening plan for CodingClaw.

The target is a lightweight runtime with harder boundaries, not a bridge into another product shell and not a full fork of an external agent host.

`SYSTEM_BLUEPRINT.md` remains the canonical top-level definition. This document is an implementation plan for the next runtime slice.

## Decision Summary

CodingClaw should keep the current Phase 1 control shell and the existing builder to QA loop.

The next runtime work should harden three boundaries:

- state scope and atomic persistence
- adapter capability enforcement
- host-side shell and credential guards

External reuse priority should be:

- borrow TypeScript state path and planning gate ideas from oh-my-codex
- borrow capability, secret, and shell guard ideas from IronClaw
- do not import either product shell, team runtime, memory system, or orchestration stack

## Why This Fits The Current Repository

The repository already points in this direction:

- [SYSTEM_BLUEPRINT.md](SYSTEM_BLUEPRINT.md) already defines control shell, files over memory, executor-agnostic adapters, and short-lived workers
- [ARCHITECTURE_OVERVIEW.md](ARCHITECTURE_OVERVIEW.md) already preserves the builder to QA loop and the single-node Phase 1 shape
- [EXECUTOR_ADAPTER_CONTRACT.md](EXECUTOR_ADAPTER_CONTRACT.md) already defines a capability manifest boundary
- [SECURITY_POLICY.md](SECURITY_POLICY.md) already requires secret injection, log redaction, and approval interception

This plan does not replace the current architecture. It tightens the boundaries the current architecture already claims.

## What Already Exists

The current codebase already has the right shell, but several boundaries are still declarative instead of enforced:

- `core/loop/phase1-local-flow.ts` already owns the Phase 1 builder to QA control path
- `core/loop/state-store.ts` already mirrors archived state back into `state/`
- `adapters/generic-cli/adapter-capability.json` already declares capability intent
- `control/fixtures/phase1-local-task-packet.en.json` and `control/fixtures/phase1-local-run-envelope.json` already carry `requested_capabilities`
- `docs/SECURITY_POLICY.md` already states that secrets must not be written into task packets

Current gaps:

- `StateStore` writes directly, without an atomic write path or a write lock
- state has one root and one mirror, but no root, session, and run scope resolver
- capability data is passed through, but `GenericCliAdapter` does not enforce default-deny execution against the manifest
- shell and secret rules exist as policy text, but not as host-side runtime guards

## External Adoption Targets

### Borrow From Oh My Codex

Adopt the state boundary ideas, not the product shell:

- session ID validation
- Windows and WSL path normalization
- working-directory allowlist checks before resolving state paths
- root scope plus session scope plus current-session fallback reads
- atomic file writes through temp file then rename
- write locking around state mutations

Adopt the planning gate rules, not the planner prompt wording:

- inspect the repository before asking the user for code facts
- use an adaptive step count instead of a fixed five-step template
- do not execute before explicit user approval

### Borrow From IronClaw

Adopt the security boundary ideas, not the Rust host shell:

- default-deny capability objects
- missing capability sidecar means no permissions
- host-boundary credential injection, where tools never see secret values
- shell policy split into blocked commands, dangerous patterns, never-auto-approve patterns, and safe environment allowlist

## Target Runtime Shape

```text
[Control Shell]
   |
   +--> [Planner Gate]
   |
   +--> [State Scope Resolver]
   |        |- root scope
   |        |- session scope
   |        `- run scope
   |
   +--> [Task Packet + Run Envelope]
   |
   `--> [Adapter Capability Gate]
             |
             +--> [shell-policy]
             +--> [credential-injector]
             `--> [Generic CLI Worker]
                       |
                       +--> Builder
                       `--> QA
```

The lightweight runtime should keep the current archive-first model:

- canonical job state remains under `jobs/<job_id>/state/`
- latest live mirror remains under repository `state/`
- session-local state becomes optional and isolated
- run-local state becomes archived and replayable

## State Scope Model

The new state model should define three scopes:

### Root Scope

Canonical job state under `jobs/<job_id>/state/`.

This remains the only authoritative control-shell state for:

- `progress.en.md`
- `story-queue.json`
- `active-story.json`
- `handoff.en.md`
- `risk-register.en.md`
- `loop-metrics.json`
- `decisions.en.md`
- `trace-index.json`

### Session Scope

Optional adapter session state under `jobs/<job_id>/state/sessions/<session_id>/`.

This scope should exist only for executor-specific resumability and should never redefine contract scope.

Read behavior should support:

- explicit session ID
- current session fallback from `jobs/<job_id>/state/current-session.json`
- fallback to root scope when no session state exists

### Run Scope

Archived run-local state under `artifacts/runs/<run_id>/metadata/state/`.

This scope should hold transient state snapshots needed for replay, recovery, and forensic review.

### Resolution Rules

- path resolution must normalize Windows and WSL forms before validation
- resolved paths must stay inside the allowed job root
- session IDs must use a strict safe pattern
- the control shell may promote selected session or run outputs back into root scope
- workers may read scoped state, but they must not rewrite control-shell canonical files directly

## Required Modules

The minimum useful implementation should add these modules:

- `core/loop/state-scope.ts`
- `core/loop/state-write.ts`
- `adapters/generic-cli/capability-gate.ts`
- `ops/guards/shell-policy.ts`
- `ops/guards/credential-injector.ts`

Responsibilities:

- `state-scope.ts`: resolve root, session, and run paths, validate session IDs, normalize Windows and WSL paths, and provide read scope order
- `state-write.ts`: provide write lock and atomic write primitives
- `capability-gate.ts`: load adapter capabilities, intersect them with requested capabilities, and reject undeclared actions by default
- `shell-policy.ts`: classify commands and environment variables before execution
- `credential-injector.ts`: translate secret handles and host allowlists into host-side request injection without exposing raw secrets to workers

## Existing File Changes

The first implementation pass should update only the following existing files:

- `core/loop/state-store.ts`
- `core/loop/phase1-local-flow.ts`
- `adapters/generic-cli/adapter.ts`
- `adapters/generic-cli/adapter-capability.json`
- `core/contracts/types.ts`

The goal is to keep the diff narrow and preserve the current Phase 1 control path.

## Capability Enforcement Rules

Capability handling should become executable policy, not metadata decoration.

The adapter gate should enforce:

- effective capability set equals `adapter-capability.json` allow entries intersected with `requested_capabilities`
- any missing capability entry is deny
- any denied capability request fails before worker launch
- any privileged capability outside the approved profile returns a standard approval or policy failure path

The first enforced capabilities should be:

- `shell_command`
- `container_control`
- `secret_injection`
- `interactive_approval`

## Shell And Secret Guard Rules

### Shell Policy

The shell guard should run before any worker command is launched.

It should evaluate:

- exact blocked commands
- dangerous substrings or command patterns
- commands that can never be auto-approved
- environment variable allowlist

Phase 1 does not need a perfect shell sandbox. It needs a host-side deny path for obvious unsafe commands and obvious secret exfiltration attempts.

### Credential Injection

Secrets must never enter:

- `task-packet.en.json`
- run envelopes
- archived reports
- worker stdout or stderr

The task packet should carry only:

- secret handle
- credential alias
- allowed host patterns
- injection mode metadata

The host should resolve the secret and inject it only at the outgoing request boundary.

## Planner Gate Follow-Up

Planner hardening is a control-shell follow-up, not the first runtime blocker.

When the live planner role is implemented, it should inherit three rules:

- repo inspection before user questions about code facts
- scope-matched step count
- explicit approval before execution handoff

This is a policy borrow from oh-my-codex, not a prompt import project.

## Implementation Sequence

### Step 1

Add state scope resolution plus atomic state writes.

Acceptance:

- root, session, and run scope paths resolve deterministically
- direct state writes are replaced by atomic write helpers
- concurrent writes cannot truncate or partially overwrite canonical state files

### Step 2

Add default-deny capability enforcement in `GenericCliAdapter`.

Acceptance:

- adapter launch fails when a requested capability is undeclared or denied
- capability checks happen before worker start
- failure surfaces through the existing run status vocabulary

### Step 3

Add shell policy and credential injection guards.

Acceptance:

- unsafe shell commands are blocked before launch
- environment scrubbing is enforced for worker execution
- secret handles can be resolved and injected without writing secret values into artifacts

### Step 4

Wire planner gate rules into the future live planner implementation.

Acceptance:

- planner flow inspects the repo before asking for code facts
- plan length matches actual scope
- no execution starts without owner approval

## Collaboration Model

The work can be split into three lanes:

| Lane | Modules Touched | Depends On |
|------|-----------------|------------|
| A | `core/loop/` | - |
| B | `ops/guards/` | - |
| C | `adapters/generic-cli/`, `core/contracts/` | A, B |

Recommended execution order:

- launch Lane A and Lane B in parallel
- merge both
- implement Lane C after the state and guard interfaces are stable

Conflict notes:

- Lane C touches adapter launch and will likely need the final guard interfaces from Lane B
- Lane A should avoid changing archive layout semantics beyond scoped state additions

## Failure Modes To Design For

| Codepath | Production Failure | Test Need | Error Handling Need | User Outcome |
|----------|--------------------|-----------|---------------------|--------------|
| state write | partial file write on crash | yes | yes | explicit failure, never silent corruption |
| state resolve | path escape or invalid session ID | yes | yes | fail closed |
| capability gate | undeclared capability still executes | yes | yes | fail before worker launch |
| shell policy | dangerous command bypasses deny list | yes | yes | approval or policy failure |
| credential injection | secret leaks into packet or logs | yes | yes | policy failure and redacted evidence |

Any implementation that leaves a silent secret leak or a silent capability bypass is below the minimum bar.

## Not In Scope

This plan explicitly excludes:

- bridging CodingClaw into oh-my-codex runtime
- forking IronClaw as the new host shell
- tmux, HUD, multi-agent team runtime, or worktree orchestration from oh-my-codex
- WASM tool ecosystems, channels, routines, web gateways, or long-lived memory layers from IronClaw
- multi-job concurrency or multi-adapter parallel execution
- browser QA expansion, large GUI automation expansion, or remote desktop vendor integration

## Source Basis

Internal references:

- [SYSTEM_BLUEPRINT.md](SYSTEM_BLUEPRINT.md)
- [ARCHITECTURE_OVERVIEW.md](ARCHITECTURE_OVERVIEW.md)
- [EXECUTOR_ADAPTER_CONTRACT.md](EXECUTOR_ADAPTER_CONTRACT.md)
- [SECURITY_POLICY.md](SECURITY_POLICY.md)

External references:

- oh-my-codex state scope source: https://github.com/Yeachan-Heo/oh-my-codex/blob/main/src/mcp/state-paths.ts
- oh-my-codex atomic state write source: https://github.com/Yeachan-Heo/oh-my-codex/blob/main/src/mcp/state-server.ts
- oh-my-codex planner prompt source: https://github.com/Yeachan-Heo/oh-my-codex/blob/main/prompts/planner.md
- IronClaw capability source: https://github.com/nearai/ironclaw/blob/staging/src/tools/wasm/capabilities.rs
- IronClaw capability loader source: https://github.com/nearai/ironclaw/blob/staging/src/tools/wasm/loader.rs
- IronClaw credential injection source: https://github.com/nearai/ironclaw/blob/staging/src/tools/wasm/credential_injector.rs
- IronClaw shell policy source: https://github.com/nearai/ironclaw/blob/staging/src/tools/builtin/shell.rs

## Related Documents

- [README.md](README.md)
- [STATE_STORE_SPEC.md](STATE_STORE_SPEC.md)
- [LOOP_SPEC.md](LOOP_SPEC.md)
- [STATUS_MODEL.md](STATUS_MODEL.md)
- [UBUNTU_GUI_RUNTIME_PLAN.md](UBUNTU_GUI_RUNTIME_PLAN.md)
