import { join } from "node:path";
import { ensureDir, relativePosix } from "../../core/loop/support.ts";

export interface JobRootLayout {
  repoRoot: string;
  jobId: string;
  jobRoot: string;
  repoArchiveRoot: string;
  archiveStateRoot: string;
  liveStateRoot: string;
  approvalsRoot: string;
  artifactRoot: string;
  runsRoot: string;
  sessionsRoot: string;
  finalRoot: string;
  artifactMetadataRoot: string;
  environmentPath: string;
  finalSummaryPath: string;
  runtimeHomeRoot: string;
  runtimeHomeRootForRole: (runRole: "builder" | "qa") => string;
  planPath: string;
  freezePath: string;
  freezeJsonPath: string;
  freezeChecksumPath: string;
  manifestPath: string;
  checksumsPath: string;
  approvalRoot: (cardId: string) => string;
  runRoot: (runId: string) => string;
  relativeToJobRoot: (target: string) => string;
}

export function resolveJobRootLayout(repoRoot: string, jobId: string): JobRootLayout {
  const jobRoot = join(repoRoot, "jobs", jobId);
  const repoArchiveRoot = join(jobRoot, "repo");
  const archiveStateRoot = join(jobRoot, "state");
  const liveStateRoot = join(repoRoot, "state");
  const approvalsRoot = join(jobRoot, "approvals");
  const artifactRoot = join(jobRoot, "artifacts");
  const runsRoot = join(artifactRoot, "runs");
  const sessionsRoot = join(artifactRoot, "sessions");
  const finalRoot = join(artifactRoot, "final");
  const artifactMetadataRoot = join(artifactRoot, "metadata");
  const runtimeHomeRoot = join(jobRoot, "runtime-home", "phase1-local");
  const runtimeHomeRootForRole = (runRole: "builder" | "qa") => join(runtimeHomeRoot, runRole);

  return {
    repoRoot,
    jobId,
    jobRoot,
    repoArchiveRoot,
    archiveStateRoot,
    liveStateRoot,
    approvalsRoot,
    artifactRoot,
    runsRoot,
    sessionsRoot,
    finalRoot,
    artifactMetadataRoot,
    environmentPath: join(artifactMetadataRoot, "environment.json"),
    finalSummaryPath: join(finalRoot, "final-summary.en.md"),
    runtimeHomeRoot,
    runtimeHomeRootForRole,
    planPath: join(jobRoot, "DEVELOPMENT_PLAN.en.md"),
    freezePath: join(jobRoot, "CONTRACT_FREEZE.en.md"),
    freezeJsonPath: join(jobRoot, "contract-freeze.json"),
    freezeChecksumPath: join(jobRoot, "contract-freeze.sha256"),
    manifestPath: join(jobRoot, "job-manifest.json"),
    checksumsPath: join(jobRoot, "checksums.txt"),
    approvalRoot: (cardId: string) => join(approvalsRoot, cardId),
    runRoot: (runId: string) => join(runsRoot, runId),
    relativeToJobRoot: (target: string) => relativePosix(jobRoot, target),
  };
}

export async function ensureJobRootLayout(layout: JobRootLayout): Promise<void> {
  await ensureDir(layout.jobRoot);
  await ensureDir(layout.repoArchiveRoot);
  await ensureDir(layout.archiveStateRoot);
  await ensureDir(layout.liveStateRoot);
  await ensureDir(layout.approvalsRoot);
  await ensureDir(layout.runsRoot);
  await ensureDir(layout.sessionsRoot);
  await ensureDir(layout.finalRoot);
  await ensureDir(layout.artifactMetadataRoot);
  await ensureDir(layout.runtimeHomeRoot);
  await ensureDir(layout.runtimeHomeRootForRole("builder"));
  await ensureDir(layout.runtimeHomeRootForRole("qa"));
}
