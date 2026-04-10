import { join } from "node:path";
import { mapRunExitToJobState, nextRequiredActionFromState, runningJobStateForRole } from "../contracts/status.ts";
import {
  ensureDir,
  nowIso,
  pathExists,
  readJson,
  readText,
  uniqueStrings,
  writeJson,
  writeText,
} from "./support.ts";
import type {
  ActiveStoryFile,
  AdapterExecutionResult,
  JobState,
  LoopMetricEntry,
  LoopMetricsFile,
  RunRole,
  StoryQueueFile,
  StoryTrace,
  TaskPacket,
  TraceEntry,
  TraceIndex,
} from "../contracts/types.ts";

function createTraceEntry(): TraceEntry {
  return {
    status: "blocked",
    artifacts: [],
    updated_at: "",
    latest_run_id: "",
  };
}

function createStoryTrace(taskPacket: TaskPacket): StoryTrace {
  const acceptance = Object.fromEntries(taskPacket.story.acceptance_ids.map((acceptanceId) => [acceptanceId, createTraceEntry()]));
  const mandatoryChecks = Object.fromEntries(taskPacket.story.mandatory_checks.map((checkName) => [checkName, createTraceEntry()]));
  return {
    story_id: taskPacket.story.story_id,
    latest_run_id: "",
    latest_run_role: "builder",
    latest_qa_status: "PENDING",
    acceptance,
    mandatory_checks: mandatoryChecks,
    artifact_locations: [],
  };
}

export interface RunRecoveryState {
  card_id: string;
  waiting_on: "owner" | "takeover";
  resume_action: string;
}

function renderProgress(
  taskPacket: TaskPacket,
  jobState: JobState,
  latestRunId: string,
  latestRunRole: RunRole,
  summary: string,
): string {
  return [
    "# Progress",
    "",
    `- job_id: ${taskPacket.job_id}`,
    `- current job state: ${jobState}`,
    `- current freeze version: ${taskPacket.freeze_version}`,
    `- active story ID: ${taskPacket.story.story_id}`,
    `- latest run ID: ${latestRunId}`,
    `- latest run role: ${latestRunRole}`,
    `- next required action: ${nextRequiredActionFromState(jobState)}`,
    `- last updated timestamp: ${nowIso()}`,
    `- short factual progress summary: ${summary}`,
    "",
  ].join("\n");
}

function renderRiskRegister(
  jobState: JobState,
  openRisks: string[],
  recoveryState: RunRecoveryState | null = null,
): string {
  let mitigationStatus: string[];
  let ownerReviewNeeds: string[];
  if (jobState === "AWAITING_OWNER") {
    mitigationStatus = [
      `- recovery card ${recoveryState?.card_id ?? "n/a"} is archived and waiting for owner decision`,
      `- resume action: ${recoveryState?.resume_action ?? "Wait for owner input before continuing."}`,
    ];
    ownerReviewNeeds = ["- owner review is required before continuing"];
  } else if (jobState === "AWAITING_TAKEOVER") {
    mitigationStatus = [
      `- recovery card ${recoveryState?.card_id ?? "n/a"} is archived and waiting for takeover`,
      `- resume action: ${recoveryState?.resume_action ?? "Wait for takeover before continuing."}`,
    ];
    ownerReviewNeeds = ["- takeover is required before continuing"];
  } else if (openRisks.length === 0) {
    mitigationStatus = ["- no mitigation is required"];
    ownerReviewNeeds = ["- none"];
  } else {
    mitigationStatus = ["- fix the active blockers before the next run"];
    ownerReviewNeeds = ["- owner review is required if fixback cannot stay in scope"];
  }
  return [
    "# Risk Register",
    "",
    "## Open Risks",
    "",
    ...(openRisks.length === 0 ? ["- none"] : openRisks.map((value) => `- ${value}`)),
    "",
    "## Mitigation Status",
    "",
    ...mitigationStatus,
    "",
    "## Escalated Risks",
    "",
    "- none",
    "",
    "## Owner Review Needs",
    "",
    ...ownerReviewNeeds,
    "",
    "## Last Updated",
    "",
    `- ${nowIso()}`,
    "",
  ].join("\n");
}

function approvalDecisionEntry(): string {
  return [
    `## ${nowIso()}`,
    "",
    "- card_id: card-phase1-local-001",
    "- run_id: n/a",
    "- decision summary: The fixed local Phase 1 proof-of-concept story is approved for execution.",
    "- resulting job state: READY_TO_RUN",
    "- next required action: Start the builder run for the approved story.",
    "",
  ].join("\n");
}

function runDecisionEntry(runId: string, jobState: JobState, recoveryState: RunRecoveryState | null = null): string {
  const decisionSummary =
    jobState === "AWAITING_OWNER"
      ? `The control shell archived recovery card ${recoveryState?.card_id ?? "n/a"} and is waiting for owner decision.`
      : jobState === "AWAITING_TAKEOVER"
        ? `The control shell archived recovery card ${recoveryState?.card_id ?? "n/a"} and is waiting for takeover.`
        : "The control shell recorded the latest run outcome.";
  return [
    `## ${nowIso()}`,
    "",
    `- card_id: ${recoveryState?.card_id ?? "n/a"}`,
    `- run_id: ${runId}`,
    `- decision summary: ${decisionSummary}`,
    `- resulting job state: ${jobState}`,
    `- next required action: ${nextRequiredActionFromState(jobState)}`,
    ...(recoveryState === null ? [] : [`- recovery resume action: ${recoveryState.resume_action}`]),
    "",
  ].join("\n");
}

function integrityFailureDecisionEntry(runId: string, reason: string): string {
  return [
    `## ${nowIso()}`,
    "",
    "- card_id: n/a",
    `- run_id: ${runId}`,
    `- decision summary: Integrity verification failed after archive finalization: ${reason}`,
    "- resulting job state: INTEGRITY_FAILED",
    "- next required action: Require owner review or regenerate integrity records before continuing.",
    "",
  ].join("\n");
}

function archiveFinalizationDecisionEntry(runId: string, finalSummaryPath: string): string {
  return [
    `## ${nowIso()}`,
    "",
    "- card_id: n/a",
    `- run_id: ${runId}`,
    `- decision summary: Archive finalization completed and wrote ${finalSummaryPath}.`,
    "- resulting job state: COMPLETED",
    "- next required action: No further action is required.",
    "",
  ].join("\n");
}

export interface StateStorePaths {
  archiveStateRoot?: string;
  liveStateRoot?: string;
}

export class StateStore {
  private readonly stateRoot: string;
  private readonly liveStateRoot: string;
  private readonly progressPath: string;
  private readonly storyQueuePath: string;
  private readonly activeStoryPath: string;
  private readonly handoffPath: string;
  private readonly riskRegisterPath: string;
  private readonly loopMetricsPath: string;
  private readonly decisionsPath: string;
  private readonly traceIndexPath: string;

  constructor(repoRoot: string, paths: StateStorePaths = {}) {
    this.stateRoot = paths.archiveStateRoot ?? join(repoRoot, "state");
    this.liveStateRoot = paths.liveStateRoot ?? join(repoRoot, "state");
    this.progressPath = join(this.stateRoot, "progress.en.md");
    this.storyQueuePath = join(this.stateRoot, "story-queue.json");
    this.activeStoryPath = join(this.stateRoot, "active-story.json");
    this.handoffPath = join(this.stateRoot, "handoff.en.md");
    this.riskRegisterPath = join(this.stateRoot, "risk-register.en.md");
    this.loopMetricsPath = join(this.stateRoot, "loop-metrics.json");
    this.decisionsPath = join(this.stateRoot, "decisions.en.md");
    this.traceIndexPath = join(this.stateRoot, "trace-index.json");
  }

  private mirrorPath(fileName: string): string {
    return join(this.liveStateRoot, fileName);
  }

  private async writeMirroredText(path: string, fileName: string, value: string): Promise<void> {
    await writeText(path, value);
    const mirrorPath = this.mirrorPath(fileName);
    if (mirrorPath !== path) {
      await writeText(mirrorPath, value);
    }
  }

  private async writeMirroredJson(path: string, fileName: string, value: unknown): Promise<void> {
    await writeJson(path, value);
    const mirrorPath = this.mirrorPath(fileName);
    if (mirrorPath !== path) {
      await writeJson(mirrorPath, value);
    }
  }

  getTraceIndexPath(): string {
    return this.traceIndexPath;
  }

  async bootstrap(taskPacket: TaskPacket): Promise<void> {
    await ensureDir(this.stateRoot);
    await ensureDir(this.liveStateRoot);

    if (!(await pathExists(this.storyQueuePath))) {
      const storyQueue: StoryQueueFile = {
        job_id: taskPacket.job_id,
        freeze_version: taskPacket.freeze_version,
        stories: [
          {
            story_id: taskPacket.story.story_id,
            queue_state: "READY_TO_RUN",
            priority: 1,
            depends_on: [],
            acceptance_ids: taskPacket.story.acceptance_ids,
            last_run_id: "",
          },
        ],
      };
      await this.writeMirroredJson(this.storyQueuePath, "story-queue.json", storyQueue);
    }

    if (!(await pathExists(this.traceIndexPath))) {
      const traceIndex: TraceIndex = {
        job_id: taskPacket.job_id,
        freeze_id: taskPacket.freeze_id,
        freeze_version: taskPacket.freeze_version,
        active_story_id: taskPacket.story.story_id,
        stories: {
          [taskPacket.story.story_id]: createStoryTrace(taskPacket),
        },
      };
      await this.writeMirroredJson(this.traceIndexPath, "trace-index.json", traceIndex);
    }

    if (!(await pathExists(this.loopMetricsPath))) {
      const loopMetrics: LoopMetricsFile = {
        job_id: taskPacket.job_id,
        runs: [],
      };
      await this.writeMirroredJson(this.loopMetricsPath, "loop-metrics.json", loopMetrics);
    }

    if (!(await pathExists(this.decisionsPath))) {
      await this.writeMirroredText(this.decisionsPath, "decisions.en.md", ["# Decisions", "", approvalDecisionEntry()].join("\n"));
    }

    if (!(await pathExists(this.riskRegisterPath))) {
      await this.writeMirroredText(this.riskRegisterPath, "risk-register.en.md", renderRiskRegister("READY_TO_RUN", []));
    }

    if (!(await pathExists(this.handoffPath))) {
      await this.writeMirroredText(
        this.handoffPath,
        "handoff.en.md",
        [
          "# Handoff",
          "",
          "## Run Identity",
          "",
          "- job ID: job-phase1-local",
          "- run ID: n/a",
          `- freeze version: ${taskPacket.freeze_version}`,
          `- story ID: ${taskPacket.story.story_id}`,
          "- run role: n/a",
          "- run attempt: 0",
          "- archived handoff path: n/a",
          "",
          "## Status Summary",
          "",
          "- exit status: n/a",
          "- what was completed:",
          "- approval and local bootstrap only",
          "- what remains open:",
          "- start the builder run",
          "",
          "## Key Evidence",
          "",
          "- report paths:",
          "- none",
          "- log paths:",
          "- none",
          "- test result paths:",
          "- none",
          "- trace references:",
          "- state/trace-index.json",
          "",
          "## Risks and Blockers",
          "",
          "- current blockers:",
          "- none",
          "- approval needs: none",
          "- credential needs: none",
          "- takeover needs: none",
          "",
          "## Recommended Next Step",
          "",
          "- start the builder run",
          "",
        ].join("\n"),
      );
    }

    await this.writeMirroredText(
      this.progressPath,
      "progress.en.md",
      renderProgress(
        taskPacket,
        "READY_TO_RUN",
        "",
        "builder",
        "The fixed local Phase 1 story is approved and ready for the builder run.",
      ),
    );
  }

  async prepareRun(taskPacket: TaskPacket): Promise<void> {
    const jobState = runningJobStateForRole(taskPacket.run_role);
    const storyQueue = await readJson<StoryQueueFile>(this.storyQueuePath);
    storyQueue.freeze_version = taskPacket.freeze_version;
    storyQueue.stories = storyQueue.stories.map((story) =>
      story.story_id === taskPacket.story.story_id
        ? {
            ...story,
            queue_state: jobState,
            last_run_id: taskPacket.run_id,
          }
        : story,
    );

    const activeStory: ActiveStoryFile = {
      story_id: taskPacket.story.story_id,
      freeze_version: taskPacket.freeze_version,
      run_id: taskPacket.run_id,
      run_role: taskPacket.run_role,
      objective: taskPacket.story.story_objective,
      acceptance_ids: taskPacket.story.acceptance_ids,
      verification_targets: taskPacket.story.verification_targets,
      stop_conditions: taskPacket.story.stop_conditions,
      expected_artifacts: taskPacket.story.expected_artifacts,
    };

    await this.writeMirroredJson(this.storyQueuePath, "story-queue.json", storyQueue);
    await this.writeMirroredJson(this.activeStoryPath, "active-story.json", activeStory);
    await this.writeMirroredText(
      this.progressPath,
      "progress.en.md",
      renderProgress(
        taskPacket,
        jobState,
        taskPacket.run_id,
        taskPacket.run_role,
        `${taskPacket.run_role} is executing the fixed local proof-of-concept story.`,
      ),
    );
  }

  async recordRun(
    taskPacket: TaskPacket,
    execution: AdapterExecutionResult,
    recoveryState: RunRecoveryState | null = null,
  ): Promise<void> {
    const jobState = mapRunExitToJobState(execution.runResult.status, execution.runResult.run_role);
    const loopMetrics = await readJson<LoopMetricsFile>(this.loopMetricsPath);
    const storyQueue = await readJson<StoryQueueFile>(this.storyQueuePath);
    const traceIndex = await readJson<TraceIndex>(this.traceIndexPath);
    const handoffContent = await readText(execution.handoffPath);

    const metricEntry: LoopMetricEntry = {
      run_id: execution.runResult.run_id,
      story_id: execution.runResult.story_id,
      run_role: execution.runResult.run_role,
      started_at: execution.runResult.started_at,
      ended_at: execution.runResult.ended_at,
      duration_s: execution.runResult.duration_s,
      estimated_cost: 0,
      actual_cost: 0,
      retry_index: taskPacket.run_attempt - 1,
      run_exit_status: execution.runResult.status,
    };
    loopMetrics.runs.push(metricEntry);

    storyQueue.freeze_version = taskPacket.freeze_version;
    storyQueue.stories = storyQueue.stories.map((story) =>
      story.story_id === taskPacket.story.story_id
        ? {
            ...story,
            queue_state: jobState,
            last_run_id: execution.runResult.run_id,
          }
        : story,
    );

    const storyTrace = traceIndex.stories[taskPacket.story.story_id] ?? createStoryTrace(taskPacket);
    const newArtifactRefs = execution.workerOutput.evidence_paths.map(
      (path) => `artifacts/runs/${execution.runResult.run_id}/${path}`,
    );

    for (const acceptanceId of taskPacket.story.acceptance_ids) {
      const previous = storyTrace.acceptance[acceptanceId] ?? createTraceEntry();
      storyTrace.acceptance[acceptanceId] = {
        status: execution.workerOutput.acceptance_status,
        artifacts: uniqueStrings([...previous.artifacts, ...newArtifactRefs]),
        updated_at: nowIso(),
        latest_run_id: execution.runResult.run_id,
      };
    }

    for (const checkName of taskPacket.story.mandatory_checks) {
      const previous = storyTrace.mandatory_checks[checkName] ?? createTraceEntry();
      storyTrace.mandatory_checks[checkName] = {
        status: execution.workerOutput.mandatory_check_status,
        artifacts: uniqueStrings([...previous.artifacts, ...newArtifactRefs]),
        updated_at: nowIso(),
        latest_run_id: execution.runResult.run_id,
      };
    }

    storyTrace.story_id = taskPacket.story.story_id;
    storyTrace.latest_run_id = execution.runResult.run_id;
    storyTrace.latest_run_role = execution.runResult.run_role;
    storyTrace.latest_qa_status =
      execution.runResult.run_role === "qa" ? execution.runResult.status : storyTrace.latest_qa_status;
    storyTrace.artifact_locations = uniqueStrings([...storyTrace.artifact_locations, ...newArtifactRefs]);
    traceIndex.active_story_id = taskPacket.story.story_id;
    traceIndex.stories[taskPacket.story.story_id] = storyTrace;

    const blockers = execution.workerOutput.blockers;
    const progressSummary =
      execution.runResult.run_role === "builder" && execution.runResult.status === "SUCCESS"
        ? "The builder completed the local slice and handed off to QA."
        : execution.runResult.run_role === "qa" && execution.runResult.status === "SUCCESS"
          ? "QA closed the local proof-of-concept story and the job is ready to archive."
          : jobState === "AWAITING_OWNER" && recoveryState !== null
            ? `${execution.runResult.run_role} ended with status ${execution.runResult.status}. Waiting for owner decision via recovery card ${recoveryState.card_id}.`
            : jobState === "AWAITING_TAKEOVER" && recoveryState !== null
              ? `${execution.runResult.run_role} ended with status ${execution.runResult.status}. Waiting for takeover via recovery card ${recoveryState.card_id}.`
          : `${execution.runResult.run_role} ended with status ${execution.runResult.status}.`;

    const existingDecisions = await readText(this.decisionsPath);
    await this.writeMirroredJson(this.storyQueuePath, "story-queue.json", storyQueue);
    await this.writeMirroredJson(this.loopMetricsPath, "loop-metrics.json", loopMetrics);
    await this.writeMirroredJson(this.traceIndexPath, "trace-index.json", traceIndex);
    await this.writeMirroredText(this.handoffPath, "handoff.en.md", handoffContent);
    await this.writeMirroredText(
      this.riskRegisterPath,
      "risk-register.en.md",
      renderRiskRegister(jobState, blockers, recoveryState),
    );
    await this.writeMirroredText(
      this.decisionsPath,
      "decisions.en.md",
      `${existingDecisions.trimEnd()}\n\n${runDecisionEntry(execution.runResult.run_id, jobState, recoveryState)}`,
    );
    await this.writeMirroredText(
      this.progressPath,
      "progress.en.md",
      renderProgress(taskPacket, jobState, execution.runResult.run_id, execution.runResult.run_role, progressSummary),
    );
  }

  async recordIntegrityFailure(taskPacket: TaskPacket, reason: string): Promise<void> {
    const storyQueue = await readJson<StoryQueueFile>(this.storyQueuePath);
    storyQueue.freeze_version = taskPacket.freeze_version;
    storyQueue.stories = storyQueue.stories.map((story) =>
      story.story_id === taskPacket.story.story_id
        ? {
            ...story,
            queue_state: "INTEGRITY_FAILED",
            last_run_id: taskPacket.run_id,
          }
        : story,
    );

    const existingDecisions = await readText(this.decisionsPath);
    await this.writeMirroredJson(this.storyQueuePath, "story-queue.json", storyQueue);
    await this.writeMirroredText(
      this.riskRegisterPath,
      "risk-register.en.md",
      renderRiskRegister("INTEGRITY_FAILED", [reason]),
    );
    await this.writeMirroredText(
      this.decisionsPath,
      "decisions.en.md",
      `${existingDecisions.trimEnd()}\n\n${integrityFailureDecisionEntry(taskPacket.run_id, reason)}`,
    );
    await this.writeMirroredText(
      this.progressPath,
      "progress.en.md",
      renderProgress(taskPacket, "INTEGRITY_FAILED", taskPacket.run_id, taskPacket.run_role, reason),
    );
  }

  async recordArchiveFinalization(
    taskPacket: TaskPacket,
    latestRunId: string,
    latestRunRole: RunRole,
    finalSummaryPath: string,
  ): Promise<void> {
    const storyQueue = await readJson<StoryQueueFile>(this.storyQueuePath);
    storyQueue.freeze_version = taskPacket.freeze_version;
    storyQueue.stories = storyQueue.stories.map((story) =>
      story.story_id === taskPacket.story.story_id
        ? {
            ...story,
            queue_state: "COMPLETED",
            last_run_id: latestRunId,
          }
        : story,
    );

    const existingDecisions = await readText(this.decisionsPath);
    await this.writeMirroredJson(this.storyQueuePath, "story-queue.json", storyQueue);
    await this.writeMirroredText(
      this.decisionsPath,
      "decisions.en.md",
      `${existingDecisions.trimEnd()}\n\n${archiveFinalizationDecisionEntry(latestRunId, finalSummaryPath)}`,
    );
    await this.writeMirroredText(
      this.progressPath,
      "progress.en.md",
      renderProgress(
        taskPacket,
        "COMPLETED",
        latestRunId,
        latestRunRole,
        "Archive finalization completed and the canonical local job bundle is closed.",
      ),
    );
  }
}
