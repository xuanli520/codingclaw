import { pathExists, writeJson, writeText } from "../../core/loop/support.ts";
import type { WorkerOutput } from "../../core/contracts/types.ts";
import { emitWorkerOutput, loadWorkerContext } from "./common.ts";

const CHINESE_TEXT = /[\u4e00-\u9fff]/u;

async function main(): Promise<void> {
  const { envelope, taskPacket, runRoot } = await loadWorkerContext();
  const implementationSummaryPath = `${runRoot}/reports/implementation-summary.en.md`;
  const selfCheckPath = `${runRoot}/reports/self-check.en.md`;
  const builderCheckPath = `${runRoot}/evidence/test-results/builder-check.json`;
  const implementationSummaryText = [
    "# Implementation Summary",
    "",
    `- job_id: ${envelope.job_id}`,
    `- run_id: ${envelope.run_id}`,
    `- story_id: ${taskPacket.story.story_id}`,
    `- objective: ${taskPacket.story.story_objective}`,
    `- freeze_version: ${taskPacket.freeze_version}`,
    `- base_commit: ${taskPacket.base_commit}`,
    `- requested_capabilities: ${taskPacket.requested_capabilities.join(", ")}`,
    `- expected_artifacts: ${taskPacket.story.expected_artifacts.join(", ")}`,
    "",
  ].join("\n");
  const selfCheckText = [
    "# Self Check",
    "",
    "- required checks executed:",
    "- approval-context",
    "- language-boundary",
    "- artifact-presence",
    "- evidence-completeness",
    "- next required action: run QA against the same story",
    "",
  ].join("\n");

  await writeText(implementationSummaryPath, implementationSummaryText);
  await writeText(selfCheckPath, selfCheckText);

  const producedArtifacts = [
    "reports/implementation-summary.en.md",
    "reports/self-check.en.md",
  ];
  const missingArtifacts: string[] = [];
  for (const relativePath of producedArtifacts) {
    if (!(await pathExists(`${runRoot}/${relativePath}`))) {
      missingArtifacts.push(relativePath);
    }
  }
  const languageViolations = [
    ["reports/implementation-summary.en.md", implementationSummaryText],
    ["reports/self-check.en.md", selfCheckText],
  ]
    .filter(([, content]) => CHINESE_TEXT.test(content))
    .map(([relativePath]) => relativePath);
  const approvalState = String(taskPacket.approval_context.approval_state ?? "");
  const approvalCardId = String(taskPacket.approval_context.approval_card_id ?? "");
  const blockers = [
    ...(approvalState === "DECIDED" ? [] : [`approval context is not decided: ${approvalState || "missing"}`]),
    ...missingArtifacts.map((relativePath) => `required builder artifact missing after self-check: ${relativePath}`),
    ...languageViolations.map((relativePath) => `non-English repository-facing content: ${relativePath}`),
  ];
  const status: WorkerOutput["status"] = blockers.length === 0 ? "SUCCESS" : "FAILED_POLICY";

  await writeJson(builderCheckPath, {
    run_id: envelope.run_id,
    run_role: envelope.run_role,
    story_id: taskPacket.story.story_id,
    status: status === "SUCCESS" ? "prepared-for-qa" : "blocked",
    approval_context: {
      approval_card_id: approvalCardId,
      approval_state: approvalState || "missing",
    },
    self_checks: {
      approval_context: approvalState === "DECIDED" ? "pass" : "fail",
      language_boundary: languageViolations.length === 0 ? "pass" : "fail",
      artifact_presence: missingArtifacts.length === 0 ? "pass" : "fail",
      evidence_completeness: missingArtifacts.length === 0 ? "pass" : "fail",
    },
    verification_targets: taskPacket.story.verification_targets,
    produced_artifacts: [...producedArtifacts, "evidence/test-results/builder-check.json"],
    missing_artifacts: missingArtifacts,
    language_violations: languageViolations,
    checked_items: taskPacket.story.mandatory_checks,
  });

  const output: WorkerOutput = {
    status,
    completed:
      status === "SUCCESS"
        ? [
            "Read the fixed local task packet and approval context.",
            "Wrote the builder reports and local verification evidence.",
          ]
        : ["Stopped after the builder self-check found contract or policy violations."],
    open: status === "SUCCESS" ? ["Run QA against the same story."] : ["Resolve the builder blockers before re-running QA."],
    blockers,
    next_action: status === "SUCCESS" ? "run QA" : "stop and review builder blockers",
    acceptance_status: "blocked",
    mandatory_check_status: status === "SUCCESS" ? "pass" : "fail",
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
