You are implementing one bounded Phase 1 task for CodingClaw.

Current behavior
- Recovery cards are archived under `approvals/<card_id>/` before archived `state/` and mirrored `state/` files are updated.
- Pending recovery archive records now expose `waiting_on`, `resume_action`, and `paused_run_id` so loop state can consume them directly.
- `job-manifest.json.pause_context` is populated from the archived recovery card when the latest run leaves the job in `AWAITING_OWNER` or `AWAITING_TAKEOVER`.
- `state/decisions.en.md`, `state/progress.en.md`, and `state/risk-register.en.md` now mirror the recovery gate with the archived `card_id` and waiting target instead of reusing fixback wording.
- Waiting-owner states describe owner recovery review, and waiting-takeover states describe takeover gating.

Read these documents first:
- docs/SYSTEM_BLUEPRINT.md
- docs/ARCHITECTURE_OVERVIEW.md
- docs/DEPLOYMENT_PLAN.md
- docs/STATE_STORE_SPEC.md
- docs/EXECUTOR_ADAPTER_CONTRACT.md
- docs/ARTIFACT_LAYOUT_SPEC.md
- docs/STATUS_MODEL.md
- docs/APPROVAL_CARD_SPEC.md
- docs/JOB_MANIFEST_SCHEMA.md
- docs/LANGUAGE_BOUNDARY_POLICY.md

Task
Implement Phase 1 recovery-card archival and `pause_context` population for suspended run exits in the local loop.

Goal
Build the smallest working implementation that preserves the current local Phase 1 builder-to-QA flow while adding the missing control-plane recovery objects and manifest/state recovery context required by the docs.

In scope
- `core/loop/phase1-local-flow.ts`
- `core/loop/state-store.ts`
- `ops/archive/approvals.ts`
- minimal new helpers under `ops/recovery/` if they reduce branching in the loop
- `core/contracts/types.ts` only for minimal type additions required by recovery-card payloads or archive records
- focused verification in `tests/integration/` and any directly related harness fixtures or smoke tests
- recovery control-plane artifacts under `jobs/<job_id>/approvals/<card_id>/...`
- `job-manifest.json` `approvals[]` and `pause_context`
- mirrored `jobs/<job_id>/state/...` and `state/...` recovery-facing files

Out of scope
- mobile channel delivery or webhook integration
- owner decision intake, pause/resume commands, or actual resume execution
- takeover packet generation or local GUI session orchestration
- review executor behavior
- fixback or change-request workflow redesign
- policy-engine expansion for `FAILED_POLICY`
- unrelated refactors

Constraints
- Preserve the single-node Phase 1 design.
- Reuse the existing job-state and run-exit vocabularies from `STATUS_MODEL.md`.
- Generate recovery cards only when the latest run leaves the job in a waiting state that needs owner or takeover recovery context.
- Keep recovery cards as control-plane artifacts under `approvals/`, not under `artifacts/runs/<run_id>/`.
- Keep repository-facing outputs in English; Chinese is allowed only for owner-facing recovery summaries in control-plane artifacts.
- Do not overwrite the existing approved plan/freeze approval archives when creating a recovery card.
- If a pending recovery card does not yet have a real owner decision, do not fabricate a fake resolved decision just to satisfy the current helper shape; adapt the archive flow minimally and honestly.
- Do not add new dependencies.
- Do not regress the current success path or the recently fixed non-success run bundle behavior.

Deliverables
- minimal recovery-card creation and archival for suspended Phase 1 runs
- any minimal approval-archive support required so pending recovery cards can be stored without breaking existing decided approval archives
- `job-manifest.json` updates so `pause_context` explains suspended jobs and references the related recovery card
- mirrored `state/progress.en.md`, `state/decisions.en.md`, and `state/risk-register.en.md` updates that reflect the recovery gate
- focused verification for at least one waiting-owner recovery case and one waiting-takeover or approval-interrupt recovery case

Acceptance criteria
- When builder or QA exits `FAILED_EXECUTION`, `FAILED_INFRA`, `TIMEOUT`, or `BUDGET_EXCEEDED`, the job maps to `AWAITING_OWNER`, archives a recovery card under `approvals/<card_id>/`, records the new approval entry in `job-manifest.json`, and populates `pause_context` with a non-empty reason, waiting target, resume action, paused timestamp, and related card ID.
- When builder or QA exits `AWAITING_APPROVAL`, `AWAITING_CREDENTIALS`, or `AWAITING_TAKEOVER`, the loop still stops without dispatching downstream work, and the mapped waiting state plus `pause_context` align with `STATUS_MODEL.md`.
- The archived recovery card contains the required recovery context from `APPROVAL_CARD_SPEC.md`: last exit reason, current freeze version, current story, latest evidence path, recommended next action, and resume gate.
- Recovery card artifacts stay outside per-run artifact indexes and remain referenced through canonical job-root-relative paths in `job-manifest.json`.
- Existing approved plan/freeze approval archives still work, and the current successful builder-plus-QA path is not regressed.
- The result matches the existing docs instead of redefining them.

Execution instructions
1. Explore the relevant docs and current code first, especially `core/loop/phase1-local-flow.ts`, `core/loop/state-store.ts`, `ops/archive/approvals.ts`, and the manifest/pause-context rules in `docs/APPROVAL_CARD_SPEC.md` plus `docs/JOB_MANIFEST_SCHEMA.md`.
2. Implement the minimum viable vertical slice for recovery-card archival and `pause_context` only.
3. Run focused verification for suspended-run recovery cases and the existing happy path.
4. Report changed files, verification performed, and any unresolved risks.
