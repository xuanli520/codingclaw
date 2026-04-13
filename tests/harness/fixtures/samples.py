from __future__ import annotations

from copy import deepcopy

from tests.harness.status import map_run_exit_to_job_state
from tests.harness.trace import reduce_acceptance_closure


def default_mandatory_checks() -> list[str]:
    return [
        "scope-compliance",
        "required-tests",
        "language-boundary",
        "evidence-completeness",
        "artifact-presence",
        "traceability-closure",
    ]


def build_story(
    *,
    story_id: str = "STORY-001",
    acceptance_ids: list[str] | None = None,
    expected_artifacts: list[str] | None = None,
) -> dict:
    acceptance_ids = acceptance_ids or ["ACC-001", "ACC-002"]
    expected_artifacts = expected_artifacts or []
    return {
        "story_id": story_id,
        "story_objective": "Stand up the executable harness baseline.",
        "acceptance_ids": acceptance_ids,
        "in_scope_checklist": [
            "Contract validators",
            "Contract-by-example tests",
            "Artifact-first run bundles",
        ],
        "out_of_scope_checklist": [
            "New product features",
            "Architecture replacement",
            "Quality bar reduction",
        ],
        "acceptance_criteria": [
            "Required contracts are executable.",
            "Run bundles stay traceable and reproducible.",
        ],
        "mandatory_checks": default_mandatory_checks(),
        "verification_targets": [
            "metadata/run-result.json",
            "metadata/artifact-index.json",
            "metadata/trace-index.json",
            "reports/handoff.en.md",
        ],
        "expected_artifacts": expected_artifacts,
        "stop_conditions": [
            "mandatory validation fails",
            "approval is required",
            "change request is required",
        ],
        "escalation_rules": [
            "Escalate on scope drift.",
            "Escalate on checksum failure.",
        ],
    }


def build_task_packet(
    *,
    run_id: str,
    run_role: str,
    freeze_version: str,
    artifact_path: str,
    story: dict,
    requested_capabilities: list[str] | None = None,
) -> dict:
    return {
        "run_id": run_id,
        "run_role": run_role,
        "freeze_version": freeze_version,
        "artifact_path": artifact_path,
        "requested_capabilities": requested_capabilities or ["filesystem", "shell"],
        "story": deepcopy(story),
    }


def build_contract_freeze(
    *,
    freeze_id: str,
    freeze_version: str,
    story: dict,
    base_branch: str,
    base_commit: str,
    approved_adapters: list[str],
    adapter_versions: dict[str, str],
    task_packet_digest: str,
    approval_card_id: str,
) -> dict:
    return {
        "freeze_id": freeze_id,
        "freeze_version": freeze_version,
        "approved_at": "2026-04-08T00:00:00Z",
        "approval_card_id": approval_card_id,
        "approved_objective": story["story_objective"],
        "bound_project_scope": "Harness engineering bootstrap",
        "architecture_direction": "Contract executor plus integration sandbox",
        "non_negotiable_boundaries": [
            "Freeze is the highest execution authority.",
            "Worker outputs stay under artifacts/runs/<run_id>/.",
        ],
        "base_branch": base_branch,
        "base_commit": base_commit,
        "dependency_digests": {"docs": "sha256-docs-snapshot"},
        "allowed_continuation_rule": "Resume only from approved continuation commit.",
        "approved_adapters": approved_adapters,
        "approved_run_roles": ["builder", "qa", "review"],
        "capability_limits": ["no GUI", "artifact-first logging"],
        "in_scope_checklist": deepcopy(story["in_scope_checklist"]),
        "out_of_scope_checklist": deepcopy(story["out_of_scope_checklist"]),
        "story_ids": [story["story_id"]],
        "acceptance_ids": deepcopy(story["acceptance_ids"]),
        "traceability_expectations": "Every acceptance ID resolves to evidence or blocked reason.",
        "quality_threshold": "Contracts, validators, integration, smoke.",
        "test_expectations": "Run required local verification where possible.",
        "evidence_expectations": "Artifact index, trace index, reports, checksums.",
        "required_reports": ["handoff.en.md", "qa-report.en.md"],
        "required_metadata": ["run-result.json", "artifact-index.json", "trace-index.json"],
        "archive_expectations": "Archive remains checksum-verified and trace-resolvable.",
        "language_policy": "English repository-facing outputs only.",
        "budget": {"tokens": 100000, "usd": 20},
        "time_limits": {"minutes": 30},
        "escalation_threshold": "Escalate on checksum or scope failure.",
        "approval_record": {"channel": "owner-chat", "approved_at": "2026-04-08T00:00:00Z"},
        "adapter_versions": adapter_versions,
        "task_packet_digests": [task_packet_digest],
    }


def build_development_plan_text(*, plan_id: str, job_id: str, story: dict, base_commit: str) -> str:
    sections = [
        ("1. Document Control", [f"- plan_id: {plan_id}", f"- job_id: {job_id}", "- prepared_at: 2026-04-08T00:00:00Z", "- prepared_by: harness"]),
        ("2. Problem Statement", ["- problem summary: the repository needs executable contract validation.", "- current user or operator pain: documents are not yet enforced by code."]),
        ("3. Goals", ["- primary goals: executable validators and scenario-driven integration tests.", "- measurable success signals when available: smoke flows reproduce expected exits."]),
        ("4. Non-Goals", ["- explicit exclusions: product feature delivery.", "- deferred work that must not silently enter the freeze: UI automation expansion."]),
        ("5. Assumptions", ["- repo assumptions: current repo is docs-first.", "- runtime assumptions: Python is available.", "- approval or credential assumptions: approval may pause execution."]),
        ("6. Current Repo Baseline", ["- base branch: main", f"- observed base_commit: {base_commit}", "- important repo constraints: artifact-first governance."]),
        ("7. Intended Execution Surface", ["- planned adapters: generic-cli", "- expected run roles: builder, qa", "- any GUI exception expectation: none"]),
        ("8. Architecture Direction", ["- design direction: validator-first harness.", "- key boundaries or invariants: freeze governs every run."]),
        ("9. Milestones", ["- milestone list: validators, contracts, integration, smoke.", "- sequencing notes: validators and contracts first."]),
        ("10. Story Breakdown", [f"- story IDs: {story['story_id']}", f"- objective for each story: {story['story_objective']}", f"- acceptance IDs for each story: {', '.join(story['acceptance_ids'])}", "- dependency notes when relevant: integration depends on contract fixtures."]),
        ("11. Testing Strategy", ["- required checks: contracts, validators, integration, smoke.", "- required environments: isolated job roots.", "- evidence expectations: artifact index and trace closure."]),
        ("12. Delivery Checklist", ["- required artifacts: run-result, artifact-index, trace-index.", "- required reports: qa-report, handoff.", "- archive or handoff expectations: checksums remain stable."]),
        ("13. Risks", ["- known risks: contract drift and scope drift.", "- mitigations or fallback plan: fail fast with change request or integrity halt."]),
        ("14. Open Questions", ["- unresolved scope questions: adapter rollout after generic CLI.", "- decisions that block freeze generation: none for phase 1 harness."]),
        ("15. Approval Touchpoints", ["- owner approval gates: freeze generation and change request.", "- expected change request gates: scope drift or archive contract drift."]),
        ("16. Approval Requested", ["- exact approval being requested: freeze the harness baseline.", "- next action if approved: execute harness scaffolding.", "- next action if rejected: revise scope boundaries."]),
    ]
    body = ["# Development Plan", ""]
    for title, lines in sections:
        body.append(f"## {title}")
        body.append("")
        body.extend(lines)
        body.append("")
    return "\n".join(body).rstrip() + "\n"


def build_contract_freeze_text(*, freeze: dict) -> str:
    sections = [
        ("1. Document Control", [f"- freeze_id: {freeze['freeze_id']}", f"- freeze_version: {freeze['freeze_version']}", f"- approved_at: {freeze['approved_at']}", f"- approval_card_id: {freeze['approval_card_id']}"]),
        ("2. Core Objective", [f"- approved objective: {freeze['approved_objective']}", f"- bound project scope: {freeze['bound_project_scope']}"]),
        ("3. Approved Architecture Direction", [f"- architecture decision carried from the Development Plan: {freeze['architecture_direction']}", "- non-negotiable boundaries: freeze is authoritative."]),
        ("4. Baseline Binding", [f"- base_branch: {freeze['base_branch']}", f"- base_commit: {freeze['base_commit']}", "- dependency snapshot digest: docs snapshot pinned.", f"- allowed continuation rule: {freeze['allowed_continuation_rule']}"]),
        ("5. Approved Execution Surface", [f"- approved adapters: {', '.join(freeze['approved_adapters'])}", f"- approved run roles: {', '.join(freeze['approved_run_roles'])}", f"- capability or sandbox limits when relevant: {', '.join(freeze['capability_limits'])}"]),
        ("6. In-Scope Checklist", [f"- explicit allowed work: {', '.join(freeze['in_scope_checklist'])}", "- allowed fixback scope: defects inside the same acceptance IDs."]),
        ("7. Out-of-Scope Checklist", [f"- disallowed features: {', '.join(freeze['out_of_scope_checklist'])}", "- disallowed architecture changes: architecture replacement.", "- deferred work: UI rollout after phase 1."]),
        ("8. Story and Acceptance Coverage", [f"- approved story IDs: {', '.join(freeze['story_ids'])}", f"- approved acceptance IDs: {', '.join(freeze['acceptance_ids'])}", f"- traceability expectations: {freeze['traceability_expectations']}"]),
        ("9. Quality Bar", [f"- required quality threshold: {freeze['quality_threshold']}", f"- test expectations: {freeze['test_expectations']}", f"- evidence expectations: {freeze['evidence_expectations']}"]),
        ("10. Delivery Format", [f"- required reports: {', '.join(freeze['required_reports'])}", f"- required metadata: {', '.join(freeze['required_metadata'])}", f"- archive expectations: {freeze['archive_expectations']}"]),
        ("11. Language Policy", [f"- English repository-facing requirement: {freeze['language_policy']}", "- allowed Chinese control-plane surfaces: approvals only."]),
        ("12. Budget and Time Guardrails", [f"- budget limits: {freeze['budget']}", f"- timeout limits: {freeze['time_limits']}", f"- escalation threshold: {freeze['escalation_threshold']}"]),
        ("13. Approval Record", [f"- approving actor or channel: {freeze['approval_record']['channel']}", f"- approval timestamp: {freeze['approval_record']['approved_at']}", f"- related decision artifacts: {freeze['approval_card_id']}"]),
        ("14. Integrity Metadata", ["- freeze hash: recorded in contract-freeze.sha256", "- contract-freeze.json path: contract/contract-freeze.json", "- contract-freeze.sha256 path: contract/contract-freeze.sha256"]),
    ]
    body = ["# Contract Freeze", ""]
    for title, lines in sections:
        body.append(f"## {title}")
        body.append("")
        body.extend(lines)
        body.append("")
    return "\n".join(body).rstrip() + "\n"


def build_run_result(*, run_id: str, run_role: str, story_id: str, status: str, artifact_root: str, resumed_from: str | None = None) -> dict:
    payload = {
        "run_id": run_id,
        "run_role": run_role,
        "story_id": story_id,
        "status_family": "run_exit",
        "status": status,
        "artifact_root": artifact_root,
        "started_at": "2026-04-08T00:00:00Z",
        "ended_at": "2026-04-08T00:05:00Z",
    }
    if resumed_from is not None:
        payload["resumed_from"] = resumed_from
    return payload


def build_trace_index(
    *,
    story: dict,
    acceptance_statuses: dict[str, str],
    mandatory_check_statuses: dict[str, str],
    evidence_refs: dict[str, list[str]],
    mandatory_evidence_refs: dict[str, list[str]],
) -> dict:
    acceptance = {}
    for acceptance_id in story["acceptance_ids"]:
        acceptance[acceptance_id] = {
            "status": acceptance_statuses[acceptance_id],
            "artifacts": evidence_refs[acceptance_id],
        }
    mandatory_checks = {}
    for check_name in story["mandatory_checks"]:
        mandatory_checks[check_name] = {
            "status": mandatory_check_statuses[check_name],
            "artifacts": mandatory_evidence_refs[check_name],
        }
    return {
        "story_id": story["story_id"],
        "acceptance": acceptance,
        "mandatory_checks": mandatory_checks,
    }


def build_qa_verdict(*, story: dict, trace_index: dict, status: str) -> dict:
    return {
        "story_id": story["story_id"],
        "status_family": "run_exit",
        "status": status,
        "acceptance_closure": reduce_acceptance_closure(trace_index),
    }


def build_approval_card(*, card_id: str, story_id: str, state: str, requested_action: str) -> dict:
    return {
        "card_id": card_id,
        "story_id": story_id,
        "status_family": "approval_state",
        "status": state,
        "requested_action": requested_action,
    }


def build_job_manifest(
    *,
    job_id: str,
    freeze: dict,
    plan_path: str,
    plan_checksum: str,
    freeze_path: str,
    freeze_json_path: str,
    freeze_checksum_path: str,
    freeze_checksum: str,
    run_result: dict,
    run_root: str,
    task_packet_path: str,
    artifact_index_path: str,
    handoff_path: str,
    active_story: dict,
    approval_records: list[dict],
) -> dict:
    job_state = map_run_exit_to_job_state(run_result["status"])
    paused = job_state in {"AWAITING_OWNER", "AWAITING_TAKEOVER"}
    waiting_on = "owner" if job_state == "AWAITING_OWNER" else ("takeover" if job_state == "AWAITING_TAKEOVER" else None)
    latest_approval = approval_records[-1] if paused and approval_records else None
    pause_context = {
        "is_paused": paused,
        "pause_reason": run_result["status"] if paused else None,
        "waiting_on": (latest_approval or {}).get("waiting_on", waiting_on) if paused else None,
        "resume_action": (
            (latest_approval or {}).get("resume_action")
            or (latest_approval or {}).get("requested_action")
            or ("Wait for owner input before continuing." if waiting_on == "owner" else "Wait for takeover before continuing.")
        )
        if paused
        else None,
        "paused_at": "2026-04-08T00:05:00Z" if paused else None,
        "related_card_id": latest_approval["card_id"] if latest_approval else None,
        "expires_at": (latest_approval or {}).get("timeout_at") if paused else None,
    }
    return {
        "job_id": job_id,
        "project_id": "codingclaw",
        "created_at": "2026-04-08T00:00:00Z",
        "updated_at": "2026-04-08T00:05:00Z",
        "owner_channel": "owner-chat",
        "status_family": "job_state",
        "status": job_state,
        "current_freeze_version": freeze["freeze_version"],
        "base_branch": freeze["base_branch"],
        "base_commit": freeze["base_commit"],
        "active_story_id": active_story["story_id"],
        "current_run_id": run_result["run_id"],
        "approved_adapter_set": freeze["approved_adapters"],
        "pause_context": pause_context,
        "language_policy": "docs/LANGUAGE_BOUNDARY_POLICY.md",
        "budget_limits": freeze["budget"],
        "time_limits": freeze["time_limits"],
        "repo_root": ".",
        "state_root": "state",
        "approvals_root": "approvals",
        "artifact_root": "artifacts",
        "checksum_file": "checksums.txt",
        "plan": {
            "path": plan_path,
            "checksum": plan_checksum,
            "approval_card_id": "card-plan-001",
            "summary_zh_ref": "",
            "approval_state": "DECIDED",
            "approved_at": "2026-04-08T00:00:00Z",
        },
        "freeze": {
            "freeze_id": freeze["freeze_id"],
            "version": freeze["freeze_version"],
            "path": freeze_path,
            "json_path": freeze_json_path,
            "checksum_path": freeze_checksum_path,
            "hash": freeze_checksum,
            "approval_card_id": freeze["approval_card_id"],
            "approved_at": freeze["approved_at"],
        },
        "stories": [
            {
                "story_id": active_story["story_id"],
                "queue_state": job_state,
                "acceptance_ids": active_story["acceptance_ids"],
                "latest_run_id": run_result["run_id"],
                "latest_run_role": run_result["run_role"],
                "latest_run_status": run_result["status"],
                "latest_evidence_refs": [artifact_index_path, handoff_path],
                "last_updated_at": "2026-04-08T00:05:00Z",
            }
        ],
        "runs": [
            {
                "run_id": run_result["run_id"],
                "run_role": run_result["run_role"],
                "story_id": run_result["story_id"],
                "run_exit_status": run_result["status"],
                "root": run_root,
                "task_packet_path": task_packet_path,
                "run_result_path": f"{run_root}/metadata/run-result.json",
                "artifact_index_path": artifact_index_path,
                "handoff_path": handoff_path,
                "takeover_packet_path": "",
                "started_at": run_result["started_at"],
                "ended_at": run_result["ended_at"],
            }
        ],
        "approvals": deepcopy(approval_records),
        "artifacts": {
            "runs_root": "artifacts/runs",
            "sessions_root": "artifacts/sessions",
            "final_root": "artifacts/final",
            "shared_metadata_refs": [],
            "latest_final_summary": "",
        },
    }
