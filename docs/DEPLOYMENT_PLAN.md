# CodingClaw Deployment Plan

## Goal

This document defines the recommended deployment path for CodingClaw from local development to a stable single-node production baseline on one Ubuntu host with a graphical session.

Official feasibility references for Docker, SQLite, and PostgreSQL are collected in [OFFICIAL_REFERENCE_NOTES.md](OFFICIAL_REFERENCE_NOTES.md).

## Deployment Principles

- deploy the smallest auditable loop first
- keep control and worker boundaries explicit
- make recovery and evidence export work before adding scale
- avoid distributed complexity in Phase 1

## Phase 1 Topology

### Control Host

The control host runs:

- the control shell service
- mobile channel webhook or polling adapter
- approval queue manager
- scheduler
- budget and policy guards
- the local graphical session used by headed automation when a story requires a real GUI surface

### Worker Runtime

Workers run in Docker with role-specific images:

- `worker-base`
- `worker-builder` with the Claude Code builder profile
- `worker-qa` with the Codex QA profile

Each worker mounts:

- `/work/repo`
- `/work/state`
- `/work/artifacts`
- `/work/cache`
- `/work/runtime-home`

Phase 1 should prefer bind mounts for `repo`, `state`, and `artifacts` so the control shell and the host can inspect them directly.

Cache paths or other container-owned persistent data may move to Docker volumes when direct host-side inspection is not required.

### Data Services

Phase 1 may use:

- local volume storage for repo, state, and artifacts
- SQLite for single-node, local metadata with low write concurrency
- Postgres when multi-process or multi-client coordination, higher write concurrency, or a true client/server deployment model is required

Redis is optional and not required for the first release.

## Release Sequence

### Stage 0: Local Proof

- manual local control shell
- one local repo
- one builder run
- one QA run
- one archive export

### Stage 1: Single-Node Service

- daemonized control shell
- one mobile channel
- Dockerized workers
- approval cards and recovery cards
- checksum generation
- archived job bundles

### Stage 2: Stability Upgrade

- stronger metadata storage
- crash recovery
- alerting
- better budget and timeout policy
- evidence retention rules

### Stage 3: Adapter Expansion

- Claude Code builder adapter
- Codex QA adapter
- Aider adapter
- richer capability manifests
- optional review executor

### Stage 4: Local GUI Automation Hardening

- host display bootstrap
- headed browser or desktop automation evidence capture
- takeover packet flow for exceptional local recovery only

## Environment Separation

### Development

- local control shell
- local test repos
- mock credentials
- debug logging enabled

### Staging

- isolated mobile channel
- staging secrets
- realistic worker images
- smoke-tested approval flow

### Production

- internal network control surface
- short-lived credentials
- redacted logs
- explicit approval for high-risk actions
- persistent artifact and manifest storage

## Operational Requirements

- the control surface should not be directly exposed to the public internet
- incoming access should pass through a secure tunnel or protected reverse proxy
- each job must isolate its repo, runtime home, and temporary credentials
- job archives must survive worker restarts

## Rollout Gates

The deployment is not production-ready until all of the following are true:

- Development Plan approval works end to end
- Contract Freeze records `base_commit` and dependency digest
- builder and QA runs produce standardized outputs
- traceability closes from story to evidence to verdict
- archive export and checksum verification both pass
- stop, pause, and resume behavior are tested

## Deferred Infrastructure

The following items are intentionally deferred beyond Phase 1:

- multi-tenant job queues
- horizontally scaled schedulers
- cloud desktop bridges or remote-assistance control planes
- dashboard analytics
- shared warm workers
