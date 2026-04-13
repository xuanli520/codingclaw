import { collectRelativeFiles, pathExists, readJson, readText, writeJson, writeText } from "../../core/loop/support.ts";
import type { ArtifactIndex, RunResult, TaskPacket, WorkerOutput } from "../../core/contracts/types.ts";
import { emitWorkerOutput, loadWorkerContext } from "./common.ts";

const CHINESE_TEXT = /[\u4e00-\u9fff]/u;

function countAcceptanceStatuses(verdicts: Record<string, { status: "pass" | "fail" | "blocked" }>): {
  pass: number;
  fail: number;
  blocked: number;
  total: number;
} {
  const counts = { pass: 0, fail: 0, blocked: 0, total: 0 };
  for (const verdict of Object.values(verdicts)) {
    counts.total += 1;
    counts[verdict.status] += 1;
  }
  return counts;
}

async function main(): Promise<void> {
  const { envelope, taskPacket, runRoot } = await loadWorkerContext();
  const builderRunRoot = String(envelope.trace_context.builder_run_root ?? "");
  const builderRunResultPath = String(envelope.trace_context.builder_run_result_path ?? "");
  const builderTaskPacketPath = `${builderRunRoot}/metadata/task-packet.en.json`;
  const builderArtifactIndexPath = `${builderRunRoot}/metadata/artifact-index.json`;

  const qaReportPath = `${runRoot}/reports/qa-report.en.md`;
  const qaCheckPath = `${runRoot}/evidence/test-results/qa-check.json`;
  const qaVerdictPath = `${runRoot}/metadata/qa-verdict.json`;
  const fixbackItemsPath = `${runRoot}/reports/fixback-items.en.md`;
  const builderTaskPacket =
    builderTaskPacketPath && (await pathExists(builderTaskPacketPath))
      ? await readJson<TaskPacket>(builderTaskPacketPath)
      : null;
  const requiredBuilderArtifacts = builderTaskPacket?.story.expected_artifacts ?? [
    "metadata/task-packet.en.json",
    "metadata/timings.json",
    "metadata/run-result.json",
    "metadata/artifact-index.json",
    "logs/command-log.txt",
    "logs/worker.log",
    "reports/handoff.en.md",
    "reports/implementation-summary.en.md",
    "reports/self-check.en.md",
    "evidence/test-results/builder-check.json",
  ];
  const builderProducedArtifacts = builderRunRoot && (await pathExists(builderRunRoot)) ? await collectRelativeFiles(builderRunRoot) : [];
  const missingArtifacts = requiredBuilderArtifacts.filter((relativePath) => !builderProducedArtifacts.includes(relativePath));
  const builderArtifactIndex =
    builderArtifactIndexPath && (await pathExists(builderArtifactIndexPath))
      ? await readJson<ArtifactIndex>(builderArtifactIndexPath)
      : null;
  const indexedArtifacts = new Set((builderArtifactIndex?.artifacts ?? []).map((entry) => entry.path));
  const unindexedArtifacts = builderProducedArtifacts.filter((relativePath) => !indexedArtifacts.has(relativePath));
  const undeclaredArtifacts = builderProducedArtifacts.filter((relativePath) => !requiredBuilderArtifacts.includes(relativePath));
  let builderStatus = "UNKNOWN";
  let builderRunResult: RunResult | null = null;
  if (builderRunResultPath && (await pathExists(builderRunResultPath))) {
    builderRunResult = await readJson<RunResult>(builderRunResultPath);
    builderStatus = builderRunResult.status;
  } else {
    missingArtifacts.push("metadata/run-result.json");
  }
  const reproducibilityIssues = [
    ...(builderTaskPacket === null ? ["missing builder task packet"] : []),
    ...(builderTaskPacket !== null && builderTaskPacket.story.story_id !== taskPacket.story.story_id
      ? ["builder task packet story does not match QA story"]
      : []),
    ...(builderTaskPacket !== null && builderTaskPacket.freeze_version !== taskPacket.freeze_version
      ? ["builder task packet freeze version does not match QA freeze"]
      : []),
    ...(builderTaskPacket !== null && builderTaskPacket.base_commit !== taskPacket.base_commit
      ? ["builder task packet base commit does not match QA base commit"]
      : []),
    ...(builderRunResult !== null && builderRunResult.story_id !== taskPacket.story.story_id
      ? ["builder run result story does not match QA story"]
      : []),
  ];
  const textSurfaces = (
    await Promise.all(
      ["reports/handoff.en.md", "reports/implementation-summary.en.md", "reports/self-check.en.md"].map(async (relativePath) => {
        const absolutePath = `${builderRunRoot}/${relativePath}`;
        if (!(await pathExists(absolutePath))) {
          return null;
        }
        return {
          relativePath,
          content: await readText(absolutePath),
        };
      }),
    )
  ).filter((value): value is { relativePath: string; content: string } => value !== null);
  const languageViolations = textSurfaces
    .filter((surface) => CHINESE_TEXT.test(surface.content))
    .map((surface) => surface.relativePath);
  const fixbackItems = [
    ...missingArtifacts.map((relativePath) => `Restore builder artifact: ${relativePath}`),
    ...unindexedArtifacts.map((relativePath) => `Add artifact-index entry for builder output: ${relativePath}`),
    ...undeclaredArtifacts.map((relativePath) => `Move or remove out-of-scope builder artifact: ${relativePath}`),
    ...reproducibilityIssues.map((issue) => `Restore reproducibility contract: ${issue}`),
    ...languageViolations.map((relativePath) => `Rewrite repository-facing output in English: ${relativePath}`),
    ...(builderStatus === "SUCCESS" ? [] : [`Builder did not finish successfully: ${builderStatus}`]),
  ];
  const status: WorkerOutput["status"] =
    undeclaredArtifacts.length > 0
      ? "CHANGE_REQUEST_REQUIRED"
      : fixbackItems.length === 0
        ? "SUCCESS"
        : "FIXBACK_REQUIRED";
  const acceptanceVerdicts = Object.fromEntries(
    taskPacket.story.acceptance_ids.map((acceptanceId, index) => {
      const passEvidence =
        index === 0
          ? ["reports/implementation-summary.en.md", "evidence/test-results/builder-check.json"]
          : ["reports/qa-report.en.md", "metadata/qa-verdict.json", "evidence/test-results/qa-check.json"];
      const failEvidence = status === "CHANGE_REQUEST_REQUIRED" ? ["reports/fixback-items.en.md", "reports/qa-report.en.md"] : passEvidence;
      return [
        acceptanceId,
        {
          status: status === "SUCCESS" ? "pass" : status === "CHANGE_REQUEST_REQUIRED" ? "blocked" : "fail",
          evidence_paths: status === "SUCCESS" ? passEvidence : failEvidence,
        },
      ];
    }),
  ) as Record<string, { status: "pass" | "fail" | "blocked"; evidence_paths: string[] }>;
  const mandatoryChecks = {
    "scope-compliance": {
      status: undeclaredArtifacts.length === 0 ? "pass" : "fail",
      evidence_paths:
        undeclaredArtifacts.length === 0 ? ["metadata/qa-verdict.json"] : ["reports/fixback-items.en.md", "reports/qa-report.en.md"],
    },
    "artifact-presence": {
      status: missingArtifacts.length === 0 ? "pass" : "fail",
      evidence_paths:
        missingArtifacts.length === 0
          ? ["reports/qa-report.en.md", "metadata/qa-verdict.json"]
          : ["reports/fixback-items.en.md", "reports/qa-report.en.md"],
    },
    "evidence-completeness": {
      status: unindexedArtifacts.length === 0 ? "pass" : "fail",
      evidence_paths:
        unindexedArtifacts.length === 0
          ? ["evidence/test-results/qa-check.json", "metadata/qa-verdict.json"]
          : ["reports/fixback-items.en.md", "reports/qa-report.en.md"],
    },
    "acceptance-closure": {
      status: Object.values(acceptanceVerdicts).every((entry) => entry.status === "pass") ? "pass" : "fail",
      evidence_paths: ["metadata/qa-verdict.json", "reports/qa-report.en.md"],
    },
  };
  const acceptanceClosure = countAcceptanceStatuses(acceptanceVerdicts);
  const qaReportText = [
    "# QA Report",
    "",
    `- job_id: ${envelope.job_id}`,
    `- run_id: ${envelope.run_id}`,
    `- story_id: ${taskPacket.story.story_id}`,
    `- verified builder run root: ${builderRunRoot.replaceAll("\\", "/")}`,
    `- builder run status: ${builderStatus}`,
    `- QA verdict: ${status}`,
    "",
    "## Contract Checks",
    "",
    `- scope-compliance: ${mandatoryChecks["scope-compliance"].status}`,
    `- build-or-install reproducibility: ${reproducibilityIssues.length === 0 ? "pass" : "fail"}`,
    `- language boundary compliance: ${languageViolations.length === 0 ? "pass" : "fail"}`,
    `- evidence completeness: ${mandatoryChecks["evidence-completeness"].status}`,
    `- artifact presence: ${mandatoryChecks["artifact-presence"].status}`,
    `- acceptance closure: ${mandatoryChecks["acceptance-closure"].status}`,
    "",
    "- checked artifacts:",
    ...requiredBuilderArtifacts.map((value) => `- ${value}`),
    "",
    "- missing artifacts:",
    ...(missingArtifacts.length === 0 ? ["- none"] : missingArtifacts.map((value) => `- ${value}`)),
    "",
    "- undeclared builder artifacts:",
    ...(undeclaredArtifacts.length === 0 ? ["- none"] : undeclaredArtifacts.map((value) => `- ${value}`)),
    "",
    "- language violations:",
    ...(languageViolations.length === 0 ? ["- none"] : languageViolations.map((value) => `- ${value}`)),
    "",
    "- reproducibility issues:",
    ...(reproducibilityIssues.length === 0 ? ["- none"] : reproducibilityIssues.map((value) => `- ${value}`)),
    "",
  ].join("\n");

  await writeText(qaReportPath, qaReportText);

  await writeJson(qaCheckPath, {
    run_id: envelope.run_id,
    run_role: envelope.run_role,
    story_id: taskPacket.story.story_id,
    scope_validation: {
      undeclared_builder_artifacts: undeclaredArtifacts,
      unindexed_builder_artifacts: unindexedArtifacts,
    },
    reproducibility: {
      issues: reproducibilityIssues,
      builder_task_packet_path: builderTaskPacketPath,
      builder_run_result_path: builderRunResultPath,
    },
    language_validation: {
      violations: languageViolations,
      checked_surfaces: textSurfaces.map((surface) => surface.relativePath),
    },
    verified_builder_artifacts: requiredBuilderArtifacts,
    missing_builder_artifacts: missingArtifacts,
    builder_status: builderStatus,
  });

  await writeJson(qaVerdictPath, {
    story_id: taskPacket.story.story_id,
    status_family: "run_exit",
    status,
    acceptance_closure: acceptanceClosure,
    acceptance_verdicts: acceptanceVerdicts,
    mandatory_checks: mandatoryChecks,
    scope_validation: {
      undeclared_builder_artifacts: undeclaredArtifacts,
      unindexed_builder_artifacts: unindexedArtifacts,
    },
    reproducibility: {
      status: reproducibilityIssues.length === 0 ? "pass" : "fail",
      issues: reproducibilityIssues,
    },
    language_validation: {
      status: languageViolations.length === 0 ? "pass" : "fail",
      violations: languageViolations,
    },
  });

  if (fixbackItems.length > 0) {
    await writeText(
      fixbackItemsPath,
      ["# Fixback Items", "", ...fixbackItems.map((value) => `- ${value}`), ""].join("\n"),
    );
  }

  const output: WorkerOutput = {
    status,
    completed:
      status === "SUCCESS"
        ? [
            "Verified the builder artifact bundle against the same approved story and freeze.",
            "Closed acceptance, scope, reproducibility, language, and evidence checks with QA evidence.",
          ]
        : status === "CHANGE_REQUEST_REQUIRED"
          ? ["Ran QA against the builder bundle and found scope drift."]
          : ["Ran QA against the builder bundle and found fixback work inside the active scope."],
    open:
      status === "SUCCESS"
        ? ["Archive the local proof-of-concept story."]
        : status === "CHANGE_REQUEST_REQUIRED"
          ? ["Create a change request before continuing."]
          : ["Run an in-scope fixback for the active QA findings."],
    blockers: fixbackItems,
    next_action: status === "SUCCESS" ? "archive" : status === "CHANGE_REQUEST_REQUIRED" ? "request change" : "enter fixback",
    acceptance_status: status === "SUCCESS" ? "pass" : status === "CHANGE_REQUEST_REQUIRED" ? "blocked" : "fail",
    mandatory_check_status: status === "SUCCESS" ? "pass" : "fail",
    evidence_paths: [
      "reports/qa-report.en.md",
      "metadata/qa-verdict.json",
      "evidence/test-results/qa-check.json",
      ...(fixbackItems.length > 0 ? ["reports/fixback-items.en.md"] : []),
    ],
    report_paths: ["reports/qa-report.en.md", ...(fixbackItems.length > 0 ? ["reports/fixback-items.en.md"] : [])],
    test_result_paths: ["evidence/test-results/qa-check.json"],
    fixback_items: fixbackItems,
  };

  emitWorkerOutput(output);
}

main().catch((error) => {
  process.stderr.write(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
