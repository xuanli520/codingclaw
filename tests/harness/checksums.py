from __future__ import annotations

import hashlib
from pathlib import Path


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_text(text: str) -> str:
    return sha256_bytes(text.encode("utf-8"))


def sha256_file(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def write_checksum_file(output_path: Path, job_root: Path, target_paths: list[Path]) -> None:
    lines = []
    for target_path in target_paths:
        relative_path = target_path.relative_to(job_root).as_posix()
        lines.append(f"{sha256_file(target_path)}  {relative_path}")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def parse_checksum_lines(text: str) -> dict[str, str]:
    records: dict[str, str] = {}
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        checksum, relative_path = line.split(maxsplit=1)
        records[relative_path.strip()] = checksum
    return records


def verify_checksum_file(checksum_path: Path, job_root: Path) -> list[str]:
    errors: list[str] = []
    records = parse_checksum_lines(checksum_path.read_text(encoding="utf-8"))
    for relative_path, expected_checksum in records.items():
        target_path = job_root / relative_path
        if not target_path.exists():
            errors.append(f"missing checksum target: {relative_path}")
            continue
        actual_checksum = sha256_file(target_path)
        if actual_checksum != expected_checksum:
            errors.append(f"checksum mismatch: {relative_path}")
    return errors
