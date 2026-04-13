You are implementing one bounded Phase 1 task for CodingClaw.

Read these documents first:
- docs/SYSTEM_BLUEPRINT.md
- docs/ARCHITECTURE_OVERVIEW.md
- docs/DEPLOYMENT_PLAN.md
- docs/STATE_STORE_SPEC.md
- docs/EXECUTOR_ADAPTER_CONTRACT.md
- docs/ARTIFACT_LAYOUT_SPEC.md
- docs/STATUS_MODEL.md

Task
[Describe one concrete task in one sentence.]

Goal
Build the smallest working implementation that satisfies the Phase 1 contract for this task.

In scope
- [List exact modules or directories to touch]
- [List exact runtime objects or files to produce]
- [List exact interfaces to expose]

Out of scope
- mobile channel integration
- cloud desktop or remote desktop vendor integration
- review executor
- multi-tenant scheduling
- dashboards
- unrelated refactors

Constraints
- Preserve the single-node Phase 1 design.
- Follow the standard run input and output bundle contracts.
- Keep artifacts and state externalized.
- Do not invent new status vocabulary.
- Do not expand scope beyond this task.
- English repo-facing artifacts only.

Deliverables
- [List required files or modules]
- [List required schemas or types]
- [List required commands or entrypoints]
- [List required artifact outputs]

Acceptance criteria
- [Criterion 1]
- [Criterion 2]
- [Criterion 3]
- The result matches the existing docs instead of redefining them.

Execution instructions
1. Explore the relevant docs and current code first.
2. Implement the minimum viable vertical slice for this task.
3. Run focused verification.
4. Report changed files, verification performed, and any unresolved risks.
