import { randomUUID } from "node:crypto";
import { open, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { ensureDir, nowIso } from "./support.ts";

const DEFAULT_LOCK_TIMEOUT_MS = 15_000;
const DEFAULT_LOCK_POLL_MS = 50;
const DEFAULT_LOCK_STALE_MS = 30_000;
const LOCK_FILE_NAME = ".state-write.lock";
const TRANSACTION_FILE_NAME = ".state-write.txn.json";

export interface StateWriteLockOptions {
  lockName?: string;
  owner?: string;
  pollMs?: number;
  staleMs?: number;
  timeoutMs?: number;
}

export interface AtomicWriteEntry {
  path: string;
  content: string;
}

interface PendingBatchEntry {
  path: string;
  temp_path: string;
}

interface PendingBatchRecord {
  created_at: string;
  entries: PendingBatchEntry[];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
}

async function isStaleLock(lockPath: string, staleMs: number): Promise<boolean> {
  try {
    const metadata = await stat(lockPath);
    return Date.now() - metadata.mtimeMs >= staleMs;
  } catch {
    return false;
  }
}

async function acquireWriteLock(lockRoot: string, options: StateWriteLockOptions): Promise<() => Promise<void>> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS;
  const pollMs = options.pollMs ?? DEFAULT_LOCK_POLL_MS;
  const staleMs = options.staleMs ?? DEFAULT_LOCK_STALE_MS;
  const lockName = options.lockName ?? LOCK_FILE_NAME;
  const lockPath = join(lockRoot, lockName);
  const deadline = Date.now() + timeoutMs;

  await ensureDir(lockRoot);

  while (true) {
    try {
      const handle = await open(lockPath, "wx");
      try {
        await handle.writeFile(
          `${JSON.stringify({ pid: process.pid, owner: options.owner ?? "state-store", acquired_at: nowIso() }, null, 2)}\n`,
          "utf8",
        );
        await handle.sync();
      } finally {
        await handle.close();
      }
      return async () => {
        await rm(lockPath, { force: true });
      };
    } catch (error) {
      const code = error instanceof Error && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
      if (code !== "EEXIST") {
        throw error;
      }
      if (await isStaleLock(lockPath, staleMs)) {
        await rm(lockPath, { force: true });
        continue;
      }
      if (Date.now() >= deadline) {
        throw new Error(`timed out acquiring state write lock: ${lockPath}`);
      }
      await delay(pollMs);
    }
  }
}

export async function withWriteLock<T>(
  lockRoot: string,
  callback: () => Promise<T>,
  options: StateWriteLockOptions = {},
): Promise<T> {
  const release = await acquireWriteLock(lockRoot, options);
  try {
    return await callback();
  } finally {
    await release();
  }
}

export async function atomicWriteText(path: string, value: string): Promise<void> {
  await ensureDir(dirname(path));
  const tempPath = join(dirname(path), `.${basename(path)}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`);
  let handle: Awaited<ReturnType<typeof open>> | null = null;
  try {
    handle = await open(tempPath, "w");
    await handle.writeFile(value, "utf8");
    await handle.sync();
    await handle.close();
    handle = null;
    await rename(tempPath, path);
  } catch (error) {
    if (handle !== null) {
      await handle.close().catch(() => undefined);
    }
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function atomicWriteJson(path: string, value: unknown): Promise<void> {
  await atomicWriteText(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function finalizePendingBatch(entries: PendingBatchEntry[]): Promise<void> {
  for (const entry of entries) {
    try {
      await rename(entry.temp_path, entry.path);
    } catch (error) {
      const code = error instanceof Error && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
      if (code === "ENOENT") {
        continue;
      }
      throw error;
    }
  }
}

async function readPendingBatch(transactionPath: string): Promise<PendingBatchRecord | null> {
  try {
    return JSON.parse(await Bun.file(transactionPath).text()) as PendingBatchRecord;
  } catch {
    return null;
  }
}

export async function recoverPendingBatch(lockRoot: string): Promise<void> {
  const transactionPath = join(lockRoot, TRANSACTION_FILE_NAME);
  const pendingBatch = await readPendingBatch(transactionPath);
  if (pendingBatch === null) {
    return;
  }
  await finalizePendingBatch(pendingBatch.entries);
  await rm(transactionPath, { force: true });
}

export async function atomicWriteBatch(lockRoot: string, entries: AtomicWriteEntry[]): Promise<void> {
  const transactionPath = join(lockRoot, TRANSACTION_FILE_NAME);
  await recoverPendingBatch(lockRoot);

  const pendingBatch: PendingBatchRecord = {
    created_at: nowIso(),
    entries: [],
  };

  for (const entry of entries) {
    const tempPath = join(dirname(entry.path), `.${basename(entry.path)}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`);
    let handle: Awaited<ReturnType<typeof open>> | null = null;
    try {
      await ensureDir(dirname(entry.path));
      handle = await open(tempPath, "w");
      await handle.writeFile(entry.content, "utf8");
      await handle.sync();
      await handle.close();
      handle = null;
      pendingBatch.entries.push({
        path: entry.path,
        temp_path: tempPath,
      });
    } catch (error) {
      if (handle !== null) {
        await handle.close().catch(() => undefined);
      }
      await rm(tempPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  await atomicWriteJson(transactionPath, pendingBatch);

  try {
    await finalizePendingBatch(pendingBatch.entries);
    await rm(transactionPath, { force: true });
  } catch (error) {
    throw error;
  }
}
