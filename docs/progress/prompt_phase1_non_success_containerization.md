You are implementing one bounded Phase 1 task for CodingClaw.

Read these documents first:
- docs/SYSTEM_BLUEPRINT.md
- docs/ARCHITECTURE_OVERVIEW.md
- docs/DEPLOYMENT_PLAN.md
- docs/STATE_STORE_SPEC.md
- docs/EXECUTOR_ADAPTER_CONTRACT.md
- docs/ARTIFACT_LAYOUT_SPEC.md
- docs/STATUS_MODEL.md
- docs/LOOP_SPEC.md
- docs/QA_CONTRACT.en.md

Task
Extend the Phase 1 local dockerized loop so the current success-only implementation also closes correctly for `FIXBACK_REQUIRED`, `FAILED_INFRA`, and `TIMEOUT`.

Goal
Build the smallest working implementation that preserves the current real-Docker happy path while making the Phase 1 loop stop, archive, and mirror state correctly for the allowed non-success run exits.

In scope
- `core/loop/phase1-local-flow.ts`
- `adapters/generic-cli/adapter.ts`
- `adapters/generic-cli/docker-runtime.ts`
- `core/loop/state-store.ts`
- focused verification in `tests/integration/` and any directly related targeted tests
- canonical outputs under `jobs/<job_id>/artifacts/runs/<run_id>/...`
- canonical outputs under `jobs/<job_id>/state/...`
- canonical outputs under `state/...`
- `job-manifest.json`, `checksums.txt`, and `contract-freeze.sha256` behavior for non-success exits

Out of scope
- implementing a real fixback executor or multi-round fixback workflow
- new run roles or review executor behavior
- change-request, approval-resume, credential-resume, or takeover expansions beyond preserving current behavior
- new status vocabulary
- unrelated refactors

Constraints
- Preserve the single-node Phase 1 design.
- Keep builder and QA launched through the existing Docker worker path.
- Stop the loop after the first non-success exit instead of continuing into an unsupported downstream run.
- Reuse the existing run exit to job state mapping from `STATUS_MODEL.md`.
- Keep artifacts and state externalized at the canonical host paths.
- Do not write `artifacts/final/final-summary.en.md` for jobs that do not reach final archive state.
- Do not add new dependencies.
- English repo-facing artifacts only.

Deliverables
- updated loop branching that handles builder and QA non-success exits without breaking checksum or manifest closure
- adapter runtime handling that classifies Docker timeout and container launch failure into the correct standard run exit status
- any minimal state-store adjustments required so mirrored `state/` files match the archived run outcome
- focused verification that covers at least one builder-side early stop and one QA-side non-success closeout

Acceptance criteria
- If builder exits `FIXBACK_REQUIRED`, `FAILED_INFRA`, or `TIMEOUT`, the loop does not dispatch QA, still writes the canonical builder run bundle, updates `job-manifest.json` and mirrored `state/` to the mapped job state, and keeps checksum verification passing.
- If QA exits `FIXBACK_REQUIRED`, `FAILED_INFRA`, or `TIMEOUT`, the loop does not run archive finalization, leaves `artifacts/final/final-summary.en.md` absent, and keeps the manifest plus mirrored state aligned with `STATUS_MODEL.md`.
- Docker launch failures are reported as `FAILED_INFRA`, and enforced runtime timeout exits are reported as `TIMEOUT`, without inventing new machine-readable statuses.
- The command logs still record the `docker run` invocation and the archived outputs remain under the canonical host paths.
- The existing real-Docker success path is not regressed.
- The result matches the existing docs instead of redefining them.

Execution instructions
1. Explore the relevant docs and current code first, especially `core/loop/phase1-local-flow.ts`, `adapters/generic-cli/adapter.ts`, `adapters/generic-cli/docker-runtime.ts`, and `core/loop/state-store.ts`.
2. Implement the minimum viable vertical slice for these three non-success statuses only.
3. Run focused verification, including real Docker where practical.
4. Report changed files, verification performed, and any unresolved risks.
