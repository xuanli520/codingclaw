# Budget Policy

## Purpose

This policy defines how CodingClaw constrains cost, time, and retry behavior.

## Budget Dimensions

Budget control must cover:

- daily system spend
- per-job spend
- per-loop runtime
- per-story retry count
- high-cost capability usage

## Required Limits

Every job must declare:

- `daily_budget_limit`
- `job_budget_limit`
- `loop_time_limit`
- `max_fixback_rounds`
- `high_cost_action_policy`

These limits must appear in the Contract Freeze and be copied into the active task packet.

## Enforcement Rules

- execution must stop when the per-loop time limit is reached
- execution must stop when the job budget is exhausted
- fixback loops must stop when the configured retry ceiling is reached
- high-cost capabilities must pause for approval if the policy requires it

## Scheduler Responsibilities

The scheduler must:

- refuse to start runs that would exceed declared budget
- record estimated and actual cost per run
- record runtime per loop
- surface budget warnings before hard failure when possible

## Escalation States

Budget or time violations must return one of:

- `TIMEOUT`
- `BUDGET_EXCEEDED`
- `AWAITING_APPROVAL`

The control shell must not retry automatically without checking policy and budget state.

## Phase 1 Recommendation

Use simple controls first:

- one active job at a time
- one active story at a time
- fixed per-loop timeout
- fixed per-job retry ceiling
- manual approval for expensive or privileged actions
