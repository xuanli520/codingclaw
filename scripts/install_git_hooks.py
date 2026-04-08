from __future__ import annotations

import os
import stat
import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
HOOKS_ROOT = REPO_ROOT / ".githooks"


def set_executable_bits() -> None:
    for hook_path in HOOKS_ROOT.iterdir():
        if not hook_path.is_file():
            continue
        current_mode = hook_path.stat().st_mode
        hook_path.chmod(current_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


def main() -> int:
    if not HOOKS_ROOT.exists():
        print(".githooks directory is missing", file=sys.stderr)
        return 1
    set_executable_bits()
    subprocess.run(
        ["git", "config", "core.hooksPath", os.path.relpath(HOOKS_ROOT, REPO_ROOT)],
        cwd=REPO_ROOT,
        check=True,
    )
    print(".githooks installed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
