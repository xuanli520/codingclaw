# Takeover Packet Template

## Purpose

`takeover-packet.en.md` is the standard human handoff document for a governed GUI or interactive interruption.

## Archive Location

The packet must be archived at `artifacts/runs/<run_id>/takeover/takeover-packet.en.md`.

## Required Sections

### Run Identity

- job ID
- run ID
- freeze version
- story ID
- triggering run role
- triggering exit status

### Blocked Step

- exact blocked action
- reason automation cannot continue
- current page, tool, or environment when relevant

### Required Human Action

- concrete human task
- allowed action boundary
- forbidden actions
- expected completion signal

### Access And Approval Context

- approval card ID
- approved access method
- credential handling rule
- timeout or expiry condition

### Expected Result

- expected output
- artifact destination
- evidence destination
- resume criteria

### Resume Notes

- next loop role
- next command or check
- rollback instruction if the takeover fails

## Quality Rules

- the packet must be in English
- it must not contain long-lived secrets
- it must point to stable artifact paths
- it must be specific enough that a human can act without reading prior session memory
