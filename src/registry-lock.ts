import { createHash } from "node:crypto";
import type { Candidate, PermissionId, RiskLevel, TrustLevel, UpdateChannel } from "./types.js";

export interface CapabilityResolution {
  revision: string;
  contentSha256: string;
}

export interface RegistryLockEntry {
  id: string;
  sourceType: Candidate["source"]["type"];
  sourceLocator: string;
  revision: string;
  contentSha256: string;
  metadataSha256: string;
  permissions: PermissionId[];
  trust: TrustLevel;
  risk: RiskLevel;
  channel: UpdateChannel;
  resolvedAt: string;
}

export interface RegistryLock {
  schemaVersion: 1;
  createdAt: string;
  entries: RegistryLockEntry[];
}

export type UpdateDecision = "automatic" | "approval-required" | "quarantine";

export interface UpdateAssessment {
  decision: UpdateDecision;
  reasons: string[];
}

const FLOATING_REVISIONS = new Set(["main", "master", "head", "latest", "next", "dev", "develop", "trunk"]);
const HIGH_IMPACT: PermissionId[] = ["secrets", "database-write", "deployment", "dns", "git-write"];
const TRUST_RANK: Record<TrustLevel, number> = { community: 0, maintainer: 1, dockyard: 2, official: 3 };
const RISK_RANK: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2 };

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function candidateMetadataSha256(candidate: Candidate): string {
  const relevant = {
    id: candidate.id,
    source: candidate.source,
    permissions: [...candidate.permissions].sort(),
    trust: candidate.trust,
    risk: candidate.risk,
    capabilities: [...candidate.capabilities].sort(),
    hosts: [...candidate.hosts].sort(),
  };
  return createHash("sha256").update(stableJson(relevant)).digest("hex");
}

export function validateResolution(candidate: Candidate, resolution: CapabilityResolution): string[] {
  const errors: string[] = [];
  const revision = resolution.revision.trim();
  if (!revision) errors.push(`${candidate.id}: missing resolved revision`);
  if (candidate.source.revisionStrategy === "pin-on-install" && FLOATING_REVISIONS.has(revision.toLowerCase())) {
    errors.push(`${candidate.id}: floating revision '${revision}' is not allowed`);
  }
  if (!/^[a-f0-9]{64}$/i.test(resolution.contentSha256)) {
    errors.push(`${candidate.id}: contentSha256 must be a 64-character SHA-256 digest`);
  }
  if (candidate.source.revisionStrategy === "live-metadata-only") {
    errors.push(`${candidate.id}: live-metadata-only sources cannot be installed as executable capabilities`);
  }
  return errors;
}

export function createLockEntry(candidate: Candidate, resolution: CapabilityResolution): RegistryLockEntry {
  const errors = validateResolution(candidate, resolution);
  if (errors.length) throw new Error(errors.join("; "));
  return {
    id: candidate.id,
    sourceType: candidate.source.type,
    sourceLocator: candidate.source.locator,
    revision: resolution.revision,
    contentSha256: resolution.contentSha256.toLowerCase(),
    metadataSha256: candidateMetadataSha256(candidate),
    permissions: [...candidate.permissions].sort(),
    trust: candidate.trust,
    risk: candidate.risk,
    channel: candidate.defaultChannel,
    resolvedAt: new Date().toISOString(),
  };
}

export function createRegistryLock(entries: RegistryLockEntry[]): RegistryLock {
  const ids = new Set<string>();
  for (const entry of entries) {
    if (ids.has(entry.id)) throw new Error(`duplicate lock entry: ${entry.id}`);
    ids.add(entry.id);
  }
  return { schemaVersion: 1, createdAt: new Date().toISOString(), entries: [...entries].sort((a, b) => a.id.localeCompare(b.id)) };
}

export function assessUpdate(previous: RegistryLockEntry, candidate: Candidate, resolution: CapabilityResolution): UpdateAssessment {
  const reasons: string[] = [];
  const validationErrors = validateResolution(candidate, resolution);
  if (validationErrors.length) return { decision: "quarantine", reasons: validationErrors };

  if (previous.sourceType !== candidate.source.type || previous.sourceLocator !== candidate.source.locator) {
    reasons.push("upstream source changed");
    return { decision: "quarantine", reasons };
  }

  if (TRUST_RANK[candidate.trust] < TRUST_RANK[previous.trust]) reasons.push(`trust decreased: ${previous.trust} -> ${candidate.trust}`);
  if (RISK_RANK[candidate.risk] > RISK_RANK[previous.risk]) reasons.push(`risk increased: ${previous.risk} -> ${candidate.risk}`);

  const oldPermissions = new Set(previous.permissions);
  const addedPermissions = candidate.permissions.filter((permission) => !oldPermissions.has(permission));
  if (addedPermissions.length) reasons.push(`permissions added: ${addedPermissions.join(", ")}`);
  const highImpactAdded = addedPermissions.filter((permission) => HIGH_IMPACT.includes(permission));
  if (highImpactAdded.length) reasons.push(`high-impact permissions added: ${highImpactAdded.join(", ")}`);

  if (TRUST_RANK[candidate.trust] < TRUST_RANK[previous.trust] || highImpactAdded.length || RISK_RANK[candidate.risk] > RISK_RANK[previous.risk]) {
    return { decision: "approval-required", reasons };
  }

  if (addedPermissions.length) return { decision: "approval-required", reasons };
  if (previous.contentSha256 === resolution.contentSha256.toLowerCase()) reasons.push("content unchanged");
  else reasons.push("content changed with no permission/trust/risk expansion");
  return { decision: "automatic", reasons };
}
