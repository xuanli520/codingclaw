from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import textwrap
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


def run_phase1(repo_root: Path, extra_env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    if extra_env:
        env.update(extra_env)
    return subprocess.run(
        ["bun", "run", "phase1"],
        cwd=repo_root,
        capture_output=True,
        text=True,
        env=env,
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


def init_git_repo(repo_root: Path) -> str:
    subprocess.run(["git", "init", "-b", "main"], cwd=repo_root, capture_output=True, text=True, check=True)
    subprocess.run(["git", "config", "user.email", "tests@example.com"], cwd=repo_root, capture_output=True, text=True, check=True)
    subprocess.run(["git", "config", "user.name", "Tests"], cwd=repo_root, capture_output=True, text=True, check=True)
    subprocess.run(["git", "add", "."], cwd=repo_root, capture_output=True, text=True, check=True)
    subprocess.run(["git", "commit", "-m", "initial"], cwd=repo_root, capture_output=True, text=True, check=True)
    return subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=repo_root,
        capture_output=True,
        text=True,
        check=True,
    ).stdout.strip()


def write_fake_docker(tmp_path: Path) -> Path:
    script_path = tmp_path / "fake-docker.py"
    script_path.write_text(
        textwrap.dedent(
            """\
            #!/usr/bin/env python3
            import json
            import os
            import subprocess
            import sys
            import time
            from pathlib import Path


            def parse_mount(raw: str) -> dict[str, str]:
                entry: dict[str, str] = {}
                for item in raw.split(","):
                    if "=" in item:
                        key, value = item.split("=", 1)
                        entry[key] = value
                    else:
                        entry[item] = "true"
                return entry


            def build_mounts(argv: list[str]) -> list[dict[str, str]]:
                mounts: list[dict[str, str]] = []
                index = 0
                while index < len(argv):
                    if argv[index] == "--mount":
                        mounts.append(parse_mount(argv[index + 1]))
                        index += 2
                        continue
                    index += 1
                return mounts


            def map_path(container_path: str, mounts: list[dict[str, str]]) -> str:
                for mount in sorted(mounts, key=lambda item: len(item["target"]), reverse=True):
                    target = mount["target"].rstrip("/")
                    if container_path == target:
                        return mount["source"]
                    if container_path.startswith(f"{target}/"):
                        return f"{mount['source']}{container_path[len(target):]}"
                return container_path


            def load_json(path: str) -> dict:
                return json.loads(Path(path).read_text(encoding="utf-8"))


            def write_text(path: Path, value: str) -> None:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(value, encoding="utf-8")


            def write_json(path: Path, value: dict) -> None:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(json.dumps(value, indent=2) + "\\n", encoding="utf-8")


            def maybe_capture(envelope: dict, task_packet: dict, mounts: list[dict[str, str]]) -> None:
                capture_dir = os.environ.get("CODINGCLAW_FAKE_DOCKER_CAPTURE_DIR", "").strip()
                if not capture_dir:
                    return
                capture_path = Path(capture_dir) / f"{envelope['run_role']}-{envelope['run_id']}.json"
                write_json(
                    capture_path,
                    {
                        "envelope": envelope,
                        "task_packet": task_packet,
                        "mounts": mounts,
                    },
                )


            def task_packet_for(envelope: dict, mounts: list[dict[str, str]]) -> dict:
                task_packet_path = map_path(envelope["task_packet_path"], mounts)
                return load_json(task_packet_path)


            def mutate_head(repo_path: str) -> None:
                subprocess.run(["git", "config", "user.email", "tests@example.com"], cwd=repo_path, capture_output=True, text=True, check=True)
                subprocess.run(["git", "config", "user.name", "Tests"], cwd=repo_path, capture_output=True, text=True, check=True)
                marker = Path(repo_path) / ".phase1-head-shift"
                marker.write_text("shift\\n", encoding="utf-8")
                subprocess.run(["git", "add", ".phase1-head-shift"], cwd=repo_path, capture_output=True, text=True, check=True)
                subprocess.run(["git", "commit", "-m", "builder-shift"], cwd=repo_path, capture_output=True, text=True, check=True)


            def create_builder_outputs(envelope: dict, task_packet: dict, artifact_root: Path) -> dict:
                write_text(
                    artifact_root / "reports" / "implementation-summary.en.md",
                    "\\n".join(
                        [
                            "# Implementation Summary",
                            "",
                            f"- job_id: {envelope['job_id']}",
                            f"- run_id: {envelope['run_id']}",
                            f"- story_id: {task_packet['story']['story_id']}",
                            "",
                        ]
                    )
                    + "\\n",
                )
                write_text(
                    artifact_root / "reports" / "self-check.en.md",
                    "\\n".join(
                        [
                            "# Self Check",
                            "",
                            "- required checks executed:",
                            "- scope-compliance",
                            "- artifact-presence",
                            "",
                        ]
                    )
                    + "\\n",
                )
                write_json(
                    artifact_root / "evidence" / "test-results" / "builder-check.json",
                    {
                        "run_id": envelope["run_id"],
                        "run_role": envelope["run_role"],
                        "story_id": task_packet["story"]["story_id"],
                        "status": "prepared-for-qa",
                        "checked_items": task_packet["story"]["mandatory_checks"],
                    },
                )
                return {
                    "status": "SUCCESS",
                    "completed": ["builder completed"],
                    "open": ["run QA"],
                    "blockers": [],
                    "next_action": "run QA",
                    "acceptance_status": "blocked",
                    "mandatory_check_status": "blocked",
                    "evidence_paths": [
                        "reports/implementation-summary.en.md",
                        "reports/self-check.en.md",
                        "evidence/test-results/builder-check.json",
                    ],
                    "report_paths": [
                        "reports/implementation-summary.en.md",
                        "reports/self-check.en.md",
                    ],
                    "test_result_paths": ["evidence/test-results/builder-check.json"],
                    "fixback_items": [],
                }


            def create_qa_outputs(envelope: dict, task_packet: dict, artifact_root: Path, status: str) -> dict:
                write_text(
                    artifact_root / "reports" / "qa-report.en.md",
                    "\\n".join(
                        [
                            "# QA Report",
                            "",
                            f"- job_id: {envelope['job_id']}",
                            f"- run_id: {envelope['run_id']}",
                            f"- story_id: {task_packet['story']['story_id']}",
                            f"- QA verdict: {status}",
                            "",
                        ]
                    )
                    + "\\n",
                )
                write_json(
                    artifact_root / "evidence" / "test-results" / "qa-check.json",
                    {
                        "run_id": envelope["run_id"],
                        "run_role": envelope["run_role"],
                        "story_id": task_packet["story"]["story_id"],
                        "status": status,
                    },
                )
                write_json(
                    artifact_root / "metadata" / "qa-verdict.json",
                    {
                        "story_id": task_packet["story"]["story_id"],
                        "status_family": "run_exit",
                        "status": status,
                    },
                )
                if status == "FIXBACK_REQUIRED":
                    write_text(
                        artifact_root / "reports" / "fixback-items.en.md",
                        "# Fixback Items\\n\\n- Restore builder artifact: reports/self-check.en.md\\n",
                    )
                return {
                    "status": status,
                    "completed": ["qa completed"],
                    "open": ["archive" if status == "SUCCESS" else "enter fixback"],
                    "blockers": [] if status == "SUCCESS" else ["Restore builder artifact: reports/self-check.en.md"],
                    "next_action": "archive" if status == "SUCCESS" else "enter fixback",
                    "acceptance_status": "pass" if status == "SUCCESS" else "fail",
                    "mandatory_check_status": "pass" if status == "SUCCESS" else "fail",
                    "evidence_paths": [
                        "reports/qa-report.en.md",
                        "metadata/qa-verdict.json",
                        "evidence/test-results/qa-check.json",
                        *([] if status == "SUCCESS" else ["reports/fixback-items.en.md"]),
                    ],
                    "report_paths": [
                        "reports/qa-report.en.md",
                        *([] if status == "SUCCESS" else ["reports/fixback-items.en.md"]),
                    ],
                    "test_result_paths": ["evidence/test-results/qa-check.json"],
                    "fixback_items": [] if status == "SUCCESS" else ["Restore builder artifact: reports/self-check.en.md"],
                }


            def main() -> int:
                argv = sys.argv[1:]
                if not argv:
                    return 1
                if argv[0] == "image" and len(argv) > 1 and argv[1] == "inspect":
                    return 1
                if argv[0] == "build":
                    return 0
                if argv[0] != "run":
                    return 1

                mounts = build_mounts(argv)
                envelope = load_json(map_path(argv[-1], mounts))
                task_packet = task_packet_for(envelope, mounts)
                artifact_root = Path(map_path(envelope["artifact_path"], mounts))
                mode = os.environ.get("CODINGCLAW_FAKE_DOCKER_MODE", "success")
                if mode == "slow_success":
                    time.sleep(float(os.environ.get("CODINGCLAW_FAKE_DOCKER_SLEEP", "1")))
                if mode == "qa_timeout" and envelope["run_role"] == "qa":
                    time.sleep(float(os.environ.get("CODINGCLAW_FAKE_DOCKER_SLEEP", "1")))

                if envelope["run_role"] == "builder":
                    output = create_builder_outputs(envelope, task_packet, artifact_root)
                    if mode == "builder_awaiting_approval":
                        output["status"] = "AWAITING_APPROVAL"
                        output["open"] = ["owner approval required"]
                        output["blockers"] = ["Privileged action requires owner approval"]
                        output["next_action"] = "approve requested action or choose an alternative"
                    if mode == "builder_awaiting_credentials":
                        output["status"] = "AWAITING_CREDENTIALS"
                        output["open"] = ["credentials required"]
                        output["blockers"] = ["A credential is required before continuing"]
                        output["next_action"] = "provide the requested credential or choose an alternative"
                    if mode == "builder_head_shift":
                        mutate_head(map_path(envelope["repo_path"], mounts))
                else:
                    if mode == "qa_failed_infra":
                        sys.stderr.write("docker: qa container failed before worker start\\n")
                        return 125
                    qa_status = "FIXBACK_REQUIRED" if mode == "qa_fixback" else "SUCCESS"
                    output = create_qa_outputs(envelope, task_packet, artifact_root, qa_status)

                maybe_capture(envelope, task_packet, mounts)
                sys.stdout.write(json.dumps(output))
                return 0


            raise SystemExit(main())
            """
        ),
        encoding="utf-8",
    )
    script_path.chmod(0o755)
    return script_path


def write_time_limit_minutes(repo_root: Path, minutes: float) -> None:
    for relative_path in [
        "control/fixtures/phase1-local-run-envelope.json",
        "control/fixtures/phase1-local-task-packet.en.json",
    ]:
        fixture_path = repo_root / relative_path
        fixture = json.loads(fixture_path.read_text(encoding="utf-8"))
        fixture["time_limits"]["minutes"] = minutes
        fixture_path.write_text(json.dumps(fixture, indent=2) + "\n", encoding="utf-8")


def load_capture(capture_dir: Path, run_role: str) -> dict:
    matches = sorted(capture_dir.glob(f"{run_role}-*.json"))
    assert matches
    return json.loads(matches[0].read_text(encoding="utf-8"))


def assert_builder_failure_bundle(job_root: Path) -> None:
    run_roots = sorted(path for path in (job_root / "artifacts" / "runs").iterdir() if path.is_dir())
    builder_run_root = next(path for path in run_roots if path.name.startswith("run-builder-"))
    artifact_index = json.loads((builder_run_root / "metadata" / "artifact-index.json").read_text(encoding="utf-8"))
    indexed_paths = {entry["path"] for entry in artifact_index["artifacts"]}

    for relative_path in [
        "reports/implementation-summary.en.md",
        "reports/self-check.en.md",
        "evidence/test-results/builder-check.json",
    ]:
        assert (builder_run_root / relative_path).exists()
        assert relative_path in indexed_paths


def assert_recovery_pause_context(manifest: dict, job_root: Path, expected_status: str) -> None:
    pause_context = manifest["pause_context"]
    assert pause_context["is_paused"] is True
    assert pause_context["pause_reason"] == expected_status
    assert pause_context["waiting_on"] == "owner"
    assert pause_context["resume_action"]
    assert pause_context["paused_at"]
    assert pause_context["related_card_id"]
    assert pause_context["expires_at"]

    recovery_record = manifest["approvals"][-1]
    assert recovery_record["card_id"] == pause_context["related_card_id"]
    assert recovery_record["card_type"] == "recovery"
    assert recovery_record["card_state"] == "PENDING"
    assert recovery_record["decision"] is None
    assert recovery_record["decision_path"] is None

    recovery_root = job_root / "approvals" / recovery_record["card_id"]
    recovery_card = json.loads((recovery_root / "approval-card.json").read_text(encoding="utf-8"))

    assert (recovery_root / "summary.zh.md").exists()
    assert not (recovery_root / "decision.json").exists()
    assert recovery_card["recovery_context"]["last_exit_reason"] == expected_status
    assert recovery_card["recovery_context"]["latest_evidence_path"]
    assert recovery_card["recovery_context"]["recommended_next_action"]
    assert recovery_card["recovery_context"]["resume_gate"] == "owner"
    assert pause_context["resume_action"] == recovery_card["recovery_context"]["recommended_next_action"]


def assert_recovery_state_mirror(job_root: Path, recovery_card_id: str) -> None:
    decisions = (job_root / "state" / "decisions.en.md").read_text(encoding="utf-8")
    progress = (job_root / "state" / "progress.en.md").read_text(encoding="utf-8")
    risk_register = (job_root / "state" / "risk-register.en.md").read_text(encoding="utf-8")

    assert f"- card_id: {recovery_card_id}" in decisions
    assert "Wait for owner input before continuing." in decisions
    assert "Wait for owner input before continuing." in progress
    assert "fixback" not in risk_register.lower()
    assert "owner review is required" in risk_register.lower()


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


@pytest.mark.integration
@pytest.mark.skipif(shutil.which("bun") is None, reason="bun is required")
def test_phase1_local_builder_container_materialization_uses_read_only_inputs_and_container_paths(tmp_path):
    repo_root = export_repo(tmp_path)
    fake_docker = write_fake_docker(tmp_path)
    capture_dir = tmp_path / "captures"
    result = run_phase1(
        repo_root,
        {
            "CODINGCLAW_DOCKER_BIN": str(fake_docker),
            "CODINGCLAW_FAKE_DOCKER_CAPTURE_DIR": str(capture_dir),
        },
    )

    assert result.returncode == 0, result.stderr or result.stdout

    builder_capture = load_capture(capture_dir, "builder")
    builder_task_packet = builder_capture["task_packet"]
    builder_envelope = builder_capture["envelope"]
    container_paths = builder_envelope["container_runtime"]["container_paths"]
    mounts = {mount["target"]: mount for mount in builder_capture["mounts"]}
    job_root = repo_root / "jobs" / "job-phase1-local"

    assert builder_task_packet["repo_path"] == repo_root.as_posix()
    assert builder_task_packet["state_path"] == (job_root / "state").as_posix()
    assert builder_task_packet["runtime_home"] == (job_root / "runtime-home" / "phase1-local").as_posix()
    assert builder_task_packet["artifact_path"] == (job_root / "artifacts" / "runs" / builder_envelope["run_id"]).as_posix()
    assert "container_control" not in builder_task_packet["requested_capabilities"]
    assert container_paths["repo_path"] == "/work/repo"
    assert container_paths["state_path"] == "/work/state"
    assert container_paths["runtime_home"] == "/work/runtime-home"
    assert container_paths["artifact_path"] == builder_envelope["artifact_path"]
    assert container_paths["task_packet_path"] == builder_envelope["task_packet_path"]
    assert builder_envelope["task_packet_path"].endswith(f"/artifacts/runs/{builder_envelope['run_id']}/metadata/task-packet.en.json")

    capability_manifest = json.loads(
        (repo_root / "adapters" / "generic-cli" / "adapter-capability.json").read_text(encoding="utf-8")
    )
    filesystem_write_scope = set(capability_manifest["capabilities"]["filesystem_write"]["scope"])
    repo_job_root_path = f"/work/repo/jobs/job-phase1-local"
    repo_run_root_path = f"{repo_job_root_path}/artifacts/runs/{builder_envelope['run_id']}"
    task_packet_target = f"{builder_envelope['artifact_path']}/metadata/task-packet.en.json"

    assert mounts["/work/repo"].get("readonly") != "true"
    assert mounts[repo_job_root_path]["readonly"] == "true"
    assert mounts["/work/state"]["readonly"] == "true"
    assert mounts["/work/artifacts"]["readonly"] == "true"
    assert mounts[builder_envelope["artifact_path"]].get("readonly") != "true"
    assert mounts[repo_run_root_path].get("readonly") != "true"
    assert mounts[task_packet_target]["readonly"] == "true"
    assert mounts[f"{repo_run_root_path}/metadata/task-packet.en.json"]["readonly"] == "true"
    assert mounts["/work/runtime-home"].get("readonly") != "true"
    assert mounts[f"{repo_job_root_path}/runtime-home/phase1-local"].get("readonly") != "true"
    assert filesystem_write_scope == {"repo", "run-artifacts", "runtime-home"}

    manifest = json.loads((job_root / "job-manifest.json").read_text(encoding="utf-8"))
    freeze = json.loads((job_root / "contract-freeze.json").read_text(encoding="utf-8"))
    builder_run = next(run for run in manifest["runs"] if run["run_role"] == "builder")
    expected_task_packet_path = builder_run["task_packet_path"]

    assert expected_task_packet_path == f"artifacts/runs/{builder_envelope['run_id']}/metadata/task-packet.en.json"
    assert json.loads((job_root / expected_task_packet_path).read_text(encoding="utf-8")) == builder_task_packet
    assert not (job_root / "runtime-home" / "phase1-local" / "envelopes" / "container" / "task-packets").exists()
    assert expected_task_packet_path in (job_root / "checksums.txt").read_text(encoding="utf-8")
    assert freeze["task_packet_digests"][builder_envelope["run_id"]] == builder_task_packet["task_packet_sha256"]


@pytest.mark.integration
@pytest.mark.skipif(shutil.which("bun") is None, reason="bun is required")
def test_phase1_local_qa_packet_keeps_freeze_base_commit_when_builder_moves_head(tmp_path):
    repo_root = export_repo(tmp_path)
    initial_commit = init_git_repo(repo_root)
    fake_docker = write_fake_docker(tmp_path)
    capture_dir = tmp_path / "captures"
    result = run_phase1(
        repo_root,
        {
            "CODINGCLAW_DOCKER_BIN": str(fake_docker),
            "CODINGCLAW_FAKE_DOCKER_MODE": "builder_head_shift",
            "CODINGCLAW_FAKE_DOCKER_CAPTURE_DIR": str(capture_dir),
        },
    )

    assert result.returncode == 0, result.stderr or result.stdout

    current_head = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=repo_root,
        capture_output=True,
        text=True,
        check=True,
    ).stdout.strip()
    job_root = repo_root / "jobs" / "job-phase1-local"
    freeze = json.loads((job_root / "contract-freeze.json").read_text(encoding="utf-8"))
    manifest = json.loads((job_root / "job-manifest.json").read_text(encoding="utf-8"))
    qa_capture = load_capture(capture_dir, "qa")

    assert current_head != initial_commit
    assert freeze["base_commit"] == initial_commit
    assert manifest["base_commit"] == initial_commit
    assert qa_capture["task_packet"]["base_commit"] == initial_commit
    assert qa_capture["task_packet"]["base_commit"] != current_head
    assert freeze["task_packet_digests"][qa_capture["task_packet"]["run_id"]] == qa_capture["task_packet"]["task_packet_sha256"]


@pytest.mark.integration
@pytest.mark.skipif(shutil.which("bun") is None, reason="bun is required")
def test_phase1_local_builder_failed_infra_stops_before_qa(tmp_path):
    repo_root = export_repo(tmp_path)
    result = run_phase1(repo_root, {"CODINGCLAW_DOCKER_BIN": "does-not-exist"})

    assert result.returncode == 0, result.stderr or result.stdout

    job_root = repo_root / "jobs" / "job-phase1-local"
    manifest = json.loads((job_root / "job-manifest.json").read_text(encoding="utf-8"))
    freeze = json.loads((job_root / "contract-freeze.json").read_text(encoding="utf-8"))
    archived_trace = json.loads((job_root / "state" / "trace-index.json").read_text(encoding="utf-8"))
    live_trace = json.loads((repo_root / "state" / "trace-index.json").read_text(encoding="utf-8"))
    qa_run_id = next(run_id for run_id in freeze["task_packet_digests"] if run_id.startswith("run-qa-"))
    qa_task_packet_path = job_root / "artifacts" / "runs" / qa_run_id / "metadata" / "task-packet.en.json"
    qa_task_packet = json.loads(qa_task_packet_path.read_text(encoding="utf-8"))

    assert [run["run_role"] for run in manifest["runs"]] == ["builder"]
    assert [run["run_exit_status"] for run in manifest["runs"]] == ["FAILED_INFRA"]
    assert manifest["current_run_id"] == manifest["runs"][0]["run_id"]
    assert manifest["stories"][0]["latest_run_role"] == "builder"
    assert manifest["stories"][0]["latest_run_status"] == "FAILED_INFRA"
    assert archived_trace["stories"]["STORY-PHASE1-LOCAL-001"]["latest_run_role"] == "builder"
    assert archived_trace["stories"]["STORY-PHASE1-LOCAL-001"]["latest_qa_status"] == "PENDING"
    assert live_trace == archived_trace
    assert qa_task_packet["task_packet_sha256"] == freeze["task_packet_digests"][qa_run_id]
    assert f"artifacts/runs/{qa_run_id}/metadata/task-packet.en.json" in (job_root / "checksums.txt").read_text(encoding="utf-8")
    assert sorted(path.relative_to(job_root / "artifacts" / "runs" / qa_run_id).as_posix() for path in qa_task_packet_path.parent.rglob("*") if path.is_file()) == [
        "metadata/task-packet.en.json"
    ]
    assert not (job_root / "artifacts" / "final" / "final-summary.en.md").exists()
    assert_builder_failure_bundle(job_root)
    assert_recovery_pause_context(manifest, job_root, "FAILED_INFRA")
    assert_recovery_state_mirror(job_root, manifest["pause_context"]["related_card_id"])


@pytest.mark.integration
@pytest.mark.parametrize(
    ("mode", "expected_status", "expected_capability"),
    [
        ("builder_awaiting_approval", "AWAITING_APPROVAL", "interactive_approval"),
        ("builder_awaiting_credentials", "AWAITING_CREDENTIALS", "secret_injection"),
    ],
)
@pytest.mark.skipif(shutil.which("bun") is None, reason="bun is required")
def test_phase1_local_waiting_recovery_card_preserves_approval_request_details(
    tmp_path,
    mode,
    expected_status,
    expected_capability,
):
    repo_root = export_repo(tmp_path)
    fake_docker = write_fake_docker(tmp_path)
    result = run_phase1(
        repo_root,
        {
            "CODINGCLAW_DOCKER_BIN": str(fake_docker),
            "CODINGCLAW_FAKE_DOCKER_MODE": mode,
        },
    )

    assert result.returncode == 0, result.stderr or result.stdout

    job_root = repo_root / "jobs" / "job-phase1-local"
    manifest = json.loads((job_root / "job-manifest.json").read_text(encoding="utf-8"))
    recovery_record = manifest["approvals"][-1]
    recovery_card = json.loads(
        (job_root / "approvals" / recovery_record["card_id"] / "approval-card.json").read_text(encoding="utf-8")
    )
    approval_request = recovery_card["approval_request"]

    assert [run["run_role"] for run in manifest["runs"]] == ["builder"]
    assert [run["run_exit_status"] for run in manifest["runs"]] == [expected_status]
    assert manifest["status"] == "AWAITING_OWNER"
    assert manifest["pause_context"]["waiting_on"] == "owner"
    assert approval_request["run_id"] == manifest["runs"][0]["run_id"]
    assert approval_request["run_role"] == "builder"
    assert approval_request["requested_capability"] == expected_capability
    assert approval_request["reason"]
    assert approval_request["suggested_alternatives"]
    assert approval_request == recovery_record["approval_request"]


@pytest.mark.integration
@pytest.mark.skipif(shutil.which("bun") is None, reason="bun is required")
def test_phase1_local_builder_failed_infra_command_log_records_docker_run(tmp_path):
    repo_root = export_repo(tmp_path)
    result = run_phase1(repo_root, {"CODINGCLAW_DOCKER_BIN": "does-not-exist"})

    assert result.returncode == 0, result.stderr or result.stdout

    job_root = repo_root / "jobs" / "job-phase1-local"
    run_root = next(path for path in (job_root / "artifacts" / "runs").iterdir() if path.is_dir())
    command_log = (run_root / "logs" / "command-log.txt").read_text(encoding="utf-8")

    assert "command: does-not-exist run --rm --network none" in command_log
    assert " image inspect " not in command_log
    assert " build --file " not in command_log


@pytest.mark.integration
@pytest.mark.skipif(shutil.which("bun") is None, reason="bun is required")
def test_phase1_local_qa_fixback_closes_without_final_summary(tmp_path):
    repo_root = export_repo(tmp_path)
    fake_docker = write_fake_docker(tmp_path)
    result = run_phase1(
        repo_root,
        {
            "CODINGCLAW_DOCKER_BIN": str(fake_docker),
            "CODINGCLAW_FAKE_DOCKER_MODE": "qa_fixback",
        },
    )

    assert result.returncode == 0, result.stderr or result.stdout

    job_root = repo_root / "jobs" / "job-phase1-local"
    manifest = json.loads((job_root / "job-manifest.json").read_text(encoding="utf-8"))
    archived_trace = json.loads((job_root / "state" / "trace-index.json").read_text(encoding="utf-8"))
    live_trace = json.loads((repo_root / "state" / "trace-index.json").read_text(encoding="utf-8"))

    assert [run["run_role"] for run in manifest["runs"]] == ["builder", "qa"]
    assert [run["run_exit_status"] for run in manifest["runs"]] == ["SUCCESS", "FIXBACK_REQUIRED"]
    assert manifest["status"] == "FIXBACK_PENDING"
    assert manifest["stories"][0]["latest_run_role"] == "qa"
    assert manifest["stories"][0]["latest_run_status"] == "FIXBACK_REQUIRED"
    assert archived_trace["stories"]["STORY-PHASE1-LOCAL-001"]["latest_run_role"] == "qa"
    assert archived_trace["stories"]["STORY-PHASE1-LOCAL-001"]["latest_qa_status"] == "FIXBACK_REQUIRED"
    assert live_trace == archived_trace
    assert not (job_root / "artifacts" / "final" / "final-summary.en.md").exists()


@pytest.mark.integration
@pytest.mark.parametrize(
    ("mode", "expected_status"),
    [("qa_failed_infra", "FAILED_INFRA"), ("qa_timeout", "TIMEOUT")],
)
@pytest.mark.skipif(shutil.which("bun") is None, reason="bun is required")
def test_phase1_local_qa_non_success_writes_required_qa_bundle(tmp_path, mode, expected_status):
    repo_root = export_repo(tmp_path)
    if mode == "qa_timeout":
        write_time_limit_minutes(repo_root, 0.001)
    fake_docker = write_fake_docker(tmp_path)
    result = run_phase1(
        repo_root,
        {
            "CODINGCLAW_DOCKER_BIN": str(fake_docker),
            "CODINGCLAW_FAKE_DOCKER_MODE": mode,
            "CODINGCLAW_FAKE_DOCKER_SLEEP": "1",
        },
    )

    assert result.returncode == 0, result.stderr or result.stdout

    job_root = repo_root / "jobs" / "job-phase1-local"
    manifest = json.loads((job_root / "job-manifest.json").read_text(encoding="utf-8"))
    archived_trace = json.loads((job_root / "state" / "trace-index.json").read_text(encoding="utf-8"))
    run_roots = sorted(path for path in (job_root / "artifacts" / "runs").iterdir() if path.is_dir())
    qa_run_root = run_roots[-1]
    artifact_index = json.loads((qa_run_root / "metadata" / "artifact-index.json").read_text(encoding="utf-8"))
    indexed_paths = {entry["path"] for entry in artifact_index["artifacts"]}

    assert [run["run_role"] for run in manifest["runs"]] == ["builder", "qa"]
    assert [run["run_exit_status"] for run in manifest["runs"]] == ["SUCCESS", expected_status]
    assert manifest["status"] == "AWAITING_OWNER"
    assert archived_trace["stories"]["STORY-PHASE1-LOCAL-001"]["latest_run_role"] == "qa"
    assert archived_trace["stories"]["STORY-PHASE1-LOCAL-001"]["latest_qa_status"] == expected_status
    assert not (job_root / "artifacts" / "final" / "final-summary.en.md").exists()

    for relative_path in [
        "reports/qa-report.en.md",
        "reports/fixback-items.en.md",
        "metadata/qa-verdict.json",
        "evidence/test-results/qa-check.json",
    ]:
        assert (qa_run_root / relative_path).exists()
        assert relative_path in indexed_paths

    qa_verdict = json.loads((qa_run_root / "metadata" / "qa-verdict.json").read_text(encoding="utf-8"))
    assert qa_verdict["status"] == expected_status
    assert_recovery_pause_context(manifest, job_root, expected_status)
    assert_recovery_state_mirror(job_root, manifest["pause_context"]["related_card_id"])


@pytest.mark.integration
@pytest.mark.skipif(shutil.which("bun") is None, reason="bun is required")
def test_phase1_local_builder_timeout_stops_before_qa(tmp_path):
    repo_root = export_repo(tmp_path)
    write_time_limit_minutes(repo_root, 0)
    fake_docker = write_fake_docker(tmp_path)
    result = run_phase1(
        repo_root,
        {
            "CODINGCLAW_DOCKER_BIN": str(fake_docker),
            "CODINGCLAW_FAKE_DOCKER_MODE": "slow_success",
            "CODINGCLAW_FAKE_DOCKER_SLEEP": "1",
        },
    )

    assert result.returncode == 0, result.stderr or result.stdout

    job_root = repo_root / "jobs" / "job-phase1-local"
    manifest = json.loads((job_root / "job-manifest.json").read_text(encoding="utf-8"))
    archived_trace = json.loads((job_root / "state" / "trace-index.json").read_text(encoding="utf-8"))

    assert [run["run_role"] for run in manifest["runs"]] == ["builder"]
    assert [run["run_exit_status"] for run in manifest["runs"]] == ["TIMEOUT"]
    assert manifest["status"] == "AWAITING_OWNER"
    assert manifest["stories"][0]["latest_run_role"] == "builder"
    assert manifest["stories"][0]["latest_run_status"] == "TIMEOUT"
    assert archived_trace["stories"]["STORY-PHASE1-LOCAL-001"]["latest_run_role"] == "builder"
    assert archived_trace["stories"]["STORY-PHASE1-LOCAL-001"]["latest_qa_status"] == "PENDING"
    assert not (job_root / "artifacts" / "final" / "final-summary.en.md").exists()
    assert_builder_failure_bundle(job_root)
