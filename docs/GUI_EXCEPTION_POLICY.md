# GUI Exception Policy

## Purpose

This policy defines when local GUI automation is allowed and how it is governed.

## GUI Exception Definition

A GUI execution step is a task step that needs a real display, browser window, or desktop application and cannot reasonably be completed through pure CLI or API automation alone.

## Allowed Cases

Allowed cases may include:

- headed browser automation on the Ubuntu host
- Linux desktop-only tooling
- mandatory interactive login
- visual validation that requires a real rendered surface

## Disallowed Cases

GUI handling must not be used to:

- replace normal builder execution
- bypass missing CLI automation that should be implemented
- hide unlogged actions
- depend on a cloud desktop bridge for the normal execution path
- avoid approval and evidence requirements

## Governance Rules

- in-scope local GUI automation may run automatically on the approved Ubuntu host when the active adapter profile declares the required capability
- manual takeover still requires explicit approval
- the main loop must leave its active `RUNNING_*` state and enter `AWAITING_TAKEOVER` before manual takeover starts
- the human operator must record what changed
- resulting artifacts must be archived
- the resumed loop must reference the takeover output

## Exit Status Mapping

GUI-related interruptions should map to:

- `AWAITING_TAKEOVER` when waiting for manual takeover
- `AWAITING_APPROVAL` when approval is missing
- `FAILED_EXECUTION` or `FAILED_INFRA` when the local GUI session fails

## Phase 1 Rule

Phase 1 local execution records GUI and takeover contract artifacts only. Automated local GUI execution remains disabled until the active adapter profile explicitly enables browser and screenshot capabilities. Remote desktop orchestration remains out of scope.
