# Traceability Specification

## Purpose

This document defines how CodingClaw proves that an implemented story matches approved scope and verified evidence.

## Required Trace Chain

Every active story must map through this chain:

```text
story_id
 -> acceptance_ids
 -> mandatory_checks
 -> evidence_refs
 -> qa_verdict
 -> archived_artifacts
```

## Required Identifiers

At minimum, the system must carry:

- `job_id`
- `freeze_id`
- `freeze_version`
- `story_id`
- `acceptance_id`
- `run_id` or equivalent run identity
- `artifact_ref`
- `evidence_ref`

## Trace Index Responsibilities

`state/trace-index.json` should record:

- active story
- acceptance list
- required checks
- latest evidence by acceptance
- latest QA status by acceptance
- artifact locations

## Evidence Rules

Evidence may include:

- command outputs
- test reports
- screenshots
- logs
- generated reports

Every evidence object must be linkable from a concrete acceptance ID or mandatory check.

## QA Closure Rule

QA cannot pass a story unless each acceptance ID has one of:

- passing evidence
- failing evidence with fixback item
- blocked reason with explicit status

## Archive Rule

Archived job bundles must preserve enough data to reconstruct:

- what was approved
- what was executed
- what evidence was collected
- why QA passed or failed
