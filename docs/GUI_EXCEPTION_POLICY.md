# GUI Exception Policy

## Purpose

This policy defines when GUI handling is allowed and how it is governed.

## GUI Exception Definition

A GUI exception is a task step that cannot reasonably be completed through approved APIs, CLI tools, or non-interactive automation.

## Allowed Cases

Allowed cases may include:

- mandatory interactive login
- desktop-only tooling
- remote approval inside a managed desktop
- visual validation that requires a real GUI surface

## Disallowed Cases

GUI handling must not be used to:

- replace normal builder execution
- bypass missing CLI automation that should be implemented
- hide unlogged actions
- avoid approval and evidence requirements

## Governance Rules

- GUI entry requires explicit approval
- the main loop must pause before takeover starts
- the human or assisted operator must record what changed
- resulting artifacts must be archived
- the resumed loop must reference the takeover output

## Exit Status Mapping

GUI-related interruptions should map to:

- `AWAITING_TAKEOVER` when waiting for takeover
- `AWAITING_APPROVAL` when approval is missing
- `FAILED_EXECUTION` or `FAILED_INFRA` when the desktop session fails

## Phase 1 Rule

Phase 1 treats GUI handling as documented policy only. Operational automation is deferred until the core loop is stable.
