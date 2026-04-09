from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[2]
DEPENDENCY_SNAPSHOT_INPUTS = ["package.json", "bun.lock", "pyproject.toml", "uv.lock"]


def export_repo(tmp_path: Path) -> Path:
    repo_root = tmp_path / "repo"
    repo_root.mkdir()
    tracked_files = subprocess.run(
        ["git", "ls-files"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=True,
    ).stdout.splitlines()
    for relative_path in tracked_files:
        source = REPO_ROOT / relative_path
        target = repo_root / relative_path
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
    return repo_root


def run_phase1(repo_root: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["bun", "run", "phase1"],
        cwd=repo_root,
        capture_output=True,
        text=True,
    )


def dependency_snapshot_digest(repo_root: Path) -> str:
    inputs: list[str] = []
    for relative_path in DEPENDENCY_SNAPSHOT_INPUTS:
        path = repo_root / relative_path
        if path.exists():
            inputs.append(f"{relative_path}:{hashlib.sha256(path.read_bytes()).hexdigest()}")
    if not inputs:
        return "absent"
    return hashlib.sha256("\n".join(inputs).encode("utf-8")).hexdigest()


@pytest.mark.integration
@pytest.mark.skipif(shutil.which("bun") is None, reason="bun is required")
def test_phase1_local_rerun_rejects_mutating_existing_archive(tmp_path):
    repo_root = export_repo(tmp_path)
    first_run = run_phase1(repo_root)

    assert first_run.returncode == 0, first_run.stderr or first_run.stdout

    job_root = repo_root / "jobs" / "job-phase1-local"
    freeze_before = (job_root / "contract-freeze.json").read_text(encoding="utf-8")
    manifest_before = (job_root / "job-manifest.json").read_text(encoding="utf-8")
    checksums_before = (job_root / "checksums.txt").read_text(encoding="utf-8")
    run_dirs_before = sorted(path.name for path in (job_root / "artifacts" / "runs").iterdir() if path.is_dir())

    second_run = run_phase1(repo_root)
    combined_output = "\n".join(part for part in [second_run.stdout, second_run.stderr] if part)

    assert second_run.returncode != 0
    assert "job root already contains archived files" in combined_output
    assert freeze_before == (job_root / "contract-freeze.json").read_text(encoding="utf-8")
    assert manifest_before == (job_root / "job-manifest.json").read_text(encoding="utf-8")
    assert checksums_before == (job_root / "checksums.txt").read_text(encoding="utf-8")
    assert run_dirs_before == sorted(path.name for path in (job_root / "artifacts" / "runs").iterdir() if path.is_dir())


@pytest.mark.integration
@pytest.mark.skipif(shutil.which("bun") is None, reason="bun is required")
def test_phase1_local_freeze_digest_captures_repo_dependency_inputs(tmp_path):
    repo_root = export_repo(tmp_path)
    result = run_phase1(repo_root)

    assert result.returncode == 0, result.stderr or result.stdout

    freeze = json.loads((repo_root / "jobs" / "job-phase1-local" / "contract-freeze.json").read_text(encoding="utf-8"))

    assert freeze["dependency_snapshot_digest"] == dependency_snapshot_digest(repo_root)
