import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ChecksumRecord } from "../../core/contracts/types.ts";
import { readText, writeText } from "../../core/loop/support.ts";

export async function sha256File(path: string): Promise<string> {
  const buffer = await readFile(path);
  return createHash("sha256").update(buffer).digest("hex");
}

function renderChecksumLine(record: ChecksumRecord): string {
  return `${record.hash}  ${record.path}`;
}

function parseChecksumLine(line: string): ChecksumRecord | null {
  const match = line.match(/^([a-f0-9]{64})\s{2}(.+)$/);
  if (!match) {
    return null;
  }
  return {
    algorithm: "sha256",
    hash: match[1],
    path: match[2],
  };
}

interface LoadChecksumFileResult {
  records: ChecksumRecord[];
  format_errors: string[];
}

export interface ChecksumVerificationResult {
  ok: boolean;
  invalid_paths: string[];
  format_errors: string[];
}

export async function writeChecksumFile(path: string, records: ChecksumRecord[]): Promise<void> {
  const lines = records
    .slice()
    .sort((left, right) => left.path.localeCompare(right.path))
    .map(renderChecksumLine);
  await writeText(path, `${lines.join("\n")}\n`);
}

async function parseChecksumFile(path: string): Promise<LoadChecksumFileResult> {
  const text = await readText(path);
  const records: ChecksumRecord[] = [];
  const formatErrors: string[] = [];
  const lines = text.split(/\r?\n/);
  for (const [index, rawLine] of lines.entries()) {
    const line = rawLine.trim();
    if (line.length === 0) {
      continue;
    }
    const record = parseChecksumLine(line);
    if (record === null) {
      formatErrors.push(`line ${index + 1}: ${line}`);
      continue;
    }
    records.push(record);
  }
  if (records.length === 0) {
    formatErrors.push("checksum file does not contain any valid records");
  }
  return {
    records,
    format_errors: formatErrors,
  };
}

export async function loadChecksumFile(path: string): Promise<ChecksumRecord[]> {
  const parsed = await parseChecksumFile(path);
  if (parsed.format_errors.length > 0) {
    throw new Error(parsed.format_errors.join("; "));
  }
  return parsed.records;
}

export async function verifyChecksumRecords(
  root: string,
  records: ChecksumRecord[],
): Promise<{ ok: boolean; invalid_paths: string[] }> {
  const invalidPaths: string[] = [];
  for (const record of records) {
    try {
      const actualHash = await sha256File(join(root, record.path));
      if (actualHash !== record.hash) {
        invalidPaths.push(record.path);
      }
    } catch {
      invalidPaths.push(record.path);
    }
  }
  return {
    ok: invalidPaths.length === 0,
    invalid_paths: invalidPaths,
  };
}

export async function verifyChecksumFile(
  root: string,
  path: string,
): Promise<ChecksumVerificationResult> {
  const parsed = await parseChecksumFile(path);
  const verification = await verifyChecksumRecords(root, parsed.records);
  return {
    ok: parsed.format_errors.length === 0 && verification.ok,
    invalid_paths: verification.invalid_paths,
    format_errors: parsed.format_errors,
  };
}
