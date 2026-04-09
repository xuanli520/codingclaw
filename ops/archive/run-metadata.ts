import { writeJson, writeText } from "../../core/loop/support.ts";
import type { RunRole, RunTimingMetadata } from "../../core/contracts/types.ts";

export interface WorkerLogInput {
  job_id: string;
  run_id: string;
  run_role: RunRole;
  started_at: string;
  ended_at: string;
  exit_code: number;
  stdout: string;
  stderr: string;
}

function renderWorkerLog(input: WorkerLogInput): string {
  return [
    `job_id: ${input.job_id}`,
    `run_id: ${input.run_id}`,
    `run_role: ${input.run_role}`,
    `started_at: ${input.started_at}`,
    `ended_at: ${input.ended_at}`,
    `exit_code: ${input.exit_code}`,
    "",
    "[stdout]",
    input.stdout.trimEnd(),
    "",
    "[stderr]",
    input.stderr.trimEnd(),
    "",
  ].join("\n");
}

export async function writeWorkerLog(path: string, input: WorkerLogInput): Promise<void> {
  await writeText(path, renderWorkerLog(input));
}

export async function writeRunTimings(path: string, metadata: RunTimingMetadata): Promise<RunTimingMetadata> {
  await writeJson(path, metadata);
  return metadata;
}
