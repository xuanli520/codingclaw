from __future__ import annotations

from pathlib import Path

from tests.harness.checksums import verify_checksum_file


def validate_freeze(
    freeze: dict,
    *,
    freeze_checksum_path: Path,
    job_root: Path,
    requested_adapter: str,
    story_id: str,
) -> list[str]:
    errors: list[str] = []
    required_fields = {
        "freeze_id",
        "freeze_version",
        "base_commit",
        "dependency_digests",
        "approved_adapters",
        "adapter_versions",
        "task_packet_digests",
        "budget",
        "time_limits",
        "story_ids",
    }
    missing_fields = sorted(required_fields - freeze.keys())
    if missing_fields:
        errors.append(f"missing freeze fields: {', '.join(missing_fields)}")
    if requested_adapter not in freeze.get("approved_adapters", []):
        errors.append(f"adapter not approved: {requested_adapter}")
    if story_id not in freeze.get("story_ids", []):
        errors.append(f"story not linked to freeze: {story_id}")
    budget = freeze.get("budget", {})
    if "tokens" not in budget or "usd" not in budget:
        errors.append("freeze budget is incomplete")
    time_limits = freeze.get("time_limits", {})
    if "minutes" not in time_limits:
        errors.append("freeze time limits are incomplete")
    errors.extend(verify_checksum_file(freeze_checksum_path, job_root))
    return errors
