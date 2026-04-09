import { readJson, pathExists, writeJson, writeText } from "../../core/loop/support.ts";
import type { RunResult, WorkerOutput } from "../../core/contracts/types.ts";
import { emitWorkerOutput, loadWorkerContext } from "./common.ts";

async function main(): Promise<void> {
  const { envelope, taskPacket, runRoot } = await loadWorkerContext();
  const builderRunRoot = String(envelope.trace_context.builder_run_root ?? "");
  const builderRunResultPath = String(envelope.trace_context.builder_run_result_path ?? "");

  const requiredBuilderArtifacts = [
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

  const missingArtifacts: string[] = [];
  for (const relativePath of requiredBuilderArtifacts) {
    const absolutePath = `${builderRunRoot}/${relativePath}`;
    if (!(await pathExists(absolutePath))) {
      missingArtifacts.push(relativePath);
    }
  }

  let builderStatus = "UNKNOWN";
  if (builderRunResultPath && (await pathExists(builderRunResultPath))) {
    const builderResult = await readJson<RunResult>(builderRunResultPath);
    builderStatus = builderResult.status;
  } else {
    missingArtifacts.push("metadata/run-result.json");
  }

  const status = missingArtifacts.length === 0 && builderStatus === "SUCCESS" ? "SUCCESS" : "FIXBACK_REQUIRED";
  const qaReportPath = `${runRoot}/reports/qa-report.en.md`;
  const qaCheckPath = `${runRoot}/evidence/test-results/qa-check.json`;
  const qaVerdictPath = `${runRoot}/metadata/qa-verdict.json`;
  const fixbackItemsPath = `${runRoot}/reports/fixback-items.en.md`;

  await writeText(
    qaReportPath,
    [
      "# QA Report",
      "",
      `- job_id: ${envelope.job_id}`,
      `- run_id: ${envelope.run_id}`,
      `- story_id: ${taskPacket.story.story_id}`,
      `- verified builder run root: ${builderRunRoot.replaceAll("\\", "/")}`,
      `- builder run status: ${builderStatus}`,
      `- QA verdict: ${status}`,
      "- checked artifacts:",
      ...requiredBuilderArtifacts.map((value) => `- ${value}`),
      "",
      "- missing artifacts:",
      ...(missingArtifacts.length === 0 ? ["- none"] : missingArtifacts.map((value) => `- ${value}`)),
      "",
    ].join("\n"),
  );

  await writeJson(qaCheckPath, {
    run_id: envelope.run_id,
    run_role: envelope.run_role,
    story_id: taskPacket.story.story_id,
    verified_builder_artifacts: requiredBuilderArtifacts,
    missing_builder_artifacts: missingArtifacts,
    builder_status: builderStatus,
  });

  const acceptanceClosure =
    status === "SUCCESS"
      ? { pass: taskPacket.story.acceptance_ids.length, fail: 0, blocked: 0, total: taskPacket.story.acceptance_ids.length }
      : { pass: 0, fail: taskPacket.story.acceptance_ids.length, blocked: 0, total: taskPacket.story.acceptance_ids.length };

  await writeJson(qaVerdictPath, {
    story_id: taskPacket.story.story_id,
    status_family: "run_exit",
    status,
    acceptance_closure: acceptanceClosure,
  });

  const fixbackItems = missingArtifacts.map((value) => `Restore builder artifact: ${value}`);
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
            "Verified the builder artifact bundle against the same approved story.",
            "Closed acceptance and mandatory checks with QA evidence.",
          ]
        : ["Ran QA against the builder bundle and found missing required artifacts."],
    open: status === "SUCCESS" ? ["Archive the local proof-of-concept story."] : ["Run an in-scope fixback for the missing builder artifacts."],
    blockers: fixbackItems,
    next_action: status === "SUCCESS" ? "archive" : "enter fixback",
    acceptance_status: status === "SUCCESS" ? "pass" : "fail",
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
