# Security Policy

## Purpose

This policy defines the minimum security model for CodingClaw control, worker execution, credential handling, and artifact storage.

## Security Objectives

- protect credentials and secrets
- prevent unapproved high-risk actions
- isolate jobs and workers
- preserve redacted, auditable logs
- make emergency stop immediate and reliable

## Baseline Controls

### Control Surface

- the control shell should listen on internal networks by default
- remote access should use a secure tunnel or protected gateway
- approval endpoints must require authenticated access

### Worker Isolation

- each job runs in an isolated worker context
- repo workspace, runtime home, cache, and artifact paths must not be shared across unrelated jobs
- workers must be disposable and restartable

### Credential Model

- long-lived secrets must stay in an external secret manager when possible
- workers receive only short-lived injected credentials or secret references
- task packets must not embed long-lived credentials

### Logging

- logs must be redacted before archival
- tokens, cookies, and long-lived secrets must never appear in plain text
- evidence exports must be reviewed for sensitive content before long-term storage

## High-Risk Actions

The following require explicit approval:

- network writes outside approved destinations
- production environment writes
- container control beyond the declared worker
- browser login actions
- destructive repository actions
- credential scope expansion

If approval is denied, the executor must stop with a standard exit status.

## Policy Guard Expectations

The policy guard must support:

- allowlists and denylists for commands and capabilities
- rate limits
- circuit breakers
- emergency stop
- approval interception
- credential scope checks

## Incident Handling

On suspected credential exposure or policy failure:

1. stop the active run and record `FAILED_POLICY`
2. revoke or rotate exposed credentials
3. move the job to `AWAITING_OWNER`
4. preserve redacted evidence and approval context
5. escalate the job to `TERMINATED_WITH_RISK_REPORT` if exposure is confirmed or the evidence can no longer be trusted
6. require owner review before resuming, re-freezing, or terminating

## Phase 1 Minimum Bar

Phase 1 is acceptable only if:

- dangerous actions cannot proceed without approval
- secrets are not written into task packets
- logs support redaction
- jobs do not share the same mutable runtime home
