import pytest

from tests.harness.runners import Scenario, materialize_scenario


@pytest.fixture
def scenario_factory(tmp_path):
    def factory(**kwargs):
        return materialize_scenario(tmp_path, Scenario(**kwargs))

    return factory
