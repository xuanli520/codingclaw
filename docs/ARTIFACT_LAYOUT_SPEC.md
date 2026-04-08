# Artifact Layout Specification

## Purpose

This document defines the required archive structure for every CodingClaw job.

## Job Root Layout

Each job archive must include:

```text
jobs/<job_id>/
  repo/
  state/
  artifacts/
  runtime-home/
  DEVELOPMENT_PLAN.en.md
  CONTRACT_FREEZE.en.md
  contract-freeze.json
  job-manifest.json
  checksums.txt
```

## `artifacts/` Layout

```text
artifacts/
  reports/
    implementation-summary.en.md
    self-check.en.md
    qa-report.en.md
    fixback-items.en.md
    final-summary.en.md
  logs/
    builder.log
    qa.log
    commands.log
    compose.log
  evidence/
    test-results/
    screenshots/
    ci-exports/
  sessions/
    builder/
    qa/
  metadata/
    loop-metrics.json
    environment.json
    timings.json
```

## Required Rules

- every path written by a worker must be declared in the artifact index
- reports are English repository-facing outputs
- logs must be redacted before long-term archival
- evidence must remain stable enough for later review
- metadata must describe environment and timing context

## Retention Guidance

- keep contract, manifest, report, and checksum files for the full audit retention window
- keep session exports when they materially support debugging or compliance
- allow lower-priority cleanup only for reproducible cache data

## Archive Readiness

A job is not archive-ready until:

- required reports exist
- the manifest exists
- checksums have been generated
- traceability can resolve each active story outcome
