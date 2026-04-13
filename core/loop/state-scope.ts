import { dirname, isAbsolute, join, normalize, relative, resolve } from "node:path";
import { pathExists, readJson } from "./support.ts";

const SAFE_SCOPE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const WSL_DRIVE_PATH = /^\/mnt\/([A-Za-z])(\/.*)?$/u;

export interface StateScopeRoots {
  repoRoot: string;
  jobRoot: string;
  rootStateRoot: string;
  liveStateRoot: string;
  sessionsRoot: string;
  currentSessionPath: string;
  runsRoot: string;
}

export interface StateScopeReadOptions {
  sessionId?: string | null;
  includeRoot?: boolean;
}

export interface StateScopeResolver {
  roots: StateScopeRoots;
  resolveRootPath: (relativePath: string) => string;
  resolveLivePath: (relativePath: string) => string;
  resolveSessionPath: (sessionId: string, relativePath?: string) => string;
  resolveRunPath: (runId: string, relativePath?: string) => string;
  resolveReadPaths: (relativePath: string, options?: StateScopeReadOptions) => Promise<string[]>;
}

function normalizeInputPath(path: string): string {
  const trimmed = path.trim();
  const wslMatch = trimmed.match(WSL_DRIVE_PATH);
  if (wslMatch !== null) {
    const drive = wslMatch[1].toUpperCase();
    const suffix = (wslMatch[2] ?? "").replaceAll("/", "\\").replace(/^\\/, "");
    return suffix.length > 0 ? `${drive}:\\${suffix}` : `${drive}:\\`;
  }
  if (/^[A-Za-z]:[\\/]/u.test(trimmed) || trimmed.startsWith("\\\\")) {
    return trimmed.replaceAll("/", "\\");
  }
  return trimmed;
}

function normalizeAbsolutePath(path: string): string {
  const normalizedInput = normalizeInputPath(path);
  const absolutePath = isAbsolute(normalizedInput) ? normalizedInput : resolve(normalizedInput);
  return normalize(absolutePath);
}

function assertWithinRoot(rootPath: string, targetPath: string, label: string): string {
  const normalizedRoot = normalizeAbsolutePath(rootPath);
  const normalizedTarget = normalizeAbsolutePath(targetPath);
  const relativePath = relative(normalizedRoot, normalizedTarget);
  if (relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath))) {
    return normalizedTarget;
  }
  throw new Error(`${label} escaped its allowed root: ${normalizedTarget}`);
}

function normalizeRelativeStatePath(relativePath: string): string {
  const normalized = relativePath.replaceAll("\\", "/").replace(/^\/+/, "");
  if (normalized.length === 0) {
    return "";
  }
  const segments = normalized.split("/").filter((segment) => segment.length > 0);
  if (segments.length === 0) {
    return "";
  }
  for (const segment of segments) {
    if (segment === "." || segment === "..") {
      throw new Error(`state path may not contain traversal segments: ${relativePath}`);
    }
  }
  return join(...segments);
}

export function validateSessionId(sessionId: string): string {
  if (!SAFE_SCOPE_SEGMENT.test(sessionId)) {
    throw new Error(`invalid session_id: ${sessionId}`);
  }
  return sessionId;
}

export function validateRunId(runId: string): string {
  if (!SAFE_SCOPE_SEGMENT.test(runId)) {
    throw new Error(`invalid run_id: ${runId}`);
  }
  return runId;
}

export function resolveStateScopeRoots(
  repoRoot: string,
  archiveStateRoot: string,
  liveStateRoot: string,
): StateScopeRoots {
  const normalizedRepoRoot = normalizeAbsolutePath(repoRoot);
  const normalizedRootStateRoot = assertWithinRoot(normalizedRepoRoot, archiveStateRoot, "root state path");
  const normalizedLiveStateRoot = assertWithinRoot(normalizedRepoRoot, liveStateRoot, "live state path");
  const normalizedJobRoot = assertWithinRoot(normalizedRepoRoot, dirname(normalizedRootStateRoot), "job root");
  const runsRoot = assertWithinRoot(normalizedJobRoot, join(normalizedJobRoot, "artifacts", "runs"), "run scope root");

  return {
    repoRoot: normalizedRepoRoot,
    jobRoot: normalizedJobRoot,
    rootStateRoot: normalizedRootStateRoot,
    liveStateRoot: normalizedLiveStateRoot,
    sessionsRoot: assertWithinRoot(normalizedRootStateRoot, join(normalizedRootStateRoot, "sessions"), "session scope root"),
    currentSessionPath: assertWithinRoot(
      normalizedRootStateRoot,
      join(normalizedRootStateRoot, "current-session.json"),
      "current session pointer",
    ),
    runsRoot,
  };
}

async function readCurrentSessionId(currentSessionPath: string): Promise<string | null> {
  if (!(await pathExists(currentSessionPath))) {
    return null;
  }
  const payload = await readJson<Record<string, unknown>>(currentSessionPath);
  const candidate = payload.session_id;
  if (typeof candidate !== "string" || candidate.length === 0) {
    return null;
  }
  return validateSessionId(candidate);
}

export function createStateScopeResolver(
  repoRoot: string,
  archiveStateRoot: string,
  liveStateRoot: string,
): StateScopeResolver {
  const roots = resolveStateScopeRoots(repoRoot, archiveStateRoot, liveStateRoot);

  const resolveScopedPath = (basePath: string, relativePath: string, label: string): string => {
    const normalizedRelativePath = normalizeRelativeStatePath(relativePath);
    const targetPath = normalizedRelativePath.length > 0 ? join(basePath, normalizedRelativePath) : basePath;
    return assertWithinRoot(basePath, targetPath, label);
  };

  return {
    roots,
    resolveRootPath: (relativePath: string) => resolveScopedPath(roots.rootStateRoot, relativePath, "root scope path"),
    resolveLivePath: (relativePath: string) => resolveScopedPath(roots.liveStateRoot, relativePath, "live scope path"),
    resolveSessionPath: (sessionId: string, relativePath = "") =>
      resolveScopedPath(join(roots.sessionsRoot, validateSessionId(sessionId)), relativePath, "session scope path"),
    resolveRunPath: (runId: string, relativePath = "") =>
      resolveScopedPath(join(roots.runsRoot, validateRunId(runId), "metadata", "state"), relativePath, "run scope path"),
    resolveReadPaths: async (relativePath: string, options: StateScopeReadOptions = {}) => {
      const resolvedPaths: string[] = [];
      const sessionId = options.sessionId ?? (await readCurrentSessionId(roots.currentSessionPath));
      if (sessionId !== null && sessionId !== undefined) {
        resolvedPaths.push(resolveScopedPath(join(roots.sessionsRoot, validateSessionId(sessionId)), relativePath, "session read path"));
      }
      if (options.includeRoot !== false) {
        resolvedPaths.push(resolveScopedPath(roots.rootStateRoot, relativePath, "root read path"));
      }
      return resolvedPaths;
    },
  };
}
