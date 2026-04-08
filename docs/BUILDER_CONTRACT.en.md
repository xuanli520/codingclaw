# Builder Contract

## Role

The Builder implements one approved story within the boundary of the active Contract Freeze.

## Inputs

The Builder reads:

- approved Contract Freeze
- current story record
- task packet
- previous handoff
- current repo state
- budget and policy profile
- approval context

## Required Outputs

The Builder must produce:

- repository changes limited to the approved story
- `implementation-summary.en.md`
- `self-check.en.md`
- `handoff.en.md`
- `command-log.txt`
- `run-result.json`
- `artifact-index.json`
- `test-results/` when tests are relevant

## Required Behavior

The Builder must:

- stay inside the approved scope
- keep repository-facing outputs in English
- run required local verification where possible
- declare blockers instead of improvising around missing approval or credentials
- record evidence paths for completed work

## Forbidden Behavior

The Builder must not:

- add unapproved major features
- change architecture direction without a change request
- skip required quality checks
- hide failed commands
- continue after approval is denied

## Completion Rule

The Builder run is complete when it has either:

- finished the story and returned `SUCCESS`
- identified QA-ready outputs and returned `SUCCESS`
- identified in-scope failure and returned a standard failure status
- identified out-of-scope work and returned `CHANGE_REQUEST_REQUIRED`
