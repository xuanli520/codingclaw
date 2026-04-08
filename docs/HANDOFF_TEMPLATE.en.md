# Handoff Template

## Purpose

`handoff.en.md` is the short, durable transfer record between loop runs.

The archived copy lives under `artifacts/runs/<run_id>/reports/handoff.en.md`. The control shell may mirror the latest copy into `state/handoff.en.md`.

## Required Sections

### Run Identity

- job ID
- run ID
- freeze version
- story ID
- run role
- run attempt
- archived handoff path

### Status Summary

- exit status
- what was completed
- what remains open

### Key Evidence

- report paths
- log paths
- test result paths
- trace references

### Risks and Blockers

- current blockers
- approval needs
- credential needs
- takeover needs

### Recommended Next Step

- resume builder
- run QA
- enter fixback
- create change request
- wait for owner
- archive

## Quality Rules

- the handoff must be brief and factual
- it must not require session memory to understand the next action
- it must reference stable artifact paths rather than vague descriptions
- when mirrored to `state/handoff.en.md`, the copy must preserve the same run identity and archived handoff path
