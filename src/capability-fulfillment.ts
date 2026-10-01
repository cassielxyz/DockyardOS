import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { activeCommunityPackages } from "./community-runtime.js";
import { loadEffectiveCommunityRegistry } from "./community-effective-registry.js";
import { commandExists } from "./process.js";
import type { Candidate, SelectionResult } from "./types.js";

export type CapabilityFulfillmentStatus =
  | "ready"
  | "installable-unassessed"
  | "missing-runtime"
  | "needs-connection"
  | "discovery-only"
  | "blocked";

export interface CapabilityFulfillmentEntry {
  candidateId: string;
  displayName: string;
  kind: Candidate["kind"];
  status: CapabilityFulfillmentStatus;
  reason: string;
  sourceType: Candidate["source"]["type"];
  sourceLocator: string;
  packageId?: string;
  activeRevision?: string;
  executable?: string;
  automaticAction?: "none" | "assess-install";
}

export interface CapabilityFulfillmentPlan {
  schemaVersion: 1;
  generatedAt: string;
  entries: CapabilityFulfillmentEntry[];
  ready: string[];
  unresolved: string[];
  installable: string[];
  needsConnection: string[];
  discoveryOnly: string[];
  missingRuntime: string[];
  blocked: string[];
  warnings: string[];
}

// Catalogue ids and installable package ids are intentionally separate namespaces.
// Aliases must be explicit so a similarly named remote package can never silently
// become executable just because the selector chose a catalogue candidate.
const COMMUNITY_PACKAGE_ALIASES: Record<string, string> = {
  superpowers: "superpowers-core-skills",
};

const TOOL_EXECUTABLES: Record<string, string[]> = {
  gitleaks: ["gitleaks"],
  "osv-scanner": ["osv-scanner"],
  semgrep: ["semgrep"],
  "strix-cli": ["strix"],
  ruff: ["ruff"],
  biome: ["biome"],
  eslint: ["eslint"],
  knip: ["knip"],
  "dependency-cruiser": ["depcruise"],
  "spectral-openapi": ["spectral"],
  "graphql-inspector": ["graphql-inspector"],
  sqlfluff: ["sqlfluff"],
  terraform: ["terraform"],
  opentofu: ["tofu"],
  kubectl: ["kubectl"],
  helm: ["helm"],
  "docker-cli": ["docker"],
  "typescript-language-service": ["tsc"],
};

function selectedCandidates(selection: SelectionResult): Candidate[] {
  const byId = new Map<string, Candidate>();
  for (const item of [...selection.skills, ...selection.agents, ...selection.tools, ...selection.mcps]) {
    byId.set(item.candidate.id, item.candidate);
  }
  return [...byId.values()];
}

async function localExecutable(root: string, executable: string): Promise<boolean> {
  if (commandExists(executable)) return true;
  const names = process.platform === "win32" ? [`${executable}.cmd`, `${executable}.exe`, executable] : [executable];
  for (const name of names) {
    try {
      await access(resolve(root, "node_modules", ".bin", name));
      return true;
    } catch {}
  }
  return false;
}

function packageIdFor(candidate: Candidate, effectiveIds: Set<string>): string | undefined {
  const explicit = COMMUNITY_PACKAGE_ALIASES[candidate.id];
  if (explicit) return effectiveIds.has(explicit) ? explicit : undefined;
  return effectiveIds.has(candidate.id) ? candidate.id : undefined;
}

function baseEntry(candidate: Candidate): Omit<CapabilityFulfillmentEntry, "status" | "reason"> {
  return {
    candidateId: candidate.id,
    displayName: candidate.displayName,
    kind: candidate.kind,
    sourceType: candidate.source.type,
    sourceLocator: candidate.source.locator,
  };
}

export async function planCapabilityFulfillment(root: string, selection: SelectionResult): Promise<CapabilityFulfillmentPlan> {
  const warnings: string[] = [];
  const registry = await loadEffectiveCommunityRegistry();
  const effectiveIds = new Set(registry.packages.map((item) => item.manifest.id));
  const conflictIds = new Set(registry.conflicts.filter((item) => item.kind === "package").map((item) => item.id));
  let active = [] as Awaited<ReturnType<typeof activeCommunityPackages>>;
  try {
    active = await activeCommunityPackages();
  } catch (error) {
    warnings.push(`Installed community capability integrity/status could not be verified: ${error instanceof Error ? error.message : String(error)}`);
  }
  const activeById = new Map(active.map((item) => [item.id, item]));

  const entries: CapabilityFulfillmentEntry[] = [];
  for (const candidate of selectedCandidates(selection)) {
    const base = baseEntry(candidate);

    if (candidate.source.revisionStrategy === "bundled" || candidate.source.type === "dockyard") {
      entries.push({ ...base, status: "ready", reason: "Capability is bundled with DockyardOS and does not require external materialization.", automaticAction: "none" });
      continue;
    }

    const packageId = packageIdFor(candidate, effectiveIds);
    if (packageId) {
      const activePackage = activeById.get(packageId);
      if (activePackage) {
        entries.push({
          ...base,
          packageId,
          activeRevision: activePackage.revision,
          status: "ready",
          reason: "A verified immutable community-package revision is active and passed runtime integrity verification.",
          automaticAction: "none",
        });
      } else if (conflictIds.has(packageId)) {
        entries.push({ ...base, packageId, status: "blocked", reason: "The installable package id is ambiguous/conflicted in the effective registry and cannot be activated.", automaticAction: "none" });
      } else {
        entries.push({
          ...base,
          packageId,
          status: "installable-unassessed",
          reason: "A collision-safe package manifest exists, but the exact upstream revision still needs quarantine assessment before activation.",
          automaticAction: "assess-install",
        });
      }
      continue;
    }

    if (candidate.kind === "tool") {
      const executables = TOOL_EXECUTABLES[candidate.id];
      if (!executables?.length) {
        entries.push({ ...base, status: "discovery-only", reason: "DockyardOS knows this tool but has no verified executable/install adapter for it yet.", automaticAction: "none" });
        continue;
      }
      let found: string | undefined;
      for (const executable of executables) {
        if (await localExecutable(root, executable)) { found = executable; break; }
      }
      entries.push(found
        ? { ...base, status: "ready", executable: found, reason: `Required executable is available (${found}).`, automaticAction: "none" }
        : { ...base, status: "missing-runtime", executable: executables[0], reason: `Selected tool is not available on PATH or the project's local node_modules/.bin (${executables.join(" or ")}).`, automaticAction: "none" });
      continue;
    }

    if (candidate.kind === "mcp") {
      entries.push({
        ...base,
        status: "needs-connection",
        reason: "MCP selection is metadata until the current host verifies a configured connection; DockyardOS does not assume credentials or connectivity.",
        automaticAction: "none",
      });
      continue;
    }

    entries.push({
      ...base,
      status: "discovery-only",
      reason: candidate.source.revisionStrategy === "pin-on-install"
        ? "The catalogue has a pin-capable upstream source, but no DockyardOS package manifest/entrypoint mapping exists yet; selection must not imply installation."
        : "The catalogue entry is metadata-only and has no executable/installable trust manifest.",
      automaticAction: "none",
    });
  }

  const ids = (status: CapabilityFulfillmentStatus) => entries.filter((item) => item.status === status).map((item) => item.candidateId);
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    entries,
    ready: ids("ready"),
    unresolved: entries.filter((item) => item.status !== "ready").map((item) => item.candidateId),
    installable: ids("installable-unassessed"),
    needsConnection: ids("needs-connection"),
    discoveryOnly: ids("discovery-only"),
    missingRuntime: ids("missing-runtime"),
    blocked: ids("blocked"),
    warnings,
  };
}

export function fulfillmentSummary(plan: CapabilityFulfillmentPlan): Record<string, unknown> {
  return {
    ready: plan.ready,
    installable: plan.installable,
    needsConnection: plan.needsConnection,
    discoveryOnly: plan.discoveryOnly,
    missingRuntime: plan.missingRuntime,
    blocked: plan.blocked,
    warnings: plan.warnings,
    entries: plan.entries.map((entry) => ({
      id: entry.candidateId,
      kind: entry.kind,
      status: entry.status,
      ...(entry.packageId ? { packageId: entry.packageId } : {}),
      ...(entry.activeRevision ? { activeRevision: entry.activeRevision } : {}),
      ...(entry.executable ? { executable: entry.executable } : {}),
      reason: entry.reason,
    })),
  };
}
