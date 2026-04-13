import { join } from "node:path";
import { readJson, uniqueStrings } from "../../core/loop/support.ts";
import type { RunExitStatus } from "../../core/contracts/types.ts";

interface CapabilityEntry {
  mode: string;
  approval_requirement: string;
}

interface CapabilityManifest {
  profile_id: string;
  capabilities: Record<string, CapabilityEntry>;
}

export interface CapabilityGateDecision {
  allowed: boolean;
  reason: string | null;
  status: RunExitStatus | null;
}

function deniedCapabilityStatus(entry: CapabilityEntry): RunExitStatus {
  return entry.approval_requirement !== "none" && entry.approval_requirement !== "not-supported"
    ? "AWAITING_APPROVAL"
    : "FAILED_POLICY";
}

export class CapabilityGate {
  private manifestPromise: Promise<CapabilityManifest> | null = null;

  constructor(private readonly repoRoot: string) {}

  private async loadManifest(): Promise<CapabilityManifest> {
    if (this.manifestPromise === null) {
      this.manifestPromise = readJson<CapabilityManifest>(
        join(this.repoRoot, "adapters", "generic-cli", "adapter-capability.json"),
      );
    }
    return this.manifestPromise;
  }

  async evaluate(requestedCapabilities: string[]): Promise<CapabilityGateDecision> {
    const manifest = await this.loadManifest();
    for (const capability of uniqueStrings(requestedCapabilities)) {
      const entry = manifest.capabilities[capability];
      if (entry === undefined) {
        return {
          allowed: false,
          reason: `requested capability is undeclared for profile ${manifest.profile_id}: ${capability}`,
          status: "FAILED_POLICY",
        };
      }
      if (entry.mode !== "allow") {
        return {
          allowed: false,
          reason: `requested capability is denied for profile ${manifest.profile_id}: ${capability}`,
          status: deniedCapabilityStatus(entry),
        };
      }
      if (entry.approval_requirement !== "none") {
        return {
          allowed: false,
          reason: `requested capability needs explicit approval before launch: ${capability}`,
          status: "AWAITING_APPROVAL",
        };
      }
    }
    return {
      allowed: true,
      reason: null,
      status: null,
    };
  }
}
