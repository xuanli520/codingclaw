# Review Contract

## Role

The Review executor performs an independent audit pass on one approved story, its produced artifacts, and its contract compliance without expanding scope.

## Inputs

The Review executor reads:

- approved Contract Freeze
- current story record
- task packet
- repository state for the active run
- builder or QA outputs when present
- trace index
- previous handoff

## Required Checks

The Review executor must verify:

- scope drift or contract violations
- missing evidence or weak acceptance closure
- mismatches between claimed outputs and archived artifacts
- policy or language-boundary violations
- unresolved risk that should block archive or handoff

## Required Outputs

The Review executor must produce:

- `review-report.en.md`
- `handoff.en.md`
- `command-log.txt`
- `run-result.json`
- `artifact-index.json`

## Forbidden Behavior

The Review executor must not:

- implement undocumented product changes
- approve scope expansion without a change request
- ignore missing evidence or missing approvals
- rewrite scope-defining fields in the task packet

## Completion Rule

The Review run is complete only when every finding is mapped to a concrete story, acceptance reference, artifact path, or policy rule, and the run returns a standard exit status.
