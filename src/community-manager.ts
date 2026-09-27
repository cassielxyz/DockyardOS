import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import type {
  CommunityAssessment,
  CommunityPackageManifest,
  CommunityResolution,
  CommunityScanReport,
  InstalledCommunityPackage,
} from "./community-types.js";
import { resolveAndQuarantine } from "./community-fetch.js";
import { findCommunityPackage, loadCommunityRegistry } from "./community-registry.js";
import { verifyCommunitySignature } from "./community-signature.js";
import { appendTransparencyRecord } from "./community-transparency.js";
import { readJson, writeJsonAtomic } from "./fs-utils.js";
import { dockyardHome } from "./project.js";
import type { PermissionId } from "./types.js";

interface CommunityState {
  schemaVersion: 1;
  packages: Record<string, {
    activeRevision?: string;
    versions: InstalledCommunityPackage[];
  }>;
}

const HIGH_IMPACT = new Set<PermissionId>(["shell", "network", "browser", "git-write", "secrets", "database-write", "deployment", "dns"]);
const SEVERITY_RANK = { info: 0, low: 1, medium: 2, high: 3, critical: 4 } as const;
const TRUST_RANK = { community: 0, maintainer: 1, dockyard: 2, official: 3 } as const;
const RISK_RANK = { low: 0, medium: 1, high: 2 } as const;

function statePath(): string {
  return resolve(dockyardHome(), "community", "state.json");
}

function packagesRoot(): string {
  return resolve(dockyardHome(), "community", "packages");
}

async function loadState(): Promise<CommunityState> {
  return (await readJson<CommunityState>(statePath())) ?? { schemaVersion: 1, packages: {} };
}

async function saveState(state: CommunityState): Promise<void> {
  await writeJsonAtomic(statePath(), state);
}

function uniquePermissions(values: PermissionId[]): PermissionId[] {
  return [...new Set(values)].sort();
}

function packageRoot(pkg: CommunityPackageManifest, resolution: CommunityResolution): string {
  return resolve(resolution.quarantinePath, pkg.source.subdirectory ?? ".");
}

function maxFindingSeverity(scan: CommunityScanReport): keyof typeof SEVERITY_RANK {
  return scan.findings.reduce<keyof typeof SEVERITY_RANK>((max, finding) =>
    SEVERITY_RANK[finding.severity] > SEVERITY_RANK[max] ? finding.severity : max, "info");
}

export async function assessCommunityPackage(
  pkg: CommunityPackageManifest,
  resolution: CommunityResolution,
  scan: CommunityScanReport,
  previous?: InstalledCommunityPackage,
): Promise<CommunityAssessment> {
  const signature = await verifyCommunitySignature(pkg);
  const declared = uniquePermissions(pkg.permissions);
  const inferred = uniquePermissions(scan.inferredPermissions);
  const permissionExpansion = inferred.filter((permission) => !declared.includes(permission));
  const reasons: string[] = [];
  let decision: CommunityAssessment["decision"] = "automatic";

  if (scan.canary.status === "fail") {
    decision = "quarantine";
    reasons.push("static canary failed");
  }
  if (scan.entrypointsMissing.length) {
    decision = "quarantine";
    reasons.push(`declared entrypoints missing: ${scan.entrypointsMissing.join(", ")}`);
  }
  if (permissionExpansion.length) {
    decision = "quarantine";
    reasons.push(`inferred permissions exceed manifest: ${permissionExpansion.join(", ")}`);
  }
  if (signature.required && !signature.verified) {
    decision = "quarantine";
    reasons.push(signature.reason);
  }

  const severity = maxFindingSeverity(scan);
  if (SEVERITY_RANK[severity] >= SEVERITY_RANK.critical) {
    decision = "quarantine";
    reasons.push(`critical quarantine finding present (${severity})`);
  } else if (decision !== "quarantine" && SEVERITY_RANK[severity] >= SEVERITY_RANK.high) {
    decision = "approval-required";
    reasons.push(`high-severity static finding requires review (${severity})`);
  }

  const highImpact = declared.filter((permission) => HIGH_IMPACT.has(permission));
  if (decision === "automatic" && highImpact.length) {
    decision = "approval-required";
    reasons.push(`high-impact permissions declared: ${highImpact.join(", ")}`);
  }
  if (decision === "automatic" && pkg.risk === "high") {
    decision = "approval-required";
    reasons.push("package risk is high");
  }
  if (decision === "automatic" && pkg.trust === "community") {
    decision = signature.verified ? "approval-required" : "quarantine";
    reasons.push(signature.verified ? "community package requires explicit first-install approval" : "community package is not signature-verified");
  }
  if (decision === "automatic" && pkg.trust === "maintainer" && pkg.risk !== "low") {
    decision = "approval-required";
    reasons.push("maintainer package with non-low risk requires first-install approval");
  }
  if (decision === "automatic" && scan.canary.status === "warn") {
    decision = "approval-required";
    reasons.push("static canary produced warnings");
  }

  if (previous) {
    const previousPermissions = new Set(previous.permissions);
    const newlyDeclared = declared.filter((permission) => !previousPermissions.has(permission));
    if (newlyDeclared.length && decision !== "quarantine") {
      decision = "approval-required";
      reasons.push(`update adds declared permissions: ${newlyDeclared.join(", ")}`);
    }
    const newlyHighImpact = newlyDeclared.filter((permission) => HIGH_IMPACT.has(permission));
    if (newlyHighImpact.length) reasons.push(`update adds high-impact permissions: ${newlyHighImpact.join(", ")}`);
    if (TRUST_RANK[pkg.trust] < TRUST_RANK[previous.trust] && decision !== "quarantine") {
      decision = "approval-required";
      reasons.push(`update trust decreased: ${previous.trust} -> ${pkg.trust}`);
    }
    if (RISK_RANK[pkg.risk] > RISK_RANK[previous.risk] && decision !== "quarantine") {
      decision = "approval-required";
      reasons.push(`update risk increased: ${previous.risk} -> ${pkg.risk}`);
    }
    if (previous.contentSha256 === resolution.contentSha256 && !reasons.length) reasons.push("resolved content is unchanged from the active installation");
  }

  if (!reasons.length) reasons.push("manifest, signature policy, permission boundary, entrypoints, and static canary permit automatic installation");

  await appendTransparencyRecord({
    action: decision === "quarantine" ? "quarantine" : "resolve",
    packageId: pkg.id,
    revision: resolution.revision,
    contentSha256: resolution.contentSha256,
    detail: `${decision}: ${reasons.join("; ")}`,
  });

  return {
    packageId: pkg.id,
    decision,
    reasons,
    signature: {
      required: signature.required,
      present: signature.present,
      verified: signature.verified,
      ...(signature.keyId ? { keyId: signature.keyId } : {}),
    },
    declaredPermissions: declared,
    inferredPermissions: inferred,
    permissionExpansion,
    scan,
  };
}

export async function resolveAssessCommunityPackage(id: string): Promise<{
  manifest: CommunityPackageManifest;
  resolution: CommunityResolution;
  assessment: CommunityAssessment;
}> {
  const registry = await loadCommunityRegistry();
  const manifest = findCommunityPackage(registry, id);
  if (!manifest) throw new Error(`Community package is not installable in the bundled registry: ${id}`);
  const { resolution, scan } = await resolveAndQuarantine(manifest);
  const state = await loadState();
  const activeRevision = state.packages[id]?.activeRevision;
  const previous = activeRevision ? state.packages[id]?.versions.find((version) => version.revision === activeRevision) : undefined;
  const assessment = await assessCommunityPackage(manifest, resolution, scan, previous);
  return { manifest, resolution, assessment };
}

export async function installResolvedCommunityPackage(
  manifest: CommunityPackageManifest,
  resolution: CommunityResolution,
  assessment: CommunityAssessment,
  options: { approve?: boolean } = {},
): Promise<InstalledCommunityPackage> {
  if (assessment.decision === "quarantine") throw new Error(`Package ${manifest.id} remains quarantined: ${assessment.reasons.join("; ")}`);
  if (assessment.decision === "approval-required" && !options.approve) throw new Error(`Package ${manifest.id} requires explicit approval before installation: ${assessment.reasons.join("; ")}`);

  const destination = resolve(packagesRoot(), manifest.id, resolution.revision);
  await mkdir(resolve(packagesRoot(), manifest.id), { recursive: true });
  await rm(destination, { recursive: true, force: true });
  await cp(packageRoot(manifest, resolution), destination, { recursive: true, force: false, errorOnExist: true, verbatimSymlinks: false });
  await rm(resolve(destination, ".git"), { recursive: true, force: true });

  const installed: InstalledCommunityPackage = {
    schemaVersion: 1,
    packageId: manifest.id,
    displayName: manifest.displayName,
    version: manifest.version,
    revision: resolution.revision,
    contentSha256: resolution.contentSha256,
    installedAt: new Date().toISOString(),
    source: manifest.source,
    permissions: assessment.declaredPermissions,
    trust: manifest.trust,
    risk: manifest.risk,
    channel: manifest.channel,
    status: "installed",
    destination,
    signatureVerified: assessment.signature.verified,
  };

  const state = await loadState();
  const current = state.packages[manifest.id] ?? { versions: [] };
  const versions = current.versions.filter((version) => version.revision !== installed.revision);
  versions.push(installed);
  state.packages[manifest.id] = { activeRevision: installed.revision, versions };
  await saveState(state);
  await appendTransparencyRecord({
    action: current.activeRevision ? "update" : "install",
    packageId: manifest.id,
    revision: installed.revision,
    contentSha256: installed.contentSha256,
    detail: `${assessment.decision === "approval-required" ? "approved" : "automatic"} installation activated at ${destination}`,
  });
  return installed;
}

export async function resolveAssessInstallCommunityPackage(id: string, options: { approve?: boolean } = {}): Promise<{
  manifest: CommunityPackageManifest;
  resolution: CommunityResolution;
  assessment: CommunityAssessment;
  installed: InstalledCommunityPackage;
}> {
  const resolved = await resolveAssessCommunityPackage(id);
  const installed = await installResolvedCommunityPackage(resolved.manifest, resolved.resolution, resolved.assessment, options);
  return { ...resolved, installed };
}

export async function communityStatus(id?: string): Promise<Record<string, unknown>> {
  const state = await loadState();
  if (id) return { packageId: id, ...(state.packages[id] ?? { activeRevision: undefined, versions: [] }) };
  return { packages: state.packages };
}

export async function rollbackCommunityPackage(id: string, revision?: string): Promise<InstalledCommunityPackage> {
  const state = await loadState();
  const entry = state.packages[id];
  if (!entry?.versions.length || !entry.activeRevision) throw new Error(`Community package is not installed: ${id}`);
  const candidates = entry.versions.filter((version) => version.revision !== entry.activeRevision);
  const target = revision ? entry.versions.find((version) => version.revision === revision) : candidates.at(-1);
  if (!target) throw new Error(revision ? `Installed revision not found for ${id}: ${revision}` : `No previous revision exists for ${id}`);
  entry.activeRevision = target.revision;
  await saveState(state);
  await appendTransparencyRecord({
    action: "rollback",
    packageId: id,
    revision: target.revision,
    contentSha256: target.contentSha256,
    detail: `Active revision rolled back to ${target.revision}`,
  });
  return target;
}
