import { join } from "node:path";
import { mapRunExitToJobState, nextRequiredActionFromState, runningJobStateForRole } from "../contracts/status.ts";
import { ensureDir, nowIso, pathExists, readText, uniqueStrings } from "./support.ts";
import { createStateScopeResolver, type StateScopeResolver } from "./state-scope.ts";
import { atomicWriteBatch, recoverPendingBatch, withWriteLock } from "./state-write.ts";
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

const STATE_FILE_ORDER = [
  "progress.en.md",
  "story-queue.json",
  "active-story.json",
  "handoff.en.md",
  "risk-register.en.md",
  "loop-metrics.json",
  "decisions.en.md",
  "trace-index.json",
] as const;

type StateFileName = (typeof STATE_FILE_ORDER)[number];
type SerializedState = Partial<Record<StateFileName, string>>;

function serializeJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export class StateStore {
  private readonly stateRoot: string;
  private readonly liveStateRoot: string;
  private readonly scopeResolver: StateScopeResolver;
  private readonly traceIndexPath: string;

  constructor(repoRoot: string, paths: StateStorePaths = {}) {
    this.scopeResolver = createStateScopeResolver(
      repoRoot,
      paths.archiveStateRoot ?? join(repoRoot, "state"),
      paths.liveStateRoot ?? join(repoRoot, "state"),
    );
    this.stateRoot = this.scopeResolver.roots.rootStateRoot;
    this.liveStateRoot = this.scopeResolver.roots.liveStateRoot;
    this.traceIndexPath = this.scopeResolver.resolveRootPath("trace-index.json");
  }

  private rootPath(fileName: StateFileName): string {
    return this.scopeResolver.resolveRootPath(fileName);
  }

  private mirrorPath(fileName: StateFileName): string {
    return this.scopeResolver.resolveLivePath(fileName);
  }

  private snapshotPath(runId: string, fileName: StateFileName): string {
    return this.scopeResolver.resolveRunPath(runId, fileName);
  }

  private async loadCanonicalState(): Promise<SerializedState> {
    await recoverPendingBatch(this.stateRoot);
    const state: SerializedState = {};
    for (const fileName of STATE_FILE_ORDER) {
      const path = this.rootPath(fileName);
      if (await pathExists(path)) {
        state[fileName] = await readText(path);
      }
    }
    return state;
  }

  private parseJsonState<T>(state: SerializedState, fileName: StateFileName): T {
    const serialized = state[fileName];
    if (serialized === undefined) {
      throw new Error(`missing canonical state file: ${fileName}`);
    }
    return JSON.parse(serialized) as T;
  }

  private readTextState(state: SerializedState, fileName: StateFileName): string {
    const serialized = state[fileName];
    if (serialized === undefined) {
      throw new Error(`missing canonical state file: ${fileName}`);
    }
    return serialized;
  }

  private setJsonState(state: SerializedState, fileName: StateFileName, value: unknown): void {
    state[fileName] = serializeJson(value);
  }

  private setTextState(state: SerializedState, fileName: StateFileName, value: string): void {
    state[fileName] = value;
  }

  private async persistState(state: SerializedState, runId: string): Promise<void> {
    const entries: Array<{ path: string; content: string }> = [];
    const seenPaths = new Set<string>();
    for (const fileName of STATE_FILE_ORDER) {
      const content = state[fileName];
      if (content === undefined) {
        continue;
      }
      for (const path of [this.rootPath(fileName), this.mirrorPath(fileName), this.snapshotPath(runId, fileName)]) {
        const dedupeKey = path.toLowerCase();
        if (seenPaths.has(dedupeKey)) {
          continue;
        }
        seenPaths.add(dedupeKey);
        entries.push({ path, content });
      }
    }
    await atomicWriteBatch(this.stateRoot, entries);
  }

  private async mutateState<T>(runId: string, mutate: (state: SerializedState) => Promise<T>): Promise<T> {
    return withWriteLock(
      this.stateRoot,
      async () => {
        const state = await this.loadCanonicalState();
        const result = await mutate(state);
        await this.persistState(state, runId);
        return result;
      },
      { owner: "StateStore" },
    );
  }

  private bootstrapInitialState(taskPacket: TaskPacket, state: SerializedState): void {
    if (state["story-queue.json"] === undefined) {
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
      this.setJsonState(state, "story-queue.json", storyQueue);
    }

    if (state["trace-index.json"] === undefined) {
      const traceIndex: TraceIndex = {
        job_id: taskPacket.job_id,
        freeze_id: taskPacket.freeze_id,
        freeze_version: taskPacket.freeze_version,
        active_story_id: taskPacket.story.story_id,
        stories: {
          [taskPacket.story.story_id]: createStoryTrace(taskPacket),
        },
      };
      this.setJsonState(state, "trace-index.json", traceIndex);
    }

    if (state["loop-metrics.json"] === undefined) {
      const loopMetrics: LoopMetricsFile = {
        job_id: taskPacket.job_id,
        runs: [],
      };
      this.setJsonState(state, "loop-metrics.json", loopMetrics);
    }

    if (state["decisions.en.md"] === undefined) {
      this.setTextState(state, "decisions.en.md", ["# Decisions", "", approvalDecisionEntry()].join("\n"));
    }

    if (state["risk-register.en.md"] === undefined) {
      this.setTextState(state, "risk-register.en.md", renderRiskRegister("READY_TO_RUN", []));
    }

    if (state["handoff.en.md"] === undefined) {
      this.setTextState(
        state,
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
  }

  getTraceIndexPath(): string {
    return this.traceIndexPath;
  }

  async bootstrap(taskPacket: TaskPacket): Promise<void> {
    await ensureDir(this.stateRoot);
    await ensureDir(this.liveStateRoot);
    await this.mutateState(taskPacket.run_id, async (state) => {
      this.bootstrapInitialState(taskPacket, state);
      this.setTextState(
        state,
        "progress.en.md",
        renderProgress(
          taskPacket,
          "READY_TO_RUN",
          "",
          "builder",
          "The fixed local Phase 1 story is approved and ready for the builder run.",
        ),
      );
    });
  }

  async prepareRun(taskPacket: TaskPacket): Promise<void> {
    await this.mutateState(taskPacket.run_id, async (state) => {
      const jobState = runningJobStateForRole(taskPacket.run_role);
      const storyQueue = this.parseJsonState<StoryQueueFile>(state, "story-queue.json");
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

      this.setJsonState(state, "story-queue.json", storyQueue);
      this.setJsonState(state, "active-story.json", activeStory);
      this.setTextState(
        state,
        "progress.en.md",
        renderProgress(
          taskPacket,
          jobState,
          taskPacket.run_id,
          taskPacket.run_role,
          `${taskPacket.run_role} is executing the fixed local proof-of-concept story.`,
        ),
      );
    });
  }

  async recordRun(
    taskPacket: TaskPacket,
    execution: AdapterExecutionResult,
    recoveryState: RunRecoveryState | null = null,
  ): Promise<void> {
    const handoffContent = await readText(execution.handoffPath);
    await this.mutateState(execution.runResult.run_id, async (state) => {
      const jobState = mapRunExitToJobState(execution.runResult.status, execution.runResult.run_role);
      const loopMetrics = this.parseJsonState<LoopMetricsFile>(state, "loop-metrics.json");
      const storyQueue = this.parseJsonState<StoryQueueFile>(state, "story-queue.json");
      const traceIndex = this.parseJsonState<TraceIndex>(state, "trace-index.json");

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

      const existingDecisions = this.readTextState(state, "decisions.en.md");
      this.setJsonState(state, "story-queue.json", storyQueue);
      this.setJsonState(state, "loop-metrics.json", loopMetrics);
      this.setJsonState(state, "trace-index.json", traceIndex);
      this.setTextState(state, "handoff.en.md", handoffContent);
      this.setTextState(state, "risk-register.en.md", renderRiskRegister(jobState, blockers, recoveryState));
      this.setTextState(
        state,
        "decisions.en.md",
        `${existingDecisions.trimEnd()}\n\n${runDecisionEntry(execution.runResult.run_id, jobState, recoveryState)}`,
      );
      this.setTextState(
        state,
        "progress.en.md",
        renderProgress(taskPacket, jobState, execution.runResult.run_id, execution.runResult.run_role, progressSummary),
      );
    });
  }

  async recordIntegrityFailure(taskPacket: TaskPacket, reason: string): Promise<void> {
    await this.mutateState(taskPacket.run_id, async (state) => {
      const storyQueue = this.parseJsonState<StoryQueueFile>(state, "story-queue.json");
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

      const existingDecisions = this.readTextState(state, "decisions.en.md");
      this.setJsonState(state, "story-queue.json", storyQueue);
      this.setTextState(state, "risk-register.en.md", renderRiskRegister("INTEGRITY_FAILED", [reason]));
      this.setTextState(
        state,
        "decisions.en.md",
        `${existingDecisions.trimEnd()}\n\n${integrityFailureDecisionEntry(taskPacket.run_id, reason)}`,
      );
      this.setTextState(
        state,
        "progress.en.md",
        renderProgress(taskPacket, "INTEGRITY_FAILED", taskPacket.run_id, taskPacket.run_role, reason),
      );
    });
  }

  async recordArchiveFinalization(
    taskPacket: TaskPacket,
    latestRunId: string,
    latestRunRole: RunRole,
    finalSummaryPath: string,
  ): Promise<void> {
    await this.mutateState(latestRunId, async (state) => {
      const storyQueue = this.parseJsonState<StoryQueueFile>(state, "story-queue.json");
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

      const existingDecisions = this.readTextState(state, "decisions.en.md");
      this.setJsonState(state, "story-queue.json", storyQueue);
      this.setTextState(
        state,
        "decisions.en.md",
        `${existingDecisions.trimEnd()}\n\n${archiveFinalizationDecisionEntry(latestRunId, finalSummaryPath)}`,
      );
      this.setTextState(
        state,
        "progress.en.md",
        renderProgress(
          taskPacket,
          "COMPLETED",
          latestRunId,
          latestRunRole,
          "Archive finalization completed and the canonical local job bundle is closed.",
        ),
      );
    });
  }
}
