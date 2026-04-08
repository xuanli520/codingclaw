from __future__ import annotations

from pathlib import Path

from tests.harness.runners import Scenario, materialize_scenario


class FakeAdapter:
    def execute(self, root: Path, *, status: str, run_role: str = "qa", **kwargs) -> dict:
        scenario = Scenario(exit_status=status, run_role=run_role, **kwargs)
        return materialize_scenario(root, scenario)
