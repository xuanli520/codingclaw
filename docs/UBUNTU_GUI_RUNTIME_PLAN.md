# Ubuntu GUI Runtime Plan

## Purpose

This document defines how CodingClaw runs on a single Ubuntu host with a local graphical session.

Supporting feasibility notes for this positioning are collected in [OFFICIAL_REFERENCE_NOTES.md](OFFICIAL_REFERENCE_NOTES.md).

## Positioning

The Ubuntu GUI host is the default graphical execution surface. It exists for:

- fully automated headed browser workflows
- fully automated Linux desktop tooling
- screenshot and rendered evidence capture
- exceptional local takeover when automation is blocked

## Preferred Order of Use

1. API or CLI automation
2. local headed browser or desktop automation on the Ubuntu host
3. local human takeover

## Integration Components

The integration should define:

- local display and session bootstrap
- builder launch with the Claude Code profile
- QA launch with the Codex profile
- takeover packet generation following `TAKEOVER_PACKET_TEMPLATE.en.md`
- secure local access handoff when takeover is required
- result collection
- resume signal back into the control shell

## Control Rules

- the supported deployment target is one Ubuntu host with a graphical session
- standard in-scope local GUI automation may run automatically when the active adapter profile declares the required capability
- builder uses Claude Code and QA uses Codex in Phase 1
- main loop execution must transition into `AWAITING_TAKEOVER` during manual takeover unless the task is explicitly parallel-safe
- all takeover results must be written back under `artifacts/runs/<run_id>/takeover/` and referenced by handoff and manifest records

## Phase Plan

### Phase 1

- one Ubuntu host with a graphical session
- automated builder flow through Claude Code
- automated QA flow through Codex
- local headed browser or GUI execution when a story requires a real rendered surface
- no dependency on a cloud desktop vendor

### Phase 2

- hardened host display bootstrap
- managed takeover packet format and archive path
- stable resume semantics

### Phase 3

- broader local desktop tooling support
- stronger evidence capture for local GUI flows

## Non-Goals

- depending on a cloud desktop bridge
- depending on Windows-only tools for normal execution
- replacing auditable local automation with manual remote sessions
