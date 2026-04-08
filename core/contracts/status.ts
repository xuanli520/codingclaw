import type { JobState, RunExitStatus, RunRole } from "./types.ts";

export function runningJobStateForRole(runRole: RunRole): JobState {
  if (runRole === "builder") {
    return "RUNNING_BUILDER";
  }
  if (runRole === "qa") {
    return "RUNNING_QA";
  }
  return "RUNNING_REVIEW";
}

export function mapRunExitToJobState(status: RunExitStatus, runRole: RunRole): JobState {
  if (status === "SUCCESS") {
    if (runRole === "builder") {
      return "RUNNING_QA";
    }
    if (runRole === "qa") {
      return "ARCHIVE_PENDING";
    }
    return "COMPLETED";
  }
  if (status === "FIXBACK_REQUIRED") {
    return "FIXBACK_PENDING";
  }
  if (status === "CHANGE_REQUEST_REQUIRED") {
    return "CHANGE_REQUEST_PENDING";
  }
  if (status === "AWAITING_TAKEOVER") {
    return "AWAITING_TAKEOVER";
  }
  if (status === "AWAITING_APPROVAL" || status === "AWAITING_CREDENTIALS") {
    return "AWAITING_OWNER";
  }
  if (status === "FAILED_POLICY") {
    return "AWAITING_OWNER";
  }
  return "AWAITING_OWNER";
}

export function nextRequiredActionFromState(state: JobState): string {
  if (state === "RUNNING_BUILDER") {
    return "Wait for the builder run to finish.";
  }
  if (state === "RUNNING_QA") {
    return "Run QA for the active story.";
  }
  if (state === "FIXBACK_PENDING") {
    return "Prepare an in-scope fixback for the active story.";
  }
  if (state === "CHANGE_REQUEST_PENDING") {
    return "Create a change request before continuing.";
  }
  if (state === "AWAITING_OWNER") {
    return "Wait for owner input before continuing.";
  }
  if (state === "AWAITING_TAKEOVER") {
    return "Wait for takeover before continuing.";
  }
  if (state === "ARCHIVE_PENDING") {
    return "Archive the completed local proof-of-concept story.";
  }
  if (state === "COMPLETED") {
    return "No further action is required.";
  }
  return "Start the builder run for the approved story.";
}
