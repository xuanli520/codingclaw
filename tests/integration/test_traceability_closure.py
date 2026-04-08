import json

import pytest

from tests.harness.validators import validate_traceability


@pytest.mark.integration
@pytest.mark.parametrize(
    ("status", "acceptance_statuses"),
    [
        ("SUCCESS", {"ACC-001": "pass", "ACC-002": "pass"}),
        ("FIXBACK_REQUIRED", {"ACC-001": "fail", "ACC-002": "pass"}),
        ("AWAITING_APPROVAL", {"ACC-001": "blocked", "ACC-002": "blocked"}),
    ],
)
def test_traceability_closure_accepts_pass_fail_or_blocked(scenario_factory, status, acceptance_statuses):
    context = scenario_factory(exit_status=status, acceptance_statuses=acceptance_statuses, approval_decided=status == "AWAITING_APPROVAL")
    trace_index = json.loads(context["trace_index_path"].read_text(encoding="utf-8"))
    artifact_index = json.loads(context["artifact_index_path"].read_text(encoding="utf-8"))

    assert validate_traceability(context["story"], trace_index, artifact_index) == []
