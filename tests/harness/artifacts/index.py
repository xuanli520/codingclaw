from __future__ import annotations

from pathlib import Path, PurePosixPath

from tests.harness.checksums import sha256_file


def artifact_kind_for_path(relative_path: str) -> str:
    parts = PurePosixPath(relative_path).parts
    if not parts:
        return "unknown"
    if parts[0] == "metadata":
        return "metadata"
    if parts[0] == "reports":
        return "report"
    if parts[0] == "logs":
        return "log"
    if parts[0] == "approvals":
        return "approval"
    return "artifact"


def collect_relative_files(root: Path) -> list[str]:
    return sorted(path.relative_to(root).as_posix() for path in root.rglob("*") if path.is_file())


def make_artifact_entry(
    run_root: Path,
    relative_path: str,
    *,
    role: str | None = None,
    acceptance_ids: list[str] | None = None,
    mandatory_checks: list[str] | None = None,
    include_checksum: bool = True,
) -> dict:
    entry = {
        "path": relative_path,
        "kind": artifact_kind_for_path(relative_path),
    }
    if role is not None:
        entry["role"] = role
    if acceptance_ids:
        entry["acceptance_ids"] = sorted(set(acceptance_ids))
    if mandatory_checks:
        entry["mandatory_checks"] = sorted(set(mandatory_checks))
    target_path = run_root / relative_path
    if include_checksum and target_path.is_file():
        entry["sha256"] = sha256_file(target_path)
    return entry


def merge_artifact_indexes(*indexes: dict) -> dict:
    merged: dict[str, dict] = {}
    for index in indexes:
        for entry in index.get("artifacts", []):
            current = merged.get(entry["path"])
            if current is None:
                merged[entry["path"]] = dict(entry)
                continue
            next_entry = dict(current)
            for key, value in entry.items():
                if key in {"acceptance_ids", "mandatory_checks"}:
                    next_entry[key] = sorted(set(current.get(key, [])) | set(value))
                else:
                    next_entry[key] = value
            merged[entry["path"]] = next_entry
    return {"artifacts": [merged[key] for key in sorted(merged)]}
