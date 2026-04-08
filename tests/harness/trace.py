from __future__ import annotations


TRACE_STATES = frozenset({"pass", "fail", "blocked"})


def reduce_acceptance_closure(trace_index: dict) -> dict[str, int]:
    summary = {"pass": 0, "fail": 0, "blocked": 0, "total": 0}
    for entry in trace_index.get("acceptance", {}).values():
        status = entry["status"]
        if status not in TRACE_STATES:
            raise ValueError(f"invalid trace status: {status}")
        summary[status] += 1
        summary["total"] += 1
    return summary
