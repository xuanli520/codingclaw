import json
from pathlib import Path

import pytest

from tests.harness.status import map_run_exit_to_job_state


def test_run_exit_status_mapping_matches_golden():
    golden_path = Path(__file__).resolve().parents[1] / "golden" / "run_exit_to_job_state.json"
    golden = json.loads(golden_path.read_text(encoding="utf-8"))

    assert {status: map_run_exit_to_job_state(status) for status in golden} == golden


def test_invalid_run_exit_status_fails():
    with pytest.raises(ValueError):
        map_run_exit_to_job_state("AWAITING_OWNER_DECISION")
