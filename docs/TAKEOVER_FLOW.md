# Takeover Flow

## Purpose

This document defines the controlled handoff from automated execution to human takeover.

## Trigger Conditions

Takeover may be triggered when:

- a GUI-only step blocks progress
- credentials require an interactive login
- a Windows-only tool is required
- policy demands human confirmation inside a live UI

## Standard Flow

```text
DETECT_GUI_EXCEPTION
 -> PAUSE_MAIN_LOOP
 -> PREPARE_TAKEOVER_PACKET
 -> ISSUE_APPROVAL_CARD
 -> OPEN_WUYING_BRIDGE
 -> HUMAN_OR_ASSISTED_ACTION
 -> CAPTURE_RESULT
 -> WRITE_HANDOFF
 -> RESUME_OR_TERMINATE
```

`AWAITING_TAKEOVER` is the canonical machine-readable job state while takeover is pending.

The preceding pause is operational behavior, not a separate machine-readable job state.

## Takeover Packet Requirements

The takeover packet format is defined by `TAKEOVER_PACKET_TEMPLATE.en.md`.

The archived packet at `artifacts/runs/<run_id>/takeover/takeover-packet.en.md` must include:

- job ID
- run ID
- freeze version
- active story
- exact blocked step
- required human action
- access and approval context
- expected output
- evidence destination
- resume criteria

## Resume Rules

The system may resume only when:

- the human step is complete
- the result is recorded in artifacts
- the result is recorded under the same `run_id` takeover root and referenced in `job-manifest.json`
- any required approvals remain valid
- the next action is explicit in handoff

## Failure Rules

If takeover fails or expires:

- the job leaves `AWAITING_TAKEOVER` and moves to `AWAITING_OWNER`
- the owner receives a recovery summary
- the system must not attempt silent fallback automation
