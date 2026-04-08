from __future__ import annotations

from tests.harness.status import STATUS_FAMILIES, is_valid_status, map_run_exit_to_job_state


def validate_status_payload(payload: dict) -> list[str]:
    errors: list[str] = []
    status_family = payload.get("status_family")
    status = payload.get("status")
    if status_family not in STATUS_FAMILIES:
        errors.append(f"invalid status family: {status_family}")
        return errors
    if status is None:
        errors.append("missing status value")
        return errors
    if not is_valid_status(status_family, status):
        errors.append(f"invalid {status_family} status: {status}")
    return errors


def validate_job_status_alignment(run_result: dict, job_manifest: dict) -> list[str]:
    errors = validate_status_payload(run_result)
    errors.extend(validate_status_payload(job_manifest))
    if errors:
        return errors
    expected_job_state = map_run_exit_to_job_state(run_result["status"])
    if job_manifest["status"] != expected_job_state:
        errors.append(
            f"job state mismatch: expected {expected_job_state}, got {job_manifest['status']}"
        )
    return errors
