from __future__ import annotations

from pathlib import Path, PurePosixPath


def _matches_expected(relative_path: str, patterns: list[str]) -> bool:
    path = PurePosixPath(relative_path)
    return any(path.match(pattern) for pattern in patterns)


def validate_scope_boundaries(
    *,
    run_root: Path,
    produced_paths: list[Path],
    expected_artifacts: list[str],
) -> list[str]:
    errors: list[str] = []
    for path in produced_paths:
        try:
            relative_path = path.relative_to(run_root).as_posix()
        except ValueError:
            errors.append(f"path escaped run root: {path.as_posix()}")
            continue
        if not _matches_expected(relative_path, expected_artifacts):
            errors.append(f"undeclared artifact path: {relative_path}")
    return errors
