import { join } from "node:path";
import { readJson } from "../../core/loop/support.ts";
import type { RunEnvelope, RunExitStatus, TaskPacket, WorkerOutput } from "../../core/contracts/types.ts";

interface AdapterPolicy {
  credential_injection?: {
    supported_modes?: string[];
    supported_sources?: string[];
    fixture_env_prefix?: string;
    credential_env_prefix?: string;
  };
  log_redaction_rules?: {
    replace_with?: string;
    patterns?: string[];
  };
}

export interface CredentialInjectionResult {
  allowed: boolean;
  status: RunExitStatus | null;
  reason: string | null;
  environment: Record<string, string>;
  redactor: LogRedactor;
}

export class LogRedactor {
  private readonly patterns: RegExp[];
  private readonly replaceWith: string;

  constructor(patterns: RegExp[], replaceWith: string, private readonly secrets: string[]) {
    this.patterns = patterns;
    this.replaceWith = replaceWith;
  }

  redactText(value: string): string {
    let redacted = value;
    for (const pattern of this.patterns) {
      redacted = redacted.replace(pattern, this.replaceWith);
    }
    for (const secret of this.secrets) {
      if (secret.length > 0) {
        redacted = redacted.replaceAll(secret, this.replaceWith);
      }
    }
    return redacted;
  }

  redactCommand(command: string[]): string[] {
    return command.map((value) => this.redactText(value));
  }

  redactWorkerOutput(output: WorkerOutput): WorkerOutput {
    const redactList = (values: string[]) => values.map((value) => this.redactText(value));
    return {
      ...output,
      completed: redactList(output.completed),
      open: redactList(output.open),
      blockers: redactList(output.blockers),
      next_action: this.redactText(output.next_action),
      evidence_paths: redactList(output.evidence_paths),
      report_paths: redactList(output.report_paths),
      test_result_paths: redactList(output.test_result_paths),
      fixback_items: redactList(output.fixback_items),
    };
  }
}

function failure(status: RunExitStatus, reason: string, redactor: LogRedactor): CredentialInjectionResult {
  return {
    allowed: false,
    status,
    reason,
    environment: {},
    redactor,
  };
}

function success(environment: Record<string, string>, redactor: LogRedactor): CredentialInjectionResult {
  return {
    allowed: true,
    status: null,
    reason: null,
    environment,
    redactor,
  };
}

export class CredentialInjector {
  private policyPromise: Promise<AdapterPolicy> | null = null;

  constructor(private readonly repoRoot: string) {}

  private async loadPolicy(): Promise<AdapterPolicy> {
    if (this.policyPromise === null) {
      this.policyPromise = readJson<AdapterPolicy>(join(this.repoRoot, "adapters", "generic-cli", "adapter-policy.json"));
    }
    return this.policyPromise;
  }

  async resolve(taskPacket: TaskPacket, envelope: RunEnvelope): Promise<CredentialInjectionResult> {
    void envelope;
    const policy = await this.loadPolicy();
    const redactionPatterns = (policy.log_redaction_rules?.patterns ?? []).map((value) => new RegExp(value, "giu"));
    const replaceWith = policy.log_redaction_rules?.replace_with ?? "[REDACTED]";
    const injectionRequests = taskPacket.credential_injection_requests ?? [];

    if (injectionRequests.length === 0) {
      return success({}, new LogRedactor(redactionPatterns, replaceWith, []));
    }
    return failure(
      "FAILED_POLICY",
      "host-boundary credential injection is not available for docker worker launches in this adapter profile",
      new LogRedactor(redactionPatterns, replaceWith, []),
    );
  }
}
