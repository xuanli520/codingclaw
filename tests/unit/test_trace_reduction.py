from tests.harness.trace import reduce_acceptance_closure


def test_reduce_acceptance_closure_counts_each_status():
    trace_index = {
        "acceptance": {
            "ACC-001": {"status": "pass", "artifacts": ["reports/qa-report.en.md"]},
            "ACC-002": {"status": "fail", "artifacts": ["reports/fixback-items.en.md"]},
            "ACC-003": {"status": "blocked", "artifacts": ["metadata/run-result.json"]},
        }
    }

    assert reduce_acceptance_closure(trace_index) == {
        "pass": 1,
        "fail": 1,
        "blocked": 1,
        "total": 3,
    }
