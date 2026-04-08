import json

import pytest

from tests.harness.checksums import write_checksum_file
from tests.harness.runners import collect_text_surfaces
from tests.harness.validators import (
    validate_artifact_index,
    validate_checksum_manifests,
    validate_freeze,
    validate_job_status_alignment,
    validate_language_boundaries,
    validate_scope_boundaries,
    validate_task_packet,
    validate_traceability,
)


def _validate_context(context: dict) -> list[str]:
    freeze = json.loads(context["freeze_json_path"].read_text(encoding="utf-8"))
    task_packet = json.loads(context["task_packet_path"].read_text(encoding="utf-8"))
    artifact_index = json.loads(context["artifact_index_path"].read_text(encoding="utf-8"))
    run_result = json.loads(context["run_result_path"].read_text(encoding="utf-8"))
    job_manifest = json.loads(context["job_manifest_path"].read_text(encoding="utf-8"))
    trace_index = json.loads(context["trace_index_path"].read_text(encoding="utf-8"))
    produced_paths = [path for path in context["run_root"].rglob("*") if path.is_file()]

    errors = []
    errors.extend(
        validate_freeze(
            freeze,
            freeze_checksum_path=context["freeze_checksum_path"],
            job_root=context["job_root"],
            requested_adapter="generic-cli",
            story_id=context["story"]["story_id"],
        )
    )
    errors.extend(validate_task_packet(task_packet))
    errors.extend(validate_job_status_alignment(run_result, job_manifest))
    errors.extend(validate_artifact_index(context["run_root"], artifact_index))
    errors.extend(
        validate_scope_boundaries(
            run_root=context["run_root"],
            produced_paths=produced_paths,
            expected_artifacts=context["story"]["expected_artifacts"],
        )
    )
    errors.extend(validate_traceability(context["story"], trace_index, artifact_index))
    errors.extend(validate_checksum_manifests(context["job_root"], context["freeze_checksum_path"], context["checksums_path"]))
    errors.extend(validate_language_boundaries(collect_text_surfaces(context["run_root"])))
    return errors


@pytest.mark.smoke
def test_happy_path(scenario_factory):
    context = scenario_factory()

    assert context["run_result"]["status"] == "SUCCESS"
    assert _validate_context(context) == []


@pytest.mark.smoke
def test_fixback_within_scope(scenario_factory):
    context = scenario_factory(exit_status="FIXBACK_REQUIRED")

    assert context["run_result"]["status"] == "FIXBACK_REQUIRED"
    assert _validate_context(context) == []


@pytest.mark.smoke
def test_scope_drift_requires_change_request(scenario_factory):
    context = scenario_factory(
        exit_status="CHANGE_REQUEST_REQUIRED",
        outside_writes={"workspace/expanded-feature.txt": "scope drift\n"},
    )
    produced_paths = [path for path in context["run_root"].rglob("*") if path.is_file()]
    produced_paths.append(context["job_root"] / "workspace" / "expanded-feature.txt")

    errors = validate_scope_boundaries(
        run_root=context["run_root"],
        produced_paths=produced_paths,
        expected_artifacts=context["story"]["expected_artifacts"],
    )

    assert context["run_result"]["status"] == "CHANGE_REQUEST_REQUIRED"
    assert errors == [f"path escaped run root: {(context['job_root'] / 'workspace' / 'expanded-feature.txt').as_posix()}"]


@pytest.mark.smoke
def test_approval_interrupt_and_resume(scenario_factory):
    waiting_context = scenario_factory(exit_status="AWAITING_APPROVAL")
    resumed_context = scenario_factory(
        run_id="run-002",
        exit_status="SUCCESS",
        approval_decided=True,
        resume_from="card-001",
    )
    resume_context = json.loads(resumed_context["run_root"].joinpath("metadata", "resume-context.json").read_text(encoding="utf-8"))

    assert waiting_context["run_result"]["status"] == "AWAITING_APPROVAL"
    assert resumed_context["run_result"]["status"] == "SUCCESS"
    assert resume_context["resumed_from"] == "card-001"
    assert _validate_context(resumed_context) == []


@pytest.mark.smoke
def test_checksum_recovery(scenario_factory):
    context = scenario_factory(tamper_freeze=True)

    assert validate_checksum_manifests(context["job_root"], context["freeze_checksum_path"]) == [
        "checksum mismatch: contract/contract-freeze.json"
    ]

    write_checksum_file(
        context["freeze_checksum_path"],
        context["job_root"],
        [context["freeze_path"], context["freeze_json_path"]],
    )

    assert validate_checksum_manifests(context["job_root"], context["freeze_checksum_path"]) == []
