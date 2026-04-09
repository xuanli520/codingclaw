import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, relative } from "node:path";
import type { RunRole } from "../contracts/types.ts";

export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

export async function writeText(path: string, value: string): Promise<void> {
  await ensureDir(dirname(path));
  await writeFile(path, value, "utf8");
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  await writeText(path, `${JSON.stringify(value, null, 2)}\n`);
}

export async function readText(path: string): Promise<string> {
  return readFile(path, "utf8");
}

export async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readText(path)) as T;
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export function toPosixPath(value: string): string {
  return value.replaceAll("\\", "/");
}

export function relativePosix(root: string, target: string): string {
  return toPosixPath(relative(root, target));
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function createRunId(runRole: RunRole): string {
  return `run-${runRole}-${Date.now()}`;
}

export function detectBaseCommit(repoRoot: string): string {
  const result = Bun.spawnSync({
    cmd: ["git", "rev-parse", "HEAD"],
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode !== 0) {
    return "UNKNOWN";
  }
  return new TextDecoder().decode(result.stdout).trim() || "UNKNOWN";
}

export function detectBaseBranch(repoRoot: string): string {
  const result = Bun.spawnSync({
    cmd: ["git", "rev-parse", "--abbrev-ref", "HEAD"],
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode !== 0) {
    return "UNKNOWN";
  }
  return new TextDecoder().decode(result.stdout).trim() || "UNKNOWN";
}

export async function materializeJsonTemplate<T>(
  templatePath: string,
  replacements: Record<string, unknown>,
): Promise<T> {
  let text = await readText(templatePath);
  for (const [token, value] of Object.entries(replacements)) {
    text = text.replaceAll(`"${token}"`, JSON.stringify(value));
  }
  return JSON.parse(text) as T;
}

export async function collectRelativeFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const absolutePath = `${root}/${entry.name}`;
    if (entry.isDirectory()) {
      const nested = await collectRelativeFiles(absolutePath);
      for (const child of nested) {
        files.push(`${entry.name}/${child}`);
      }
      continue;
    }
    files.push(entry.name);
  }
  return files.map((value) => toPosixPath(value)).sort();
}

export function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}
