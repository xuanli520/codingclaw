from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


API_VERSION = "2022-11-28"
API_ROOT = "https://api.github.com"
DEFAULT_REQUIRED_CHECK = "verify"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["apply", "check", "print-payload"], nargs="?", default="apply")
    parser.add_argument("--repo")
    parser.add_argument("--branch", default="main")
    parser.add_argument("--required-check", default=DEFAULT_REQUIRED_CHECK)
    parser.add_argument("--token-env", default="GITHUB_TOKEN")
    return parser.parse_args()


def infer_repo() -> str:
    remote_url = (
        subprocess.check_output(
            ["git", "remote", "get-url", "origin"],
            text=True,
            encoding="utf-8",
            cwd=Path(__file__).resolve().parents[1],
        )
        .strip()
        .removesuffix(".git")
    )
    parsed = urllib.parse.urlparse(remote_url)
    if parsed.scheme in {"http", "https"}:
        path = parsed.path.strip("/")
        if path.count("/") == 1:
            return path
    if remote_url.startswith("git@github.com:"):
        return remote_url.removeprefix("git@github.com:").strip("/")
    raise RuntimeError(f"unsupported remote url: {remote_url}")


def load_token(token_env: str) -> str:
    for key in (token_env, "GH_TOKEN", "GITHUB_PAT"):
        token = os.environ.get(key)
        if token:
            return token
    raise RuntimeError(
        f"missing GitHub admin token; set {token_env}, GH_TOKEN, or GITHUB_PAT"
    )


def build_payload(required_check: str) -> dict:
    return {
        "required_status_checks": {
            "strict": True,
            "checks": [{"context": required_check, "app_id": -1}],
        },
        "enforce_admins": True,
        "required_pull_request_reviews": None,
        "restrictions": None,
        "required_linear_history": True,
        "allow_force_pushes": False,
        "allow_deletions": False,
        "block_creations": False,
        "required_conversation_resolution": True,
        "lock_branch": False,
        "allow_fork_syncing": False,
    }


def request_json(method: str, url: str, token: str, payload: dict | None = None) -> dict:
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {token}",
        "X-GitHub-Api-Version": API_VERSION,
        "User-Agent": "codingclaw-repo-gate",
    }
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(url, headers=headers, data=data, method=method)
    try:
        with urllib.request.urlopen(request) as response:
            raw = response.read().decode("utf-8")
            return {} if not raw else json.loads(raw)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"GitHub API {exc.code}: {detail}") from exc


def protection_url(repo: str, branch: str) -> str:
    owner, name = repo.split("/", 1)
    return f"{API_ROOT}/repos/{owner}/{name}/branches/{branch}/protection"


def ensure_gate(repo: str, branch: str, required_check: str, token: str) -> dict:
    payload = build_payload(required_check)
    return request_json("PUT", protection_url(repo, branch), token, payload)


def read_gate(repo: str, branch: str, token: str) -> dict:
    return request_json("GET", protection_url(repo, branch), token)


def validate_gate(protection: dict, required_check: str) -> list[str]:
    errors: list[str] = []
    required_status_checks = protection.get("required_status_checks") or {}
    checks = required_status_checks.get("checks") or []
    check_contexts = {entry.get("context") for entry in checks}
    if required_check not in check_contexts:
        errors.append(f"missing required check: {required_check}")
    if required_status_checks.get("strict") is not True:
        errors.append("required status checks are not strict")
    enforce_admins = protection.get("enforce_admins") or {}
    if enforce_admins.get("enabled") is not True:
        errors.append("admins are not enforced")
    required_linear_history = protection.get("required_linear_history") or {}
    if required_linear_history.get("enabled") is not True:
        errors.append("linear history is not required")
    required_conversation_resolution = protection.get("required_conversation_resolution") or {}
    if required_conversation_resolution.get("enabled") is not True:
        errors.append("conversation resolution is not required")
    allow_force_pushes = protection.get("allow_force_pushes") or {}
    if allow_force_pushes.get("enabled") is True:
        errors.append("force pushes are still enabled")
    allow_deletions = protection.get("allow_deletions") or {}
    if allow_deletions.get("enabled") is True:
        errors.append("branch deletions are still enabled")
    return errors


def main() -> int:
    args = parse_args()
    repo = args.repo or infer_repo()
    if args.command == "print-payload":
        print(json.dumps(build_payload(args.required_check), indent=2))
        return 0
    token = load_token(args.token_env)
    if args.command == "apply":
        ensure_gate(repo, args.branch, args.required_check, token)
    protection = read_gate(repo, args.branch, token)
    errors = validate_gate(protection, args.required_check)
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    print(f"repo gate active for {repo}@{args.branch}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
