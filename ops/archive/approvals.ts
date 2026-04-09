import type { ApprovalCardSnapshot, ApprovalDecisionReceipt } from "../../core/contracts/types.ts";
import { sha256Text, writeJson, writeText } from "../../core/loop/support.ts";

export interface ApprovalArchiveRecord {
  card_id: string;
  snapshot_path: string;
  decision_path: string;
  summary_path: string;
  snapshot_checksum: string;
  decision_checksum: string;
  summary_checksum: string;
  card_state: ApprovalCardSnapshot["card_state"];
  card_type: string;
  requested_action: string;
  decision: string;
  decided_at: string;
}

function renderApprovalSummary(card: ApprovalCardSnapshot, decision: ApprovalDecisionReceipt): string {
  return [
    "# 审批摘要",
    "",
    `- 作业ID: ${card.job_id}`,
    `- 卡片ID: ${card.card_id}`,
    `- 请求动作: ${card.requested_action}`,
    `- 风险级别: ${card.risk_level}`,
    `- 审批结论: ${decision.decision}`,
    `- 审批时间: ${decision.decided_at}`,
    "- 下一步: 生成冻结契约并执行 builder 到 QA 的固定本地流程。",
    "",
  ].join("\n");
}

export async function writeApprovalArchive(
  approvalRoot: string,
  card: ApprovalCardSnapshot,
  decision: ApprovalDecisionReceipt,
): Promise<ApprovalArchiveRecord> {
  const snapshotPath = `${approvalRoot}/approval-card.json`;
  const decisionPath = `${approvalRoot}/decision.json`;
  const summaryPath = `${approvalRoot}/summary.zh.md`;
  const summaryText = renderApprovalSummary(card, decision);
  const snapshotText = `${JSON.stringify(card, null, 2)}\n`;
  const decisionText = `${JSON.stringify(decision, null, 2)}\n`;

  await writeJson(snapshotPath, card);
  await writeJson(decisionPath, decision);
  await writeText(summaryPath, summaryText);

  return {
    card_id: card.card_id,
    snapshot_path: snapshotPath,
    decision_path: decisionPath,
    summary_path: summaryPath,
    snapshot_checksum: sha256Text(snapshotText),
    decision_checksum: sha256Text(decisionText),
    summary_checksum: sha256Text(summaryText),
    card_state: card.card_state,
    card_type: card.card_type,
    requested_action: card.requested_action,
    decision: decision.decision,
    decided_at: decision.decided_at,
  };
}
