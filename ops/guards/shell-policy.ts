import { basename, join } from "node:path";
import { readJson, toPosixPath } from "../../core/loop/support.ts";
import type { ContainerPathMount, RunExitStatus } from "../../core/contracts/types.ts";

interface AdapterPolicy {
  shell_policy?: {
    blocked_commands?: string[];
    dangerous_patterns?: string[];
    never_auto_approve_patterns?: string[];
    env_allowlist?: string[];
  };
}

const DANGEROUS_DYNAMIC_ENV_NAMES = new Set([
  "BASH_ENV",
  "DYLD_INSERT_LIBRARIES",
  "ENV",
  "GIT_CONFIG_GLOBAL",
  "GIT_CONFIG_SYSTEM",
  "LD_PRELOAD",
  "NODE_OPTIONS",
  "PATH",
  "PROMPT_COMMAND",
  "PYTHONPATH",
]);

export interface ShellPolicyDecision {
  allowed: boolean;
  reason: string | null;
  status: RunExitStatus | null;
}

export interface ShellPolicyInput {
  executable: string;
  command: string[];
  envNames: string[];
  dynamicEnvNames?: string[];
  mounts: ContainerPathMount[];
  runRole: string;
}

function deny(reason: string): ShellPolicyDecision {
  return {
    allowed: false,
    reason,
    status: "FAILED_POLICY",
  };
}

function normalizeCommandValue(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeHostPath(value: string): string {
  return toPosixPath(value).replace(/\/+$/u, "");
}

export class ShellPolicy {
  private policyPromise: Promise<AdapterPolicy> | null = null;

  constructor(private readonly repoRoot: string) {}

  private async loadPolicy(): Promise<AdapterPolicy> {
    if (this.policyPromise === null) {
      this.policyPromise = readJson<AdapterPolicy>(join(this.repoRoot, "adapters", "generic-cli", "adapter-policy.json"));
    }
    return this.policyPromise;
  }

  async evaluate(input: ShellPolicyInput): Promise<ShellPolicyDecision> {
    const policy = await this.loadPolicy();
    const shellPolicy = policy.shell_policy ?? {};
    const executableName = basename(input.executable).toLowerCase();
    const blockedCommands = new Set((shellPolicy.blocked_commands ?? []).map((value) => value.toLowerCase()));
    if (blockedCommands.has(executableName)) {
      return deny(`host shell policy blocked executable: ${executableName}`);
    }

    const envAllowlist = (shellPolicy.env_allowlist ?? []).map((value) => new RegExp(value, "u"));
    const dynamicEnvNames = new Set(input.dynamicEnvNames ?? []);
    for (const envName of input.envNames) {
      const dynamicEnvAllowed =
        dynamicEnvNames.has(envName) &&
        /^[A-Z][A-Z0-9_]*$/u.test(envName) &&
        !DANGEROUS_DYNAMIC_ENV_NAMES.has(envName);
      if (!dynamicEnvAllowed && !envAllowlist.some((pattern) => pattern.test(envName))) {
        return deny(`host shell policy blocked environment variable: ${envName}`);
      }
    }

    const dangerousPatterns = (shellPolicy.dangerous_patterns ?? []).map((value) => new RegExp(value, "iu"));
    const neverAutoApprovePatterns = (shellPolicy.never_auto_approve_patterns ?? []).map((value) => new RegExp(value, "iu"));
    for (const token of input.command) {
      const normalizedToken = normalizeCommandValue(token);
      if (dangerousPatterns.some((pattern) => pattern.test(token)) || neverAutoApprovePatterns.some((pattern) => pattern.test(token))) {
        return deny(`host shell policy blocked command token: ${token}`);
      }
      if (normalizedToken === "--network=host" || normalizedToken === "--privileged") {
        return deny(`host shell policy blocked command token: ${token}`);
      }
    }
    for (let index = 0; index < input.command.length; index += 1) {
      if (normalizeCommandValue(input.command[index]) === "--network") {
        const networkMode = input.command[index + 1]?.trim().toLowerCase() ?? "";
        if (networkMode !== "none") {
          return deny(`host shell policy requires --network none, got ${networkMode || "<missing>"}`);
        }
      }
    }

    const writableMounts = input.mounts.filter((mount) => !mount.read_only);
    const allowedWritableMounts = new Set(["repo", "run-artifacts", "repo-run-artifacts", "runtime-home", "cache"]);
    for (const mount of writableMounts) {
      if (!allowedWritableMounts.has(mount.name)) {
        return deny(`host shell policy blocked writable mount: ${mount.name}`);
      }
      if (mount.name === "repo" && normalizeHostPath(mount.host_path) === normalizeHostPath(this.repoRoot)) {
        return deny("repo mount must use the job-scoped workspace, not the control repo root");
      }
      if (mount.name === "runtime-home" && /\/runtime-home\/phase1-local$/u.test(normalizeHostPath(mount.host_path))) {
        return deny(`runtime home must be role-scoped for ${input.runRole}`);
      }
    }

    return {
      allowed: true,
      reason: null,
      status: null,
    };
  }
}
