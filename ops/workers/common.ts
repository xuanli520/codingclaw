import { ensureDir, readJson } from "../../core/loop/support.ts";
import type { RunEnvelope, TaskPacket, WorkerOutput } from "../../core/contracts/types.ts";

export interface WorkerContext {
  envelope: RunEnvelope;
  taskPacket: TaskPacket;
  runRoot: string;
}

export async function loadWorkerContext(): Promise<WorkerContext> {
  const envelopePath = process.argv[2];
  if (!envelopePath) {
    throw new Error("missing envelope path");
  }
  const envelope = await readJson<RunEnvelope>(envelopePath);
  const taskPacket = await readJson<TaskPacket>(envelope.task_packet_path);
  await ensureDir(`${envelope.artifact_path}/reports`);
  await ensureDir(`${envelope.artifact_path}/logs`);
  await ensureDir(`${envelope.artifact_path}/metadata`);
  await ensureDir(`${envelope.artifact_path}/evidence/test-results`);
  return {
    envelope,
    taskPacket,
    runRoot: envelope.artifact_path,
  };
}

export function emitWorkerOutput(output: WorkerOutput): void {
  process.stdout.write(JSON.stringify(output));
}
