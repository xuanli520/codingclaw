from __future__ import annotations

import argparse
import importlib.util
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("pytest_args", nargs="*")
    return parser.parse_args()


def normalize_pytest_args(pytest_args: list[str]) -> list[str]:
    normalized: list[str] = []
    for arg in pytest_args:
        if arg.startswith("-"):
            normalized.append(arg)
            continue
        candidate = REPO_ROOT / arg
        normalized.append(str(candidate.resolve()) if candidate.exists() else arg)
    return normalized


def build_pytest_command(args: argparse.Namespace) -> tuple[list[str], Path, dict[str, str] | None]:
    pytest_args = list(args.pytest_args)
    if not pytest_args:
        pytest_args = ["-q", str((REPO_ROOT / "tests").resolve())]
    if importlib.util.find_spec("pytest") is not None:
        return [sys.executable, "-m", "pytest", *pytest_args], REPO_ROOT, None
    if shutil.which("uvx") is None:
        raise RuntimeError("pytest is unavailable and uvx is not installed")
    env = os.environ.copy()
    env["PYTHONPATH"] = str(REPO_ROOT) if "PYTHONPATH" not in env else str(REPO_ROOT) + os.pathsep + env["PYTHONPATH"]
    return (
        [
            "uvx",
            "--isolated",
            "--no-config",
            "--from",
            "pytest",
            "pytest",
            "-c",
            str((REPO_ROOT / "pyproject.toml").resolve()),
            *normalize_pytest_args(pytest_args),
        ],
        Path(tempfile.gettempdir()),
        env,
    )


def main() -> int:
    args = parse_args()
    lock_path = REPO_ROOT / "uv.lock"
    had_lock = lock_path.exists()
    command, cwd, env = build_pytest_command(args)
    exit_code = subprocess.run(command, cwd=cwd, env=env).returncode
    if not had_lock:
        for _ in range(10):
            if not lock_path.exists():
                break
            lock_path.unlink(missing_ok=True)
            time.sleep(0.1)
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
