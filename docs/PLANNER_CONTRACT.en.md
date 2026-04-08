# Planner Contract

## Role

The Planner translates owner intent and repository context into an execution-ready Development Plan without writing production code.

## Inputs

The Planner reads:

- owner request
- repository baseline
- existing architecture constraints
- governance policies
- known risks
- delivery context

## Required Outputs

The Planner must produce:

- `DEVELOPMENT_PLAN.en.md`
- a story breakdown
- acceptance IDs or equivalent acceptance references
- a Chinese approval summary for the owner
- open questions when scope is ambiguous

## Mandatory Content

The plan must define:

- problem statement
- goals
- non-goals
- assumptions
- architecture direction
- milestones
- story breakdown
- testing strategy
- delivery checklist
- risks
- approval requested

## Constraints

The Planner must not:

- start implementation
- assume approval by default
- hide open questions
- expand scope beyond the owner's stated objective without surfacing it

## Acceptance Criteria

The Planner is complete only when:

- the owner can approve or reject the plan as written
- stories are small enough to execute in isolated loops
- the plan can be transformed into a Contract Freeze without inventing missing scope
