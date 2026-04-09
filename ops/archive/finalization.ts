import { arch, hostname, platform, release } from "node:os";
import type {
  AdapterExecutionResult,
  EnvironmentSnapshotMetadata,
  FinalSummaryMetadata,
  FinalSummaryRunRecord,
  JobManifest,
  TaskPacket,
} from "../../core/contracts/types.ts";
import { uniqueStrings, writeJson, writeText } from "../../core/loop/support.ts";
import type { JobRootLayout } from "./job-root.ts";

function renderList(items: string[]): string[] {
  return items.length === 0 ? ["- none"] : items.map((item) => `- ${item}`);
}

function renderFinalSummary(metadata: FinalSummaryMetadata): string {
  const lines = [
    "# Final Summary",
    "",
    `- job_id: ${metadata.job_id}`,
    `- completed_at: ${metadata.completed_at}`,
    `- final job state: ${metadata.final_job_state}`,
    `- freeze_version: ${metadata.freeze_version}`,
    `- story_id: ${metadata.story_id}`,
    `- acceptance_ids: ${metadata.acceptance_ids.join(", ")}`,
    `- final summary path: ${metadata.final_summary_path}`,
    `- environment snapshot path: ${metadata.environment_path}`,
    `- checksum file: ${metadata.checksum_file}`,
    `- latest handoff path: ${metadata.latest_handoff_path}`,
    "",
    "## Archived Runs",
    "",
  ];

  for (const run of metadata.runs) {
    lines.push(`### ${run.run_id}`);
    lines.push("");
    lines.push(`- run_role: ${run.run_role}`);
    lines.push(`- run_exit_status: ${run.run_exit_status}`);
    lines.push(`- started_at: ${run.started_at}`);
    lines.push(`- ended_at: ${run.ended_at}`);
    lines.push(`- duration_s: ${run.duration_s}`);
    lines.push(`- handoff_path: ${run.handoff_path}`);
    lines.push("- report_paths:");
    lines.push(...renderList(run.report_paths));
    lines.push("- log_paths:");
    lines.push(...renderList(run.log_paths));
    lines.push(`- timing_path: ${run.timing_path}`);
    lines.push("");
  }

  return lines.join("\n");
}

export async function writeFinalSummary(path: string, metadata: FinalSummaryMetadata): Promise<FinalSummaryMetadata> {
  await writeText(path, renderFinalSummary(metadata));
  return metadata;
}

export async function writeEnvironmentSnapshot(
  path: string,
  metadata: EnvironmentSnapshotMetadata,
): Promise<EnvironmentSnapshotMetadata> {
  await writeJson(path, metadata);
  return metadata;
}

function buildFinalSummaryRunRecord(execution: AdapterExecutionResult): FinalSummaryRunRecord {
  const runRoot = `artifacts/runs/${execution.runResult.run_id}`;
  return {
    run_id: execution.runResult.run_id,
    run_role: execution.runResult.run_role,
    run_exit_status: execution.runResult.status,
    started_at: execution.runResult.started_at,
    ended_at: execution.runResult.ended_at,
    duration_s: execution.runResult.duration_s,
    handoff_path: `${runRoot}/reports/handoff.en.md`,
    report_paths: execution.workerOutput.report_paths.map((path) => `${runRoot}/${path}`),
    log_paths: [`${runRoot}/logs/command-log.txt`, `${runRoot}/logs/worker.log`],
    timing_path: `${runRoot}/metadata/timings.json`,
  };
}

export function buildFinalSummaryMetadata(
  layout: JobRootLayout,
  taskPacket: TaskPacket,
  manifest: JobManifest,
  executions: AdapterExecutionResult[],
  completedAt: string,
): FinalSummaryMetadata {
  const latestRun = manifest.runs[manifest.runs.length - 1];
  return {
    job_id: manifest.job_id,
    completed_at: completedAt,
    final_job_state: "COMPLETED",
    freeze_version: manifest.current_freeze_version,
    story_id: taskPacket.story.story_id,
    acceptance_ids: taskPacket.story.acceptance_ids,
    final_summary_path: layout.relativeToJobRoot(layout.finalSummaryPath),
    environment_path: layout.relativeToJobRoot(layout.environmentPath),
    checksum_file: manifest.checksum_file,
    latest_handoff_path: latestRun?.handoff_path ?? "n/a",
    runs: executions.map(buildFinalSummaryRunRecord),
  };
}

export function buildEnvironmentSnapshotMetadata(
  layout: JobRootLayout,
  manifest: JobManifest,
): EnvironmentSnapshotMetadata {
  return {
    job_id: manifest.job_id,
    freeze_version: manifest.current_freeze_version,
    captured_at: new Date().toISOString(),
    base_branch: manifest.base_branch,
    base_commit: manifest.base_commit,
    approved_adapter_set: manifest.approved_adapter_set,
    archive_roots: {
      artifact_root: manifest.artifact_root,
      state_root: manifest.state_root,
      approvals_root: manifest.approvals_root,
      runtime_home_root: layout.relativeToJobRoot(layout.runtimeHomeRoot),
    },
    host: {
      platform: platform(),
      release: release(),
      arch: arch(),
      hostname: hostname(),
    },
    runtime: {
      bun_version: Bun.version,
      node_version: process.version,
    },
  };
}

export interface ArchiveFinalizationInput {
  layout: JobRootLayout;
  manifest: JobManifest;
  finalSummary: FinalSummaryMetadata;
  environment: EnvironmentSnapshotMetadata;
}

export interface ArchiveFinalizationResult {
  manifest: JobManifest;
  final_summary_path: string;
  environment_path: string;
}

export async function finalizeArchive(input: ArchiveFinalizationInput): Promise<ArchiveFinalizationResult> {
  await writeEnvironmentSnapshot(input.layout.environmentPath, input.environment);
  await writeFinalSummary(input.layout.finalSummaryPath, input.finalSummary);

  const finalSummaryPath = input.layout.relativeToJobRoot(input.layout.finalSummaryPath);
  const environmentPath = input.layout.relativeToJobRoot(input.layout.environmentPath);

  return {
    final_summary_path: finalSummaryPath,
    environment_path: environmentPath,
    manifest: {
      ...input.manifest,
      status: "COMPLETED",
      updated_at: input.finalSummary.completed_at,
      stories: input.manifest.stories.map((story) => ({
        ...story,
        queue_state: "COMPLETED",
        last_updated_at: input.finalSummary.completed_at,
      })),
      artifacts: {
        ...input.manifest.artifacts,
        shared_metadata_refs: uniqueStrings([...input.manifest.artifacts.shared_metadata_refs, environmentPath]),
        latest_final_summary: finalSummaryPath,
      },
    },
  };
}
