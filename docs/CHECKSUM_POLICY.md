# Checksum Policy

## Purpose

Checksums protect the integrity of governance objects, reports, and key evidence bundles.

## Minimum Covered Objects

The system must generate checksums for:

- Development Plan
- Contract Freeze
- `contract-freeze.json`
- final repository archive
- QA report
- final summary
- key session or run logs
- important evidence bundles

## File Placement

- per-job checksum output should be written to `checksums.txt`
- freeze-specific checksum files may be written beside the freeze objects
- artifact index entries should reference checksum records when available

## Timing Rules

Checksums should be generated:

- immediately after Contract Freeze generation
- immediately after a run finishes and artifacts stabilize
- immediately before archive finalization

## Verification Rules

The control shell or QA must verify checksums when:

- resuming from a previous run
- comparing a current repo to the frozen baseline package
- validating final archive integrity

## Algorithm Guidance

Use a single strong hash algorithm consistently across the system. The blueprint assumes SHA-256.

## Failure Handling

If checksum verification fails:

- stop the affected workflow
- mark the job as integrity-failed
- require owner review or regeneration before continuing
