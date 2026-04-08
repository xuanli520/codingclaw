# Change Request Policy

## Purpose

This policy defines how CodingClaw handles required scope changes after a Contract Freeze has been approved.

## When a Change Request Is Mandatory

A change request is required when any execution step would:

- add a new feature not listed as in-scope
- alter the approved architecture direction
- change the delivery format
- relax the quality bar
- require new privileged capabilities
- extend the milestone boundary
- change the language policy
- alter budget or time guardrails in a material way

Bug fixes that remain inside an already approved acceptance target do not require a change request.

## Workflow

```text
CHANGE_REQUEST_DRAFT
 -> OWNER_REVIEW
 -> APPROVED_CHANGESET
 -> CONTRACT_FREEZE_V{N+1}
 -> RESUME_EXECUTION
```

Rejected requests return to the current approved freeze or terminate the job.

## Required Change Request Content

Every change request must include:

- related `job_id`
- current `freeze_version`
- requesting role
- impacted story IDs
- reason for change
- exact scope delta
- architecture impact
- risk impact
- budget or time impact
- rollback path
- approval requested

## Review Rules

- the owner must approve every scope-expanding change
- the request must reference the current freeze hash
- multiple pending change requests for the same job must remain ordered and isolated
- a later request cannot silently supersede an earlier pending request

## Output Objects

An approved change request produces:

- `change-request.en.md`
- `approved-changeset.json`
- a new `CONTRACT_FREEZE.en.md`
- a new `contract-freeze.json`
- a new freeze checksum

## Traceability Requirements

The system must be able to answer:

- which freeze version approved a given story run
- which change request modified scope
- which approval record authorized the modification
- which artifacts were produced before and after the change

## Rejection and Expiry

If a change request is rejected or times out:

- the executor must stop
- no alternative unapproved path may continue
- the job moves to `AWAITING_OWNER` or `TERMINATED_WITH_RISK_REPORT`

Job status names in this flow must follow `STATUS_MODEL.md`.

## Phase 1 Rule

Phase 1 should keep change requests simple:

- one active change request per job
- one approved delta per new freeze version
- manual owner approval only
