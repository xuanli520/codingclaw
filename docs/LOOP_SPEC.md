# Coding Loop Specification

## Purpose

This document defines the standard lifecycle, inputs, outputs, and exit rules for a CodingClaw loop run.

## Loop Principles

- short-lived
- single-story
- auditable
- restartable
- file-driven
- executor-agnostic

## Standard Loop Lifecycle

```text
LOAD_CONTRACT
 -> LOAD_PROGRESS
 -> SELECT_NEXT_STORY
 -> BUILD_TASK_PACKET
 -> RUN_EXECUTOR
 -> COLLECT_OUTPUTS
 -> RUN_SELF_CHECK(optional for builder)
 -> UPDATE_TRACEABILITY
 -> WRITE_HANDOFF
 -> DECIDE_NEXT_STEP
```

## Inputs Required Before Execution

Every loop must read:

- approved Contract Freeze
- freeze baseline metadata
- current progress file
- story queue
- active story record
- previous handoff
- risk register
- budget and policy profile
- approval context

## Story Selection Rules

An active story must include:

- `story_id`
- objective
- acceptance IDs
- completion criteria
- verification targets
- stop conditions
- expected artifacts

The loop must not merge multiple independent stories into one execution run.

## Task Packet Build Rules

The task packet must:

- inherit scope from the active freeze
- include only the selected story
- declare in-scope and out-of-scope work
- list mandatory commands or checks when required
- define expected artifacts and exit conditions

## Worker Execution Rules

- the loop launches only one role at a time
- the worker may be builder, QA, or review
- workers must return standard output objects and a standard exit status
- unapproved privileged actions must interrupt execution and return approval-needed status

## Required Outputs

Every loop must produce:

- `run-result.json`
- `artifact-index.json`
- `command-log.txt`
- `handoff.en.md`

Builder loops also produce:

- `implementation-summary.en.md`
- `self-check.en.md`
- `test-results/`

QA loops also produce:

- `qa-report.en.md`
- `fixback-items.en.md` when needed
- `qa-verdict.json`

## Exit Conditions

The loop must exit immediately when any of the following happens:

- story is completed
- mandatory validation fails
- retry threshold is reached
- budget is exhausted
- loop timeout is reached
- approval is required
- credentials are required
- takeover is required
- change request is required

## Standard Exit Statuses

The executor may only return:

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

## State Update Rules

After each run, the loop must update:

- progress status
- active story status
- trace index
- risk register if new risk exists
- handoff
- metrics

## Fixback Policy

- fixback should usually remain within the same story
- fixback must not silently expand scope
- Phase 1 should cap fixback at 2 or 3 rounds per story
