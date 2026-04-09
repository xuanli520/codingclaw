import type { JobManifest } from "../../core/contracts/types.ts";
import { writeJson } from "../../core/loop/support.ts";

export async function writeJobManifest(path: string, manifest: JobManifest): Promise<JobManifest> {
  await writeJson(path, manifest);
  return manifest;
}
