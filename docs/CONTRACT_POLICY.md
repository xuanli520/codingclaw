# Contract Policy

## Purpose

This policy defines how Development Plans and Contract Freezes govern CodingClaw execution.

## Governance Rule

No builder or QA execution may start unless:

1. the Development Plan has been explicitly approved by the owner
2. the Contract Freeze has been generated from that approved plan
3. the freeze is bound to a verifiable engineering baseline

## Contract Objects

The canonical section order for these documents is defined in:

- [DEVELOPMENT_PLAN_TEMPLATE.en.md](DEVELOPMENT_PLAN_TEMPLATE.en.md)
- [CONTRACT_FREEZE_TEMPLATE.en.md](CONTRACT_FREEZE_TEMPLATE.en.md)

### Development Plan

The Development Plan is the pre-implementation agreement. It must include:

- problem statement
- goals and non-goals
- assumptions
- architecture direction
- milestones
- story breakdown
- testing strategy
- delivery checklist
- risks
- open questions
- current repo baseline
- intended execution surface
- approval touchpoints

`DEVELOPMENT_PLAN.en.md` must preserve the template headings from [DEVELOPMENT_PLAN_TEMPLATE.en.md](DEVELOPMENT_PLAN_TEMPLATE.en.md).

### Contract Freeze

The Contract Freeze is the execution contract. It must include:

- project scope
- core objective
- approved architecture direction
- base branch and `base_commit`
- dependency snapshot digest
- approved adapters
- in-scope and out-of-scope items
- quality bar
- test expectations
- traceability requirements
- delivery format
- language policy
- time and budget guardrails
- approval record
- freeze version
- freeze timestamp
- freeze hash

`CONTRACT_FREEZE.en.md` must preserve the template headings from [CONTRACT_FREEZE_TEMPLATE.en.md](CONTRACT_FREEZE_TEMPLATE.en.md).

Approved adapters and capability assumptions must reuse the adapter vocabulary from [EXECUTOR_ADAPTER_CONTRACT.md](EXECUTOR_ADAPTER_CONTRACT.md).

## Baseline Binding

The freeze must bind to a real engineering baseline.

Minimum requirements:

- `CONTRACT_FREEZE.en.md` records `base_commit`
- `contract-freeze.json` records dependency digests, adapter versions, and task packet digests
- QA verifies execution started from the recorded baseline or an approved continuation commit
- if the actual repo state differs from the recorded baseline, execution must stop and enter change request flow

## Scope Rules

Builders and QA executors must treat the freeze as the highest execution authority.

Forbidden without a change request:

- new major features
- architecture replacement
- milestone expansion
- quality bar reduction
- output format changes

Allowed within the freeze:

- local implementation choices that do not change approved scope
- fixes required to satisfy the same acceptance IDs
- documentation or test updates that are required by the accepted story

## Freeze Validation

The control shell must validate before every run:

- freeze file exists and checksum matches
- referenced baseline exists
- current story is linked to the freeze version
- requested adapter is approved in the freeze
- budget and time limits are present

The QA executor must validate after every run:

- the delivered change remains inside the approved scope
- all mandatory outputs exist
- evidence matches the claimed acceptance status

## Freeze Versioning

- the first approved execution contract is `freeze_version: 1`
- any approved change request increments the freeze version
- old freeze versions remain archived and immutable
- every run result must reference the exact freeze version used
