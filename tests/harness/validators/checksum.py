from __future__ import annotations

from pathlib import Path

from tests.harness.checksums import verify_checksum_file


def validate_checksum_manifests(job_root: Path, *checksum_paths: Path) -> list[str]:
    errors: list[str] = []
    for checksum_path in checksum_paths:
        errors.extend(verify_checksum_file(checksum_path, job_root))
    return errors
