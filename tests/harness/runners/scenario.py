from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

from tests.harness.artifacts import collect_relative_files, make_artifact_entry
from tests.harness.checksums import sha256_file, sha256_text, write_checksum_file
from tests.harness.fixtures import (
    build_approval_card,
    build_contract_freeze,
    build_contract_freeze_text,
    build_development_plan_text,
    build_job_manifest,
    build_qa_verdict,
    build_run_result,
    build_story,
    build_task_packet,
    build_trace_index,
    default_mandatory_checks,
)


@dataclass(slots=True)
class Scenario:
    run_id: str = "run-001"
    job_id: str = "job-001"
    story_id: str = "STORY-001"
    run_role: str = "qa"
    exit_status: str = "SUCCESS"
    base_branch: str = "main"
    base_commit: str = "base-commit-001"
    freeze_id: str = "freeze-001"
    freeze_version: str = "freeze-v1"
    approved_adapter: str = "generic-cli"
    adapter_version: str = "0.1.0"
    approval_card_id: str = "card-001"
    resume_from: str | None = None
    approval_decided: bool = False
    tamper_freeze: bool = False
    outside_writes: dict[str, str] = field(default_factory=dict)
    chinese_outputs: dict[str, str] = field(default_factory=dict)
    acceptance_statuses: dict[str, str] | None = None
    mandatory_check_statuses: dict[str, str] | None = None


def _json_text(payload: dict) -> str:
    return json.dumps(payload, indent=2, sort_keys=True) + "\n"


def _write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def _write_json(path: Path, payload: dict) -> None:
    _write_text(path, _json_text(payload))


def _default_acceptance_statuses(story: dict, exit_status: str) -> dict[str, str]:
    if exit_status == "SUCCESS":
        return {acceptance_id: "pass" for acceptance_id in story["acceptance_ids"]}
    if exit_status in {"FIXBACK_REQUIRED", "CHANGE_REQUEST_REQUIRED", "FAILED_POLICY"}:
        return {
            acceptance_id: ("fail" if index == 0 else "pass")
            for index, acceptance_id in enumerate(story["acceptance_ids"])
        }
    return {acceptance_id: "blocked" for acceptance_id in story["acceptance_ids"]}


def _default_mandatory_statuses(exit_status: str) -> dict[str, str]:
    statuses = {check_name: "pass" for check_name in default_mandatory_checks()}
    if exit_status == "CHANGE_REQUEST_REQUIRED":
        statuses["scope-compliance"] = "fail"
    if exit_status == "FAILED_POLICY":
        statuses["language-boundary"] = "fail"
    if exit_status in {"AWAITING_APPROVAL", "AWAITING_CREDENTIALS", "AWAITING_TAKEOVER"}:
        statuses["required-tests"] = "blocked"
    return statuses


def _expected_artifacts(scenario: Scenario) -> list[str]:
    artifacts = [
        "task-packet.json",
        "logs/command-log.txt",
        "metadata/run-result.json",
        "metadata/trace-index.json",
        "metadata/artifact-index.json",
        "metadata/qa-verdict.json",
        "reports/handoff.en.md",
        "reports/qa-report.en.md",
    ]
    if scenario.exit_status in {"FIXBACK_REQUIRED", "CHANGE_REQUEST_REQUIRED", "FAILED_POLICY"}:
        artifacts.append("reports/fixback-items.en.md")
    if scenario.exit_status == "AWAITING_APPROVAL" or scenario.approval_decided:
        artifacts.extend(
            [
                f"approvals/{scenario.approval_card_id}/approval-card.json",
                f"approvals/{scenario.approval_card_id}/summary.zh.md",
            ]
        )
        if scenario.approval_decided:
            artifacts.append(f"approvals/{scenario.approval_card_id}/decision.json")
    if scenario.resume_from is not None:
        artifacts.append("metadata/resume-context.json")
    return sorted(set(artifacts))


def _evidence_refs_for_acceptance(status: str, *, scenario: Scenario) -> list[str]:
    if status == "pass":
        return ["reports/qa-report.en.md", "metadata/qa-verdict.json"]
    if status == "fail":
        if scenario.exit_status in {"FIXBACK_REQUIRED", "CHANGE_REQUEST_REQUIRED", "FAILED_POLICY"}:
            return ["reports/fixback-items.en.md", "metadata/qa-verdict.json"]
        return ["metadata/qa-verdict.json"]
    if scenario.exit_status == "AWAITING_APPROVAL":
        return [f"approvals/{scenario.approval_card_id}/approval-card.json"]
    return ["metadata/run-result.json"]


def _mandatory_evidence_refs(check_name: str, status: str, *, scenario: Scenario) -> list[str]:
    if check_name == "scope-compliance" and status == "fail":
        return ["metadata/run-result.json", "reports/fixback-items.en.md"]
    if check_name == "language-boundary" and status == "fail":
        return ["reports/fixback-items.en.md"]
    if status == "blocked":
        if scenario.exit_status == "AWAITING_APPROVAL":
            return [f"approvals/{scenario.approval_card_id}/approval-card.json"]
        return ["metadata/run-result.json"]
    return ["metadata/run-result.json", "metadata/artifact-index.json"]


def materialize_scenario(root: Path, scenario: Scenario) -> dict:
    job_root = root / scenario.job_id
    contract_root = job_root / "contract"
    state_root = job_root / "state"
    run_root = job_root / "artifacts" / "runs" / scenario.run_id
    contract_root.mkdir(parents=True, exist_ok=True)
    state_root.mkdir(parents=True, exist_ok=True)
    run_root.mkdir(parents=True, exist_ok=True)

    story = build_story(story_id=scenario.story_id, expected_artifacts=_expected_artifacts(scenario))
    task_packet = build_task_packet(
        run_id=scenario.run_id,
        run_role=scenario.run_role,
        freeze_version=scenario.freeze_version,
        artifact_path=run_root.as_posix(),
        story=story,
    )
    task_packet_digest = sha256_text(_json_text(task_packet))
    freeze = build_contract_freeze(
        freeze_id=scenario.freeze_id,
        freeze_version=scenario.freeze_version,
        story=story,
        base_branch=scenario.base_branch,
        base_commit=scenario.base_commit,
        approved_adapters=[scenario.approved_adapter],
        adapter_versions={scenario.approved_adapter: scenario.adapter_version},
        task_packet_digest=task_packet_digest,
        approval_card_id=scenario.approval_card_id,
    )

    plan_path = contract_root / "DEVELOPMENT_PLAN.en.md"
    freeze_path = contract_root / "CONTRACT_FREEZE.en.md"
    freeze_json_path = contract_root / "contract-freeze.json"
    freeze_checksum_path = contract_root / "contract-freeze.sha256"

    _write_text(
        plan_path,
        build_development_plan_text(plan_id="plan-001", job_id=scenario.job_id, story=story, base_commit=scenario.base_commit),
    )
    _write_text(freeze_path, build_contract_freeze_text(freeze=freeze))
    _write_json(freeze_json_path, freeze)
    write_checksum_file(freeze_checksum_path, job_root, [freeze_path, freeze_json_path])

    if scenario.tamper_freeze:
        freeze_json = json.loads(freeze_json_path.read_text(encoding="utf-8"))
        freeze_json["base_commit"] = "tampered-commit"
        _write_json(freeze_json_path, freeze_json)

    _write_json(run_root / "task-packet.json", task_packet)

    acceptance_statuses = scenario.acceptance_statuses or _default_acceptance_statuses(story, scenario.exit_status)
    mandatory_check_statuses = scenario.mandatory_check_statuses or _default_mandatory_statuses(scenario.exit_status)

    evidence_refs = {
        acceptance_id: _evidence_refs_for_acceptance(status, scenario=scenario)
        for acceptance_id, status in acceptance_statuses.items()
    }
    mandatory_evidence_refs = {
        check_name: _mandatory_evidence_refs(status=status, check_name=check_name, scenario=scenario)
        for check_name, status in mandatory_check_statuses.items()
    }
    trace_index = build_trace_index(
        story=story,
        acceptance_statuses=acceptance_statuses,
        mandatory_check_statuses=mandatory_check_statuses,
        evidence_refs=evidence_refs,
        mandatory_evidence_refs=mandatory_evidence_refs,
    )
    run_result = build_run_result(
        run_id=scenario.run_id,
        run_role=scenario.run_role,
        story_id=scenario.story_id,
        status=scenario.exit_status,
        artifact_root=run_root.as_posix(),
        resumed_from=scenario.resume_from,
    )
    qa_verdict = build_qa_verdict(story=story, trace_index=trace_index, status=scenario.exit_status)

    _write_text(run_root / "logs" / "command-log.txt", "pytest -m smoke\n")
    _write_text(run_root / "reports" / "handoff.en.md", f"# Handoff\n\nRun {scenario.run_id} produced {scenario.exit_status}.\n")
    _write_text(run_root / "reports" / "qa-report.en.md", f"# QA Report\n\nStory {scenario.story_id} is {scenario.exit_status}.\n")
    if scenario.exit_status in {"FIXBACK_REQUIRED", "CHANGE_REQUEST_REQUIRED", "FAILED_POLICY"}:
        _write_text(
            run_root / "reports" / "fixback-items.en.md",
            "# Fixback Items\n\n- Align the output bundle with the active scope.\n",
        )
    _write_json(run_root / "metadata" / "run-result.json", run_result)
    _write_json(run_root / "metadata" / "trace-index.json", trace_index)
    _write_json(run_root / "metadata" / "qa-verdict.json", qa_verdict)
    if scenario.resume_from is not None:
        _write_json(
            run_root / "metadata" / "resume-context.json",
            {"resumed_from": scenario.resume_from, "decision_path": f"approvals/{scenario.resume_from}/decision.json"},
        )

    approval_records: list[dict] = []
    if scenario.exit_status == "AWAITING_APPROVAL" or scenario.approval_decided:
        approval_dir = run_root / "approvals" / scenario.approval_card_id
        approval_card = build_approval_card(
            card_id=scenario.approval_card_id,
            story_id=scenario.story_id,
            state="PENDING" if not scenario.approval_decided else "DECIDED",
            requested_action="Approve continuation" if scenario.exit_status == "AWAITING_APPROVAL" else "Record resume decision",
        )
        _write_json(approval_dir / "approval-card.json", approval_card)
        _write_text(approval_dir / "summary.zh.md", "审批摘要\n")
        approval_record = {
            "card_id": scenario.approval_card_id,
            "card_state": approval_card["status"],
            "card_type": "approval",
            "requested_action": approval_card["requested_action"],
            "decision": "",
            "snapshot_path": f"artifacts/runs/{scenario.run_id}/approvals/{scenario.approval_card_id}/approval-card.json",
            "decision_path": "",
            "summary_zh_ref": f"artifacts/runs/{scenario.run_id}/approvals/{scenario.approval_card_id}/summary.zh.md",
            "decided_at": "",
        }
        if scenario.approval_decided:
            decision_payload = build_approval_card(
                card_id=scenario.approval_card_id,
                story_id=scenario.story_id,
                state="DECIDED",
                requested_action="Approved",
            )
            _write_json(approval_dir / "decision.json", decision_payload)
            approval_record["decision"] = "approved"
            approval_record["decision_path"] = f"artifacts/runs/{scenario.run_id}/approvals/{scenario.approval_card_id}/decision.json"
            approval_record["decided_at"] = "2026-04-08T00:06:00Z"
        approval_records.append(approval_record)

    for relative_path, content in scenario.chinese_outputs.items():
        _write_text(run_root / relative_path, content)
    for relative_path, content in scenario.outside_writes.items():
        _write_text(job_root / relative_path, content)

    artifact_entries = [
        make_artifact_entry(
            run_root,
            relative_path,
            role=scenario.run_role,
            acceptance_ids=story["acceptance_ids"] if relative_path.startswith("reports/") else None,
            mandatory_checks=story["mandatory_checks"] if relative_path.startswith("metadata/") else None,
        )
        for relative_path in collect_relative_files(run_root)
        if relative_path != "metadata/artifact-index.json"
    ]
    artifact_entries.append(
        make_artifact_entry(
            run_root,
            "metadata/artifact-index.json",
            role=scenario.run_role,
            mandatory_checks=story["mandatory_checks"],
            include_checksum=False,
        )
    )
    artifact_index = {
        "run_id": scenario.run_id,
        "run_root": run_root.as_posix(),
        "artifacts": sorted(artifact_entries, key=lambda entry: entry["path"]),
    }
    _write_json(run_root / "metadata" / "artifact-index.json", artifact_index)

    job_manifest = build_job_manifest(
        job_id=scenario.job_id,
        freeze=freeze if not scenario.tamper_freeze else json.loads(freeze_json_path.read_text(encoding="utf-8")),
        plan_path="contract/DEVELOPMENT_PLAN.en.md",
        plan_checksum=sha256_file(plan_path),
        freeze_path="contract/CONTRACT_FREEZE.en.md",
        freeze_json_path="contract/contract-freeze.json",
        freeze_checksum_path="contract/contract-freeze.sha256",
        freeze_checksum=sha256_file(freeze_path),
        run_result=run_result,
        run_root=f"artifacts/runs/{scenario.run_id}",
        task_packet_path=f"artifacts/runs/{scenario.run_id}/task-packet.json",
        artifact_index_path=f"artifacts/runs/{scenario.run_id}/metadata/artifact-index.json",
        handoff_path=f"artifacts/runs/{scenario.run_id}/reports/handoff.en.md",
        active_story=story,
        approval_records=approval_records,
    )
    _write_json(job_root / "job-manifest.json", job_manifest)
    _write_text(
        state_root / "handoff.en.md",
        f"# Latest Handoff\n\nSee artifacts/runs/{scenario.run_id}/reports/handoff.en.md.\n",
    )
    write_checksum_file(
        job_root / "checksums.txt",
        job_root,
        [
            plan_path,
            freeze_path,
            freeze_json_path,
            run_root / "metadata" / "run-result.json",
            run_root / "metadata" / "artifact-index.json",
            run_root / "reports" / "handoff.en.md",
        ],
    )

    return {
        "job_root": job_root,
        "run_root": run_root,
        "plan_path": plan_path,
        "freeze_path": freeze_path,
        "freeze_json_path": freeze_json_path,
        "freeze_checksum_path": freeze_checksum_path,
        "task_packet_path": run_root / "task-packet.json",
        "run_result_path": run_root / "metadata" / "run-result.json",
        "trace_index_path": run_root / "metadata" / "trace-index.json",
        "artifact_index_path": run_root / "metadata" / "artifact-index.json",
        "qa_verdict_path": run_root / "metadata" / "qa-verdict.json",
        "job_manifest_path": job_root / "job-manifest.json",
        "checksums_path": job_root / "checksums.txt",
        "story": story,
        "freeze": freeze,
        "task_packet": task_packet,
        "run_result": run_result,
        "trace_index": trace_index,
        "artifact_index": artifact_index,
        "qa_verdict": qa_verdict,
        "job_manifest": job_manifest,
    }


def collect_text_surfaces(root: Path) -> dict[str, str]:
    surfaces: dict[str, str] = {}
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        if path.suffix.lower() not in {".md", ".txt", ".json", ".py", ".toml"}:
            continue
        surfaces[path.relative_to(root).as_posix()] = path.read_text(encoding="utf-8")
    return surfaces
