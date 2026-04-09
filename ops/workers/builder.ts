import { writeJson, writeText } from "../../core/loop/support.ts";
import type { WorkerOutput } from "../../core/contracts/types.ts";
import { emitWorkerOutput, loadWorkerContext } from "./common.ts";

async function main(): Promise<void> {
  const { envelope, taskPacket, runRoot } = await loadWorkerContext();
  const implementationSummaryPath = `${runRoot}/reports/implementation-summary.en.md`;
  const selfCheckPath = `${runRoot}/reports/self-check.en.md`;
  const builderCheckPath = `${runRoot}/evidence/test-results/builder-check.json`;

  await writeText(
    implementationSummaryPath,
    [
      "# Implementation Summary",
      "",
      `- job_id: ${envelope.job_id}`,
      `- run_id: ${envelope.run_id}`,
      `- story_id: ${taskPacket.story.story_id}`,
      `- objective: ${taskPacket.story.story_objective}`,
      "- completed work:",
      "- materialized the fixed local Phase 1 builder slice",
      "- wrote the required builder reports and evidence under the run root",
      "",
    ].join("\n"),
  );

  await writeText(
    selfCheckPath,
    [
      "# Self Check",
      "",
      "- required checks executed:",
      "- scope-compliance",
      "- artifact-presence",
      "- evidence-completeness",
      "- next required action: run QA against the same story",
      "",
    ].join("\n"),
  );

  await writeJson(builderCheckPath, {
    run_id: envelope.run_id,
    run_role: envelope.run_role,
    story_id: taskPacket.story.story_id,
    status: "prepared-for-qa",
    checked_items: taskPacket.story.mandatory_checks,
  });

  const output: WorkerOutput = {
    status: "SUCCESS",
    completed: [
      "Read the fixed local task packet.",
      "Wrote the builder reports and local verification evidence.",
    ],
    open: ["Run QA against the same story."],
    blockers: [],
    next_action: "run QA",
    acceptance_status: "blocked",
    mandatory_check_status: "blocked",
    evidence_paths: [
      "reports/implementation-summary.en.md",
      "reports/self-check.en.md",
      "evidence/test-results/builder-check.json",
    ],
    report_paths: ["reports/implementation-summary.en.md", "reports/self-check.en.md"],
    test_result_paths: ["evidence/test-results/builder-check.json"],
    fixback_items: [],
  };

  emitWorkerOutput(output);
}

main().catch((error) => {
  process.stderr.write(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
