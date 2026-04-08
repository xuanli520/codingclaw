from tests.harness.artifacts import merge_artifact_indexes


def test_merge_artifact_indexes_unifies_duplicate_paths():
    left = {
        "artifacts": [
            {
                "path": "reports/qa-report.en.md",
                "kind": "report",
                "acceptance_ids": ["ACC-001"],
            }
        ]
    }
    right = {
        "artifacts": [
            {
                "path": "reports/qa-report.en.md",
                "kind": "report",
                "acceptance_ids": ["ACC-002"],
                "mandatory_checks": ["evidence-completeness"],
            }
        ]
    }

    merged = merge_artifact_indexes(left, right)

    assert merged == {
        "artifacts": [
            {
                "path": "reports/qa-report.en.md",
                "kind": "report",
                "acceptance_ids": ["ACC-001", "ACC-002"],
                "mandatory_checks": ["evidence-completeness"],
            }
        ]
    }
