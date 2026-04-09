import { sha256Text, writeText } from "../../core/loop/support.ts";

export interface DevelopmentPlanInput {
  planId: string;
  jobId: string;
  preparedAt: string;
  preparedBy: string;
  baseBranch: string;
  baseCommit: string;
  adapters: string[];
  runRoles: string[];
  architectureDirection: string[];
  milestones: string[];
  storyId: string;
  storyObjective: string;
  acceptanceIds: string[];
  inScopeItems: string[];
  outOfScopeItems: string[];
  mandatoryChecks: string[];
  expectedArtifacts: string[];
  risks: string[];
  openQuestions: string[];
  approvalRequested: string;
}

export interface DevelopmentPlanRecord {
  path: string;
  checksum: string;
}

function renderList(items: string[]): string[] {
  return items.length === 0 ? ["- none"] : items.map((item) => `- ${item}`);
}

function renderDevelopmentPlan(input: DevelopmentPlanInput): string {
  return [
    "# Development Plan",
    "",
    "## 1. Document Control",
    "",
    `- plan_id: ${input.planId}`,
    `- job_id: ${input.jobId}`,
    `- prepared_at: ${input.preparedAt}`,
    `- prepared_by: ${input.preparedBy}`,
    "",
    "## 2. Problem Statement",
    "",
    "- problem summary: The local Phase 1 flow must archive governance and integrity objects around the fixed single-story execution path.",
    "- current user or operator pain: The current proof only writes run outputs and misses the canonical job governance bundle.",
    "",
    "## 3. Goals",
    "",
    "- primary goals: Emit the Phase 1 governance archive objects under one canonical job root without changing the existing builder to QA story path.",
    "- measurable success signals when available: One local run produces the required plan, freeze, approvals, manifest, checksums, and run bundles under jobs/<job_id>/.",
    "",
    "## 4. Non-Goals",
    "",
    ...renderList(input.outOfScopeItems),
    "",
    "## 5. Assumptions",
    "",
    "- repo assumptions: The fixed local task packet and approval card fixtures remain the source for the approved single-story proof.",
    "- runtime assumptions: The local generic CLI adapter executes builder then QA on the same host.",
    "- approval or credential assumptions: Execution is pre-approved by the fixed local approval record and needs no additional credentials.",
    "",
    "## 6. Current Repo Baseline",
    "",
    `- base branch: ${input.baseBranch}`,
    `- observed base_commit: ${input.baseCommit}`,
    "- important repo constraints: Persistent outputs must move under one canonical job root while live state mirrors remain under state/.",
    "",
    "## 7. Intended Execution Surface",
    "",
    `- planned adapters: ${input.adapters.join(", ")}`,
    `- expected run roles: ${input.runRoles.join(", ")}`,
    "- any GUI exception expectation: none",
    "",
    "## 8. Architecture Direction",
    "",
    ...renderList(input.architectureDirection),
    "",
    "## 9. Milestones",
    "",
    ...renderList(input.milestones),
    "",
    "## 10. Story Breakdown",
    "",
    `- story IDs: ${input.storyId}`,
    `- objective for each story: ${input.storyObjective}`,
    `- acceptance IDs for each story: ${input.acceptanceIds.join(", ")}`,
    "- dependency notes when relevant: QA depends on the archived builder handoff and run bundle from the same job root.",
    "",
    "## 11. Testing Strategy",
    "",
    "- required checks:",
    ...renderList(input.mandatoryChecks),
    "- required environments:",
    "- local single-node fixture execution",
    "- evidence expectations:",
    "- QA must confirm the builder bundle is present under artifacts/runs/<run_id>/ and that governance files are archived under the job root.",
    "",
    "## 12. Delivery Checklist",
    "",
    "- required artifacts:",
    ...renderList(input.expectedArtifacts),
    "- required reports:",
    "- builder implementation summary",
    "- builder self-check",
    "- QA report",
    "- archive or handoff expectations:",
    "- state/handoff.en.md must mirror the latest archived run handoff path.",
    "",
    "## 13. Risks",
    "",
    ...renderList(input.risks),
    "",
    "## 14. Open Questions",
    "",
    ...renderList(input.openQuestions),
    "",
    "## 15. Approval Touchpoints",
    "",
    "- owner approval gates: approve the fixed local development plan before freeze generation.",
    "- expected change request gates: none for the fixed local proof unless scope drifts.",
    "",
    "## 16. Approval Requested",
    "",
    `- exact approval being requested: ${input.approvalRequested}`,
    "- next action if approved: generate the freeze, archive the approval record, then execute builder followed by QA.",
    "- next action if rejected: stop execution and revise the fixed local proof scope.",
    "",
  ].join("\n");
}

export async function writeDevelopmentPlan(path: string, input: DevelopmentPlanInput): Promise<DevelopmentPlanRecord> {
  const content = renderDevelopmentPlan(input);
  await writeText(path, content);
  return {
    path,
    checksum: sha256Text(content),
  };
}
