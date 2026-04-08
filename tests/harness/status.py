from __future__ import annotations


JOB_STATES = frozenset(
    {
        "DRAFT",
        "AWAITING_OWNER",
        "READY_TO_FREEZE",
        "READY_TO_RUN",
        "RUNNING_BUILDER",
        "RUNNING_QA",
        "RUNNING_REVIEW",
        "FIXBACK_PENDING",
        "AWAITING_TAKEOVER",
        "CHANGE_REQUEST_PENDING",
        "ARCHIVE_PENDING",
        "COMPLETED",
        "TERMINATED_WITH_RISK_REPORT",
        "INTEGRITY_FAILED",
    }
)

RUN_EXIT_STATUSES = frozenset(
    {
        "SUCCESS",
        "FIXBACK_REQUIRED",
        "CHANGE_REQUEST_REQUIRED",
        "AWAITING_APPROVAL",
        "AWAITING_CREDENTIALS",
        "AWAITING_TAKEOVER",
        "FAILED_POLICY",
        "FAILED_EXECUTION",
        "FAILED_INFRA",
        "TIMEOUT",
        "BUDGET_EXCEEDED",
    }
)

APPROVAL_CARD_STATES = frozenset({"PENDING", "DECIDED", "EXPIRED", "CANCELLED"})

STATUS_FAMILIES = {
    "job_state": JOB_STATES,
    "run_exit": RUN_EXIT_STATUSES,
    "approval_state": APPROVAL_CARD_STATES,
}


def is_valid_status(status_family: str, status: str) -> bool:
    return status in STATUS_FAMILIES.get(status_family, frozenset())


def map_run_exit_to_job_state(
    run_status: str,
    *,
    review_enabled: bool = False,
    terminate_with_risk: bool = False,
) -> str:
    if run_status not in RUN_EXIT_STATUSES:
        raise ValueError(f"invalid run status: {run_status}")
    if run_status == "SUCCESS":
        return "RUNNING_REVIEW" if review_enabled else "ARCHIVE_PENDING"
    if run_status == "FIXBACK_REQUIRED":
        return "FIXBACK_PENDING"
    if run_status == "CHANGE_REQUEST_REQUIRED":
        return "CHANGE_REQUEST_PENDING"
    if run_status == "AWAITING_TAKEOVER":
        return "AWAITING_TAKEOVER"
    if run_status in {"AWAITING_APPROVAL", "AWAITING_CREDENTIALS"}:
        return "AWAITING_OWNER"
    if run_status == "FAILED_POLICY":
        return "TERMINATED_WITH_RISK_REPORT" if terminate_with_risk else "AWAITING_OWNER"
    return "TERMINATED_WITH_RISK_REPORT" if terminate_with_risk else "AWAITING_OWNER"
