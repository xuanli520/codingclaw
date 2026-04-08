from __future__ import annotations

from pathlib import Path

from tests.harness.artifacts import collect_relative_files


def validate_artifact_index(run_root: Path, artifact_index: dict) -> list[str]:
    errors: list[str] = []
    actual_files = set(collect_relative_files(run_root))
    declared_files = {entry["path"] for entry in artifact_index.get("artifacts", [])}
    undeclared_files = sorted(actual_files - declared_files)
    missing_files = sorted(declared_files - actual_files)
    if artifact_index.get("run_id") != run_root.name:
        errors.append("artifact index run_id does not match run root")
    if undeclared_files:
        errors.append(f"undeclared files: {', '.join(undeclared_files)}")
    if missing_files:
        errors.append(f"missing files: {', '.join(missing_files)}")
    required_files = {"metadata/run-result.json", "metadata/artifact-index.json", "reports/handoff.en.md"}
    absent_required = sorted(required_files - actual_files)
    if absent_required:
        errors.append(f"missing canonical run files: {', '.join(absent_required)}")
    return errors
