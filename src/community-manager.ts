import { createHash } from "node:crypto";
import { cp, lstat, mkdir, readFile, readdir, rm } from "node:fs/promises";
import { relative, resolve } from "node:path";
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

interface IntegrityFile {
  absolute: string;
  relative: string;
  bytes: number;
  executable: boolean;
}

const HIGH_IMPACT = new Set<PermissionId>(["shell", "network", "browser", "git-write", "secrets", "database-write", "deployment", "dns"]);
const SEVERITY_RANK = { info: 0, low: 1, medium: 2, high: 3, critical: 4 } as const;
const TRUST_RANK = { community: 0, maintainer: 1, dockyard: 2, official: 3 } as const;
const RISK_RANK = { low: 0, medium: 1, high: 2 } as const;
const MAX_INTEGRITY_DEPTH = 64;

function statePath(): string {
  return resolve(dockyardHome(), "community", "state.json");
}

function packagesRoot(): string {
  return resolve(dockyardHome(), "community", "packages");
}

function quarantineRoot(): string {
  return resolve(dockyardHome(), "community", "quarantine");
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

function isInside(root: string, candidate: string): boolean {
  const rel = relative(resolve(root), resolve(candidate));
  if (rel === "") return true;
  if (rel === ".." || rel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)) return false;
  return !rel.startsWith("/");
}

function requireInside(root: string, candidate: string, label: string): string {
  const resolved = resolve(candidate);
  if (!isInside(root, resolved)) throw new Error(`${label} is outside the allowed DockyardOS directory.`);
  return resolved;
}

function packageRoot(pkg: CommunityPackageManifest, resolution: CommunityResolution): string {
  return requireInside(resolution.quarantinePath, resolve(resolution.quarantinePath, pkg.source.subdirectory ?? "."), "Community package source");
}

async function integrityFiles(root: string, maxFiles: number, maxBytes: number): Promise<IntegrityFile[]> {
  const files: IntegrityFile[] = [];
  let bytes = 0;
  let entriesSeen = 0;
  const maxEntries = Math.max(maxFiles * 4, maxFiles + 256);

  async function visit(directory: string, depth: number): Promise<void> {
    if (depth > MAX_INTEGRITY_DEPTH) throw new Error(`Community package exceeds integrity depth limit (${MAX_INTEGRITY_DEPTH}).`);
    const entries = await readdir(directory, { withFileTypes: true });
    entriesSeen += entries.length;
    if (entriesSeen > maxEntries) throw new Error(`Community package exceeds integrity filesystem entry limit (${maxEntries}).`);

    for (const entry of entries) {
      if (entry.name === ".git") continue;
      const absolute = requireInside(root, resolve(directory, entry.name), "Community package file");
      const rel = relative(root, absolute).replace(/\\/g, "/");
      const metadata = await lstat(absolute);
      if (metadata.isSymbolicLink()) throw new Error(`Community package integrity check rejects symlink: ${rel}`);
      if (metadata.isDirectory()) {
        await visit(absolute, depth + 1);
        continue;
      }
      if (!metadata.isFile()) throw new Error(`Community package integrity check rejects special file: ${rel}`);
      const size = Number(metadata.size ?? 0);
      bytes += size;
      files.push({ absolute, relative: rel, bytes: size, executable: (Number(metadata.mode ?? 0) & 0o111) !== 0 });
      if (files.length > maxFiles) throw new Error(`Community package exceeds integrity file limit (${maxFiles}).`);
      if (bytes > maxBytes) throw new Error(`Community package exceeds integrity byte limit (${maxBytes}).`);
    }
  }

  await visit(root, 0);
  return files;
}

export async function communityTreeSha256(
  root: string,
  options: { maxFiles?: number; maxBytes?: number } = {},
): Promise<string> {
  const resolvedRoot = resolve(root);
  const metadata = await lstat(resolvedRoot).catch(() => undefined);
  if (!metadata?.isDirectory()) throw new Error(`Community package integrity root is missing or not a directory: ${resolvedRoot}`);
  const files = await integrityFiles(resolvedRoot, options.maxFiles ?? 5000, options.maxBytes ?? 100 * 1024 * 1024);
  const hash = createHash("sha256");
  for (const file of [...files].sort((a, b) => a.relative.localeCompare(b.relative))) {
    hash.update(file.relative);
    hash.update("\0");
    hash.update(file.executable ? "100755" : "100644");
    hash.update("\0");
    hash.update(await readFile(file.absolute));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function maxFindingSeverity(scan: CommunityScanReport): keyof typeof SEVERITY_RANK {
  return scan.findings.reduce<keyof typeof SEVERITY_RANK>((max, finding) =>
    SEVERITY_RANK[finding.severity] > SEVERITY_RANK[max] ? finding.severity : max, "info");
}

function validateResolutionRelationship(
  manifest: CommunityPackageManifest,
  resolution: CommunityResolution,
  assessment: CommunityAssessment,
): void {
  if (resolution.packageId !== manifest.id || assessment.packageId !== manifest.id) throw new Error("Community assessment/resolution package id mismatch.");
  if (!/^[a-f0-9]{40}$/i.test(resolution.revision)) throw new Error("Community resolution revision must be an immutable 40-character Git commit SHA.");
  if (assessment.scan.revision !== resolution.revision) throw new Error("Community scan revision does not match the resolved Git commit.");
  const expectedQuarantineRoot = resolve(quarantineRoot(), manifest.id);
  requireInside(expectedQuarantineRoot, resolution.quarantinePath, "Community quarantine path");
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
  validateResolutionRelationship(manifest, resolution, assessment);

  const source = packageRoot(manifest, resolution);
  const hashOptions = { maxFiles: manifest.maxFiles ?? 1000, maxBytes: manifest.maxBytes ?? 20 * 1024 * 1024 };
  const beforeHash = await communityTreeSha256(source, hashOptions);
  if (beforeHash !== resolution.contentSha256) {
    await appendTransparencyRecord({
      action: "reject",
      packageId: manifest.id,
      revision: resolution.revision,
      contentSha256: resolution.contentSha256,
      detail: `Activation rejected because quarantine content changed after assessment: expected ${resolution.contentSha256}, got ${beforeHash}`,
    });
    throw new Error(`Community package ${manifest.id} changed after assessment; re-resolve and assess before installation.`);
  }

  const destination = requireInside(resolve(packagesRoot(), manifest.id), resolve(packagesRoot(), manifest.id, resolution.revision), "Community install destination");
  await mkdir(resolve(packagesRoot(), manifest.id), { recursive: true });
  await rm(destination, { recursive: true, force: true });
  await cp(source, destination, { recursive: true, force: false, errorOnExist: true, verbatimSymlinks: false });
  await rm(resolve(destination, ".git"), { recursive: true, force: true });

  const installedHash = await communityTreeSha256(destination, hashOptions);
  if (installedHash !== resolution.contentSha256) {
    await rm(destination, { recursive: true, force: true });
    await appendTransparencyRecord({
      action: "reject",
      packageId: manifest.id,
      revision: resolution.revision,
      contentSha256: resolution.contentSha256,
      detail: `Activation rejected because copied package hash mismatched: expected ${resolution.contentSha256}, got ${installedHash}`,
    });
    throw new Error(`Community package ${manifest.id} failed post-copy integrity verification.`);
  }

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

  const expectedRoot = resolve(packagesRoot(), id, target.revision);
  const destination = requireInside(resolve(packagesRoot(), id), target.destination, "Rollback target");
  if (resolve(destination) !== resolve(expectedRoot)) throw new Error(`Rollback target path does not match immutable package revision directory for ${id}.`);
  const actualHash = await communityTreeSha256(destination);
  if (actualHash !== target.contentSha256) {
    await appendTransparencyRecord({
      action: "reject",
      packageId: id,
      revision: target.revision,
      contentSha256: target.contentSha256,
      detail: `Rollback rejected because installed revision integrity failed: expected ${target.contentSha256}, got ${actualHash}`,
    });
    throw new Error(`Installed community revision ${target.revision} is missing or modified; rollback refused.`);
  }

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
