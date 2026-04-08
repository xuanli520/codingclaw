import json

import pytest

from tests.harness.fakes import FakeAdapter
from tests.harness.runners import collect_text_surfaces
from tests.harness.validators import (
    validate_artifact_index,
    validate_checksum_manifests,
    validate_freeze,
    validate_job_status_alignment,
    validate_language_boundaries,
    validate_status_payload,
    validate_task_packet,
    validate_traceability,
)


@pytest.mark.contract
@pytest.mark.parametrize(
    "status",
    [
        "SUCCESS",
        "FIXBACK_REQUIRED",
        "CHANGE_REQUEST_REQUIRED",
        "AWAITING_APPROVAL",
        "AWAITING_CREDENTIALS",
        "FAILED_POLICY",
    ],
)
def test_run_result_contract_examples(tmp_path, status):
    adapter = FakeAdapter()
    context = adapter.execute(
        tmp_path,
        status=status,
        approval_decided=status == "AWAITING_APPROVAL",
    )

    freeze = json.loads(context["freeze_json_path"].read_text(encoding="utf-8"))
    task_packet = json.loads(context["task_packet_path"].read_text(encoding="utf-8"))
    artifact_index = json.loads(context["artifact_index_path"].read_text(encoding="utf-8"))
    run_result = json.loads(context["run_result_path"].read_text(encoding="utf-8"))
    job_manifest = json.loads(context["job_manifest_path"].read_text(encoding="utf-8"))
    trace_index = json.loads(context["trace_index_path"].read_text(encoding="utf-8"))

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
    errors.extend(validate_status_payload(run_result))
    errors.extend(validate_status_payload(job_manifest))
    errors.extend(validate_job_status_alignment(run_result, job_manifest))
    errors.extend(validate_artifact_index(context["run_root"], artifact_index))
    errors.extend(validate_traceability(context["story"], trace_index, artifact_index))
    errors.extend(validate_checksum_manifests(context["job_root"], context["freeze_checksum_path"], context["checksums_path"]))
    errors.extend(validate_language_boundaries(collect_text_surfaces(context["run_root"])))

    assert errors == []
