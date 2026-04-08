import json

import pytest

from tests.harness.runners import collect_text_surfaces
from tests.harness.validators import (
    validate_artifact_index,
    validate_checksum_manifests,
    validate_freeze,
    validate_language_boundaries,
    validate_scope_boundaries,
    validate_task_packet,
)


@pytest.mark.integration
def test_run_bundle_layout_is_artifact_first(scenario_factory):
    context = scenario_factory()

    freeze = json.loads(context["freeze_json_path"].read_text(encoding="utf-8"))
    task_packet = json.loads(context["task_packet_path"].read_text(encoding="utf-8"))
    artifact_index = json.loads(context["artifact_index_path"].read_text(encoding="utf-8"))
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
    errors.extend(validate_artifact_index(context["run_root"], artifact_index))
    errors.extend(
        validate_scope_boundaries(
            run_root=context["run_root"],
            produced_paths=produced_paths,
            expected_artifacts=context["story"]["expected_artifacts"],
        )
    )
    errors.extend(validate_checksum_manifests(context["job_root"], context["freeze_checksum_path"], context["checksums_path"]))
    errors.extend(validate_language_boundaries(collect_text_surfaces(context["run_root"])))

    assert errors == []
