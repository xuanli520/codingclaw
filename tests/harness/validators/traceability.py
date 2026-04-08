from __future__ import annotations

from tests.harness.trace import TRACE_STATES


def validate_traceability(story: dict, trace_index: dict, artifact_index: dict) -> list[str]:
    errors: list[str] = []
    declared_artifacts = {entry["path"] for entry in artifact_index.get("artifacts", [])}
    acceptance_trace = trace_index.get("acceptance", {})
    for acceptance_id in story.get("acceptance_ids", []):
        entry = acceptance_trace.get(acceptance_id)
        if entry is None:
            errors.append(f"missing acceptance trace: {acceptance_id}")
            continue
        if entry.get("status") not in TRACE_STATES:
            errors.append(f"invalid acceptance trace status: {acceptance_id}")
        artifact_refs = entry.get("artifacts", [])
        if not artifact_refs:
            errors.append(f"acceptance trace missing artifacts: {acceptance_id}")
        for artifact_ref in artifact_refs:
            if artifact_ref not in declared_artifacts:
                errors.append(f"trace artifact missing from index: {acceptance_id} -> {artifact_ref}")
    mandatory_trace = trace_index.get("mandatory_checks", {})
    for check_name in story.get("mandatory_checks", []):
        entry = mandatory_trace.get(check_name)
        if entry is None:
            errors.append(f"missing mandatory check trace: {check_name}")
            continue
        if entry.get("status") not in TRACE_STATES:
            errors.append(f"invalid mandatory check status: {check_name}")
        for artifact_ref in entry.get("artifacts", []):
            if artifact_ref not in declared_artifacts:
                errors.append(f"mandatory check artifact missing from index: {check_name} -> {artifact_ref}")
    return errors
