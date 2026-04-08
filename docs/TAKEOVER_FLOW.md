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
 -> PREPARE_TAKEOVER_PACKET.en.md
 -> ISSUE_APPROVAL_CARD
 -> OPEN_WUYING_BRIDGE
 -> HUMAN_OR_ASSISTED_ACTION
 -> CAPTURE_RESULT
 -> WRITE_HANDOFF
 -> RESUME_OR_TERMINATE
```

## Takeover Packet Requirements

The takeover packet must include:

- job ID
- freeze version
- active story
- exact blocked step
- required human action
- expected output
- evidence destination
- resume criteria

## Resume Rules

The system may resume only when:

- the human step is complete
- the result is recorded in artifacts
- any required approvals remain valid
- the next action is explicit in handoff

## Failure Rules

If takeover fails or expires:

- the job stays paused
- the owner receives a recovery summary
- the system must not attempt silent fallback automation
