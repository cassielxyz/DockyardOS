import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { activeCommunityPackages } from "./community-runtime.js";
import { loadEffectiveCommunityRegistry } from "./community-effective-registry.js";
import type { CommunityRuntimeConnectionRequirement, CommunityRuntimeRequirements } from "./community-types.js";
import { writeJsonAtomic } from "./fs-utils.js";
import { commandExists } from "./process.js";
import { probeProvider } from "./provider-detection.js";
import { providerAdapter } from "./provider-adapters.js";
import { projectDirectory, projectIdForRoot } from "./project.js";
import { getCandidate } from "./registry.js";
import type { Candidate, SelectionResult } from "./types.js";

export type CapabilityFulfillmentStatus =
  | "ready"
  | "installable-unassessed"
  | "missing-runtime"
  | "needs-connection"
  | "discovery-only"
  | "blocked";

export interface RuntimeConnectionEvidence {
  kind: CommunityRuntimeConnectionRequirement["kind"];
  id: string;
  required: boolean;
  ready: boolean;
  minimumReadiness?: "configured" | "authenticated" | "linked";
  detail: string;
}

export interface RuntimePrerequisiteEvaluation {
  missingExecutables: string[];
  connections: RuntimeConnectionEvidence[];
  unresolvedRequiredConnections: RuntimeConnectionEvidence[];
  unresolvedOptionalConnections: RuntimeConnectionEvidence[];
}

export interface RuntimePrerequisiteDependencies {
  connectionProbe?: (
    root: string,
    requirement: CommunityRuntimeConnectionRequirement,
  ) => Promise<RuntimeConnectionEvidence>;
}

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
  connections?: RuntimeConnectionEvidence[];
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
  ffmpeg: ["ffmpeg"],
};

function selectionCandidates(selection: SelectionResult): Candidate[] {
  const byId = new Map<string, Candidate>();
  for (const item of [...selection.skills, ...selection.agents, ...selection.tools, ...selection.mcps]) byId.set(item.candidate.id, item.candidate);
  return [...byId.values()];
}

function candidatesForIds(candidateIds: string[]): { candidates: Candidate[]; unknown: string[] } {
  const candidates: Candidate[] = [];
  const unknown: string[] = [];
  const seen = new Set<string>();
  for (const id of candidateIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    const candidate = getCandidate(id);
    if (candidate) candidates.push(candidate);
    else unknown.push(id);
  }
  return { candidates, unknown };
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

async function defaultConnectionProbe(
  root: string,
  requirement: CommunityRuntimeConnectionRequirement,
): Promise<RuntimeConnectionEvidence> {
  if (requirement.kind === "mcp") {
    return {
      kind: "mcp",
      id: requirement.id,
      required: requirement.required,
      ready: false,
      detail: "MCP connectivity must be verified by the active host/connector; package installation alone never proves an MCP connection or credentials.",
    };
  }

  const adapter = providerAdapter(requirement.id);
  if (!adapter) {
    return {
      kind: "provider",
      id: requirement.id,
      required: requirement.required,
      minimumReadiness: requirement.minimumReadiness,
      ready: false,
      detail: `DockyardOS has no verified provider readiness adapter for ${requirement.id}.`,
    };
  }

  // Optional provider metadata must not introduce account/network latency into normal
  // request mediation. Only a required authenticated/linked prerequisite is live-probed.
  const live = requirement.required
    && (requirement.minimumReadiness === "authenticated" || requirement.minimumReadiness === "linked");
  const probe = await probeProvider(adapter, root, { live });
  let ready = false;
  if (requirement.minimumReadiness === "configured") {
    ready = probe.configured;
  } else if (requirement.minimumReadiness === "authenticated") {
    ready = probe.authenticated === true;
  } else {
    // A project link marker/status alone is not enough when the provider exposes an auth probe.
    ready = probe.linked === true && (!adapter.authProbe || probe.authenticated === true);
  }

  return {
    kind: "provider",
    id: requirement.id,
    required: requirement.required,
    minimumReadiness: requirement.minimumReadiness,
    ready,
    detail: ready
      ? `${adapter.displayName} satisfies required ${requirement.minimumReadiness} readiness (${probe.safeSummary ?? probe.readiness}).`
      : requirement.required
        ? `${adapter.displayName} does not currently satisfy ${requirement.minimumReadiness} readiness (${probe.safeSummary ?? probe.readiness}).`
        : `${adapter.displayName} optional ${requirement.minimumReadiness} readiness was not assumed; local detection only (${probe.safeSummary ?? probe.readiness}).`,
  };
}

export async function evaluateCommunityRuntimeRequirements(
  root: string,
  requirements?: CommunityRuntimeRequirements,
  options: RuntimePrerequisiteDependencies = {},
): Promise<RuntimePrerequisiteEvaluation> {
  const missingExecutables: string[] = [];
  for (const executable of requirements?.executables ?? []) {
    if (!await localExecutable(root, executable)) missingExecutables.push(executable);
  }

  const connectionProbe = options.connectionProbe ?? defaultConnectionProbe;
  const connections: RuntimeConnectionEvidence[] = [];
  for (const requirement of requirements?.connections ?? []) {
    const evidence = await connectionProbe(root, requirement);
    if (evidence.kind !== requirement.kind || evidence.id !== requirement.id || evidence.required !== requirement.required) {
      throw new Error(`Runtime connection probe returned mismatched evidence for ${requirement.kind}:${requirement.id}.`);
    }
    connections.push(evidence);
  }

  return {
    missingExecutables,
    connections,
    unresolvedRequiredConnections: connections.filter((item) => item.required && !item.ready),
    unresolvedOptionalConnections: connections.filter((item) => !item.required && !item.ready),
  };
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

async function planForCandidates(root: string, candidates: Candidate[], warnings: string[] = []): Promise<CapabilityFulfillmentPlan> {
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
  for (const candidate of candidates) {
    const base = baseEntry(candidate);

    if (candidate.source.revisionStrategy === "bundled" || candidate.source.type === "dockyard") {
      entries.push({ ...base, status: "ready", reason: "Capability is bundled with DockyardOS and does not require external materialization.", automaticAction: "none" });
      continue;
    }

    const packageId = packageIdFor(candidate, effectiveIds);
    if (packageId) {
      const activePackage = activeById.get(packageId);
      if (activePackage) {
        // Runtime requirements come from the immutable manifest snapshot that belongs to
        // the active revision, not from mutable/current registry metadata.
        const runtime = await evaluateCommunityRuntimeRequirements(root, activePackage.runtimeRequirements);
        if (runtime.missingExecutables.length) {
          entries.push({
            ...base,
            packageId,
            activeRevision: activePackage.revision,
            executable: runtime.missingExecutables[0],
            ...(runtime.connections.length ? { connections: runtime.connections } : {}),
            status: "missing-runtime",
            reason: `The package revision is installed and integrity-verified, but required runtime executable(s) are unavailable: ${runtime.missingExecutables.join(", ")}.`,
            automaticAction: "none",
          });
        } else if (runtime.unresolvedRequiredConnections.length) {
          const unresolved = runtime.unresolvedRequiredConnections.map((item) => `${item.kind}:${item.id}`).join(", ");
          entries.push({
            ...base,
            packageId,
            activeRevision: activePackage.revision,
            connections: runtime.connections,
            status: "needs-connection",
            reason: `The package revision and local runtime are verified, but required external connection(s) are not verified ready: ${unresolved}.`,
            automaticAction: "none",
          });
        } else {
          const optional = runtime.unresolvedOptionalConnections.map((item) => `${item.kind}:${item.id}`);
          entries.push({
            ...base,
            packageId,
            activeRevision: activePackage.revision,
            ...(runtime.connections.length ? { connections: runtime.connections } : {}),
            status: "ready",
            reason: optional.length
              ? `The immutable package revision and all required runtime prerequisites are verified. Optional connection(s) remain unverified and are not assumed: ${optional.join(", ")}.`
              : "The immutable package revision and all declared required runtime executables/connections are verified ready.",
            automaticAction: "none",
          });
        }
      } else if (conflictIds.has(packageId)) {
        entries.push({ ...base, packageId, status: "blocked", reason: "The installable package id is ambiguous/conflicted in the effective registry and cannot be activated.", automaticAction: "none" });
      } else {
        entries.push({
          ...base,
          packageId,
          status: "installable-unassessed",
          reason: "A collision-safe package manifest exists, but the exact upstream revision still needs quarantine assessment before activation. Runtime executables and connections are rechecked after activation.",
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

export async function planCapabilityFulfillment(root: string, selection: SelectionResult): Promise<CapabilityFulfillmentPlan> {
  return planForCandidates(root, selectionCandidates(selection));
}

export async function planCapabilityFulfillmentForIds(root: string, candidateIds: string[]): Promise<CapabilityFulfillmentPlan> {
  const { candidates, unknown } = candidatesForIds(candidateIds);
  const warnings = unknown.map((id) => `Selected capability is missing from the current DockyardOS registry: ${id}`);
  return planForCandidates(root, candidates, warnings);
}

export async function persistCapabilityFulfillment(root: string, plan: CapabilityFulfillmentPlan, requestHash?: string): Promise<string> {
  const directory = resolve(projectDirectory(projectIdForRoot(root)), "capability-fulfillment");
  const path = resolve(directory, requestHash && /^[a-f0-9]{64}$/i.test(requestHash) ? `${requestHash.toLowerCase()}.json` : "latest.json");
  await writeJsonAtomic(path, { ...plan, ...(requestHash ? { requestHash } : {}) });
  await writeJsonAtomic(resolve(directory, "latest.json"), { ...plan, ...(requestHash ? { requestHash } : {}) });
  return path;
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
      ...(entry.connections?.length ? { connections: entry.connections } : {}),
      reason: entry.reason,
    })),
  };
}
