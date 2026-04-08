from __future__ import annotations

from pathlib import PurePosixPath


def validate_task_packet(task_packet: dict) -> list[str]:
    errors: list[str] = []
    required_fields = {
        "run_id",
        "run_role",
        "freeze_version",
        "artifact_path",
        "requested_capabilities",
        "story",
    }
    missing_fields = sorted(required_fields - task_packet.keys())
    if missing_fields:
        errors.append(f"missing task packet fields: {', '.join(missing_fields)}")
    if task_packet.get("run_role") not in {"builder", "qa", "review"}:
        errors.append(f"invalid run role: {task_packet.get('run_role')}")
    artifact_path = task_packet.get("artifact_path", "").replace("\\", "/")
    run_id = task_packet.get("run_id", "")
    if f"/artifacts/runs/{run_id}" not in artifact_path:
        errors.append("artifact_path is not bound to the current run root")
    story = task_packet.get("story", {})
    required_story_fields = {
        "story_id",
        "story_objective",
        "acceptance_ids",
        "in_scope_checklist",
        "out_of_scope_checklist",
        "acceptance_criteria",
        "mandatory_checks",
        "verification_targets",
        "expected_artifacts",
        "stop_conditions",
        "escalation_rules",
    }
    missing_story_fields = sorted(required_story_fields - story.keys())
    if missing_story_fields:
        errors.append(f"missing story fields: {', '.join(missing_story_fields)}")
    if not story.get("out_of_scope_checklist"):
        errors.append("task packet omits out-of-scope boundaries")
    packet_keys = {key.lower() for key in task_packet}
    if {"secret", "password", "token"} & packet_keys:
        errors.append("task packet contains forbidden secret-like top-level keys")
    for target in story.get("verification_targets", []):
        normalized = PurePosixPath(target).as_posix()
        if normalized.startswith("../"):
            errors.append(f"verification target escapes run root: {target}")
    return errors
