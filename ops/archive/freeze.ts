import type { ContractFreezeMetadata } from "../../core/contracts/types.ts";
import { sha256Text, writeText } from "../../core/loop/support.ts";

export interface ContractFreezeInput {
  metadata: ContractFreezeMetadata;
  approvalSnapshotPath: string;
  approvalDecisionPath: string;
  freezeJsonPath: string;
  freezeChecksumPath: string;
}

export interface ContractFreezeRecord {
  path: string;
  json_path: string;
  checksum_path: string;
  hash: string;
}

function renderList(items: string[]): string[] {
  return items.length === 0 ? ["- none"] : items.map((item) => `- ${item}`);
}

function renderContractFreezeMarkdown(input: ContractFreezeInput, hash: string): string {
  const { metadata } = input;

  return [
    "# Contract Freeze",
    "",
    "## 1. Document Control",
    "",
    `- freeze_id: ${metadata.freeze_id}`,
    `- freeze_version: ${metadata.freeze_version}`,
    `- approved_at: ${metadata.approved_at}`,
    `- approval_card_id: ${metadata.approval_card_id}`,
    "",
    "## 2. Core Objective",
    "",
    "- approved objective: Execute the fixed local Phase 1 builder to QA proof while archiving the required governance and integrity objects in one canonical job bundle.",
    "- bound project scope: The work is limited to the existing single-story local flow and its governance archive outputs.",
    "",
    "## 3. Approved Architecture Direction",
    "",
    "- architecture decision carried from the Development Plan:",
    "- Preserve the local generic CLI builder then QA path.",
    "- Write governance objects at the job root and keep live state mirrored under state/.",
    "- non-negotiable boundaries:",
    "- Do not add review execution, mobile integration, or unrelated scheduling features.",
    "",
    "## 4. Baseline Binding",
    "",
    `- base_branch: ${metadata.base_branch}`,
    `- base_commit: ${metadata.base_commit}`,
    `- dependency snapshot digest: ${metadata.dependency_snapshot_digest}`,
    "- allowed continuation rule: QA may continue only from the recorded baseline and the archived builder handoff inside the same job root.",
    "",
    "## 5. Approved Execution Surface",
    "",
    `- approved adapters: ${metadata.approved_adapters.join(", ")}`,
    `- approved run roles: ${metadata.approved_run_roles.join(", ")}`,
    "- capability or sandbox limits when relevant:",
    "- Filesystem read/write and shell command are allowed only for the fixed local worker flow.",
    "",
    "## 6. In-Scope Checklist",
    "",
    ...renderList(metadata.in_scope_items),
    "",
    "## 7. Out-of-Scope Checklist",
    "",
    ...renderList(metadata.out_of_scope_items),
    "",
    "## 8. Story and Acceptance Coverage",
    "",
    `- approved story IDs: ${metadata.story_ids.join(", ")}`,
    `- approved acceptance IDs: ${metadata.acceptance_ids.join(", ")}`,
    "- traceability expectations: state/trace-index.json and job-manifest.json must resolve each accepted artifact path under the canonical job root.",
    "",
    "## 9. Quality Bar",
    "",
    ...renderList(metadata.quality_bar),
    "",
    "## 10. Delivery Format",
    "",
    "- required reports:",
    "- implementation-summary.en.md",
    "- self-check.en.md",
    "- qa-report.en.md",
    "- required metadata:",
    ...renderList(metadata.delivery_artifacts),
    "- archive expectations:",
    "- approval artifacts must remain under approvals/<card_id>/ and never inside per-run worker trees.",
    "",
    "## 11. Language Policy",
    "",
    `- English repository-facing requirement: ${metadata.language_policy}`,
    "- allowed Chinese control-plane surfaces: approvals/<card_id>/summary.zh.md",
    "",
    "## 12. Budget and Time Guardrails",
    "",
    `- budget limits: ${JSON.stringify(metadata.budget_limits)}`,
    `- timeout limits: ${JSON.stringify(metadata.time_limits)}`,
    "- escalation threshold: stop on missing required artifacts, policy failure, or checksum verification failure.",
    "",
    "## 13. Approval Record",
    "",
    "- approving actor or channel: local-owner via local fixture",
    `- approval timestamp: ${metadata.approved_at}`,
    `- related decision artifacts: ${input.approvalSnapshotPath}, ${input.approvalDecisionPath}`,
    "",
    "## 14. Integrity Metadata",
    "",
    `- freeze hash: ${hash}`,
    `- contract-freeze.json path: ${input.freezeJsonPath}`,
    `- contract-freeze.sha256 path: ${input.freezeChecksumPath}`,
    "",
  ].join("\n");
}

export async function writeContractFreeze(
  markdownPath: string,
  jsonPath: string,
  input: ContractFreezeInput,
): Promise<ContractFreezeRecord> {
  const jsonText = `${JSON.stringify(input.metadata, null, 2)}\n`;
  const hash = sha256Text(jsonText);
  await writeText(jsonPath, jsonText);
  await writeText(markdownPath, renderContractFreezeMarkdown(input, hash));
  return {
    path: markdownPath,
    json_path: jsonPath,
    checksum_path: input.freezeChecksumPath,
    hash,
  };
}
