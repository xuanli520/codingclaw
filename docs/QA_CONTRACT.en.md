# QA Contract

## Role

The QA executor validates that a builder output is reproducible, inside scope, and supported by evidence.

Phase 1 binds the QA role to the Codex execution profile.

## Inputs

QA reads:

- approved Contract Freeze
- current story record
- builder outputs
- repository state after builder run
- task packet
- trace index
- previous handoff

## Required Checks

QA must verify:

- scope compliance
- build or install reproducibility
- required tests or checks
- language boundary compliance
- evidence completeness
- acceptance closure
- artifact presence

## Required Outputs

QA must produce:

- `qa-report.en.md`
- `qa-verdict.json`
- `fixback-items.en.md` when the run does not pass
- `handoff.en.md`
- `command-log.txt`
- `run-result.json`
- `artifact-index.json`

## Verdict Rules

QA may return:

- `SUCCESS` when the story passes
- `FIXBACK_REQUIRED` when defects remain inside scope
- `CHANGE_REQUEST_REQUIRED` when a passing result would require scope change
- any standard infrastructure, policy, approval, or credential status when relevant

## Forbidden Behavior

QA must not:

- implement undocumented product changes as part of verification
- approve scope drift
- ignore missing evidence
- accept Chinese repository-facing outputs when English is required

## Completion Rule

QA is complete only when every acceptance ID for the active story is mapped to:

- pass evidence
- fail evidence
- or an explicit reason for blocked verification
