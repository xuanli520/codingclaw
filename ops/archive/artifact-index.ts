import { collectRelativeFiles, uniqueStrings } from "../../core/loop/support.ts";
import type { ArtifactIndex, ArtifactIndexEntry, RunRole } from "../../core/contracts/types.ts";

function categoryForPath(path: string): string {
  if (path.startsWith("metadata/")) {
    return "metadata";
  }
  if (path.startsWith("reports/")) {
    return "report";
  }
  if (path.startsWith("logs/")) {
    return "log";
  }
  if (path.startsWith("evidence/")) {
    return "evidence";
  }
  return "other";
}

export async function buildArtifactIndex(
  runRoot: string,
  runId: string,
  runRole: RunRole,
): Promise<ArtifactIndex> {
  const paths = uniqueStrings([...(await collectRelativeFiles(runRoot)), "metadata/artifact-index.json"]);
  const artifacts: ArtifactIndexEntry[] = paths.map((path) => ({
    path,
    category: categoryForPath(path),
  }));
  return {
    run_id: runId,
    run_role: runRole,
    generated_at: new Date().toISOString(),
    artifacts,
  };
}
