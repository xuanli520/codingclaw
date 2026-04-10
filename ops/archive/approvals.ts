import type { ApprovalCardSnapshot, ApprovalDecisionReceipt } from "../../core/contracts/types.ts";
import { sha256Text, writeJson, writeText } from "../../core/loop/support.ts";

export interface ApprovalArchiveRecord {
  card_id: string;
  snapshot_path: string;
  decision_path: string | null;
  summary_path: string;
  snapshot_checksum: string;
  decision_checksum: string | null;
  summary_checksum: string;
  card_state: ApprovalCardSnapshot["card_state"];
  card_type: string;
  requested_action: string;
  decision: string | null;
  decided_at: string | null;
  timeout_at: string;
}

function renderApprovalSummary(card: ApprovalCardSnapshot, decision: ApprovalDecisionReceipt | null): string {
  if (decision === null) {
    const latestEvidencePath = card.recovery_context?.latest_evidence_path ?? (card.evidence_refs[0] ?? "none");
    const recommendedNextAction = card.recovery_context?.recommended_next_action ?? card.requested_action;
    return [
      "# 审批摘要",
      "",
      `- 作业ID: ${card.job_id}`,
      `- 卡片ID: ${card.card_id}`,
      `- 请求动作: ${card.requested_action}`,
      `- 风险级别: ${card.risk_level}`,
      `- 卡片状态: ${card.card_state}`,
      `- 当前摘要: ${card.summary_zh}`,
      `- 最新证据: ${latestEvidencePath}`,
      `- 下一步: ${recommendedNextAction}`,
      "",
    ].join("\n");
  }
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
  decision: ApprovalDecisionReceipt | null,
): Promise<ApprovalArchiveRecord> {
  const snapshotPath = `${approvalRoot}/approval-card.json`;
  const decisionPath = decision === null ? null : `${approvalRoot}/decision.json`;
  const summaryPath = `${approvalRoot}/summary.zh.md`;
  const summaryText = renderApprovalSummary(card, decision);
  const snapshotText = `${JSON.stringify(card, null, 2)}\n`;

  await writeJson(snapshotPath, card);
  if (decisionPath !== null) {
    await writeJson(decisionPath, decision);
  }
  await writeText(summaryPath, summaryText);

  return {
    card_id: card.card_id,
    snapshot_path: snapshotPath,
    decision_path: decisionPath,
    summary_path: summaryPath,
    snapshot_checksum: sha256Text(snapshotText),
    decision_checksum: decision === null ? null : sha256Text(`${JSON.stringify(decision, null, 2)}\n`),
    summary_checksum: sha256Text(summaryText),
    card_state: card.card_state,
    card_type: card.card_type,
    requested_action: card.requested_action,
    decision: decision?.decision ?? null,
    decided_at: decision?.decided_at ?? null,
    timeout_at: card.timeout_at,
  };
}
