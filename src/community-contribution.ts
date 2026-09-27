import { createHash, createPublicKey } from "node:crypto";
import type { Dirent } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import type { CommunityPackageManifest, CommunityRegistryIndex } from "./community-types.js";
import { validateCommunityPackage } from "./community-registry.js";
import {
  communityManifestPayload,
  loadPublisherKeys,
  verifyCommunitySignature,
  type PublisherKeyRegistry,
} from "./community-signature.js";

const IMMUTABLE_GIT_COMMIT = /^[0-9a-f]{40}$/;
const SAFE_ID = /^[a-z0-9][a-z0-9._-]{1,79}$/;

export type CommunityContributionStatus = "blocked" | "publisher-onboarding-required" | "review-ready";

export interface PublisherKeyProposal {
  schemaVersion: 1;
  id: string;
  publisherId: string;
  algorithm: "ed25519";
  publicKeyPem: string;
  createdAt: string;
  notes?: string[];
}

export interface PublisherProposalReport {
  file: string;
  keyId?: string;
  publisherId?: string;
  status: "invalid" | "review-required";
  errors: string[];
  warnings: string[];
  trustedAutomatically: false;
}

export interface CommunityContributionReport {
  file: string;
  packageId?: string;
  manifestSha256?: string;
  status: CommunityContributionStatus;
  errors: string[];
  warnings: string[];
  sourcePinned: boolean;
  activationEligible: false;
  signature: {
    required: boolean;
    present: boolean;
    verified: boolean;
    keyId?: string;
    reason: string;
  };
}

export interface CommunityContributionDirectoryReport {
  ok: boolean;
  contributionDirectory: string;
  publisherProposalDirectory: string;
  contributions: CommunityContributionReport[];
  publisherProposals: PublisherProposalReport[];
  counts: {
    blocked: number;
    publisherOnboardingRequired: number;
    reviewReady: number;
    invalidPublisherProposals: number;
    publisherProposalsForReview: number;
  };
  note: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

function contributionPolicyErrors(manifest: CommunityPackageManifest): string[] {
  const errors: string[] = [];
  if (manifest.trust !== "community") {
    errors.push(`${manifest.id}: third-party contribution manifests must enter staging with trust=community; trust elevation is a maintainer review decision.`);
  }
  if (!IMMUTABLE_GIT_COMMIT.test(manifest.source.ref)) {
    errors.push(`${manifest.id}: contribution source.ref must be an immutable 40-character lowercase Git commit SHA.`);
  }
  if (manifest.publisher.signatureRequired !== true) {
    errors.push(`${manifest.id}: contribution publisher.signatureRequired must be true.`);
  }
  return errors;
}

function contributionWarnings(manifest: CommunityPackageManifest): string[] {
  const warnings: string[] = [];
  const highImpact = new Set(["secrets", "database-write", "deployment", "dns", "git-write"]);
  const sensitive = manifest.permissions.filter((permission) => highImpact.has(permission));
  if (sensitive.length) warnings.push(`High-impact permissions require explicit maintainer review: ${sensitive.join(", ")}.`);
  if (manifest.risk === "low" && manifest.permissions.some((permission) => permission === "shell" || permission === "network" || highImpact.has(permission))) {
    warnings.push("Declared low risk should be reviewed because the package requests shell/network/high-impact permissions.");
  }
  return warnings;
}

function manifestDigest(manifest: CommunityPackageManifest): string {
  return createHash("sha256").update(communityManifestPayload(manifest), "utf8").digest("hex");
}

function emptySignature(reason: string): CommunityContributionReport["signature"] {
  return { required: true, present: false, verified: false, reason };
}

export async function validateCommunityContributionManifest(
  manifest: unknown,
  file = "<memory>",
  keys?: PublisherKeyRegistry,
): Promise<CommunityContributionReport> {
  if (!isPlainObject(manifest)) {
    return {
      file,
      status: "blocked",
      errors: ["Contribution manifest must be a JSON object."],
      warnings: [],
      sourcePinned: false,
      activationEligible: false,
      signature: emptySignature("Manifest could not be structurally validated."),
    };
  }

  const typed = manifest as unknown as CommunityPackageManifest;
  let structuralErrors: string[] = [];
  try {
    structuralErrors = validateCommunityPackage(typed);
  } catch (error) {
    structuralErrors = [`Manifest validation failed: ${error instanceof Error ? error.message : String(error)}`];
  }
  const errors = [...structuralErrors];
  if (typed.source && typed.publisher) errors.push(...contributionPolicyErrors(typed));
  const sourcePinned = Boolean(typed.source && IMMUTABLE_GIT_COMMIT.test(String(typed.source.ref ?? "")));
  const warnings = typed.permissions && typed.risk ? contributionWarnings(typed) : [];

  if (errors.length) {
    return {
      file,
      ...(typeof typed.id === "string" ? { packageId: typed.id } : {}),
      status: "blocked",
      errors,
      warnings,
      sourcePinned,
      activationEligible: false,
      signature: emptySignature("Contribution policy/schema validation failed before signature trust evaluation."),
    };
  }

  const publisherKeys = keys ?? await loadPublisherKeys();
  const signature = await verifyCommunitySignature(typed, publisherKeys);
  const base = {
    file,
    packageId: typed.id,
    manifestSha256: manifestDigest(typed),
    errors,
    warnings,
    sourcePinned,
    activationEligible: false as const,
    signature,
  };

  if (signature.verified) return { ...base, status: "review-ready" };
  if (!signature.present || signature.reason.includes("not present in the trusted publisher registry")) {
    return {
      ...base,
      status: "publisher-onboarding-required",
      warnings: [...warnings, "Publisher identity/key must be reviewed out of band before this package can become review-ready."],
    };
  }
  return { ...base, status: "blocked", errors: [...errors, signature.reason] };
}

export async function validateCommunityContributionFile(
  path: string,
  keys?: PublisherKeyRegistry,
): Promise<CommunityContributionReport> {
  const target = resolve(path);
  try {
    return await validateCommunityContributionManifest(await readJson(target), target, keys);
  } catch (error) {
    return {
      file: target,
      status: "blocked",
      errors: [`Could not read contribution JSON: ${error instanceof Error ? error.message : String(error)}`],
      warnings: [],
      sourcePinned: false,
      activationEligible: false,
      signature: emptySignature("Contribution file could not be read."),
    };
  }
}

export function validatePublisherKeyProposal(value: unknown, file = "<memory>"): PublisherProposalReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isPlainObject(value)) return { file, status: "invalid", errors: ["Publisher key proposal must be a JSON object."], warnings, trustedAutomatically: false };
  const proposal = value as unknown as PublisherKeyProposal;
  if (proposal.schemaVersion !== 1) errors.push("Publisher key proposal schemaVersion must be 1.");
  if (!SAFE_ID.test(String(proposal.id ?? ""))) errors.push("Publisher key proposal id is invalid.");
  if (!SAFE_ID.test(String(proposal.publisherId ?? ""))) errors.push("Publisher key proposal publisherId is invalid.");
  if (proposal.algorithm !== "ed25519") errors.push("Publisher key proposal algorithm must be ed25519.");
  if (!Number.isFinite(Date.parse(String(proposal.createdAt ?? "")))) errors.push("Publisher key proposal createdAt must be an ISO date.");
  if (typeof proposal.publicKeyPem !== "string" || proposal.publicKeyPem.length < 40 || proposal.publicKeyPem.length > 4096) {
    errors.push("Publisher key proposal publicKeyPem is missing or outside the allowed size bound.");
  } else {
    try {
      const key = createPublicKey(proposal.publicKeyPem);
      if (key.asymmetricKeyType !== "ed25519") errors.push("Publisher key proposal publicKeyPem is not an Ed25519 public key.");
    } catch {
      errors.push("Publisher key proposal publicKeyPem is not a valid public key.");
    }
  }
  if (!Array.isArray(proposal.notes) && proposal.notes !== undefined) errors.push("Publisher key proposal notes must be an array when present.");
  warnings.push("A valid proposal is not trusted automatically; maintainers must verify publisher identity out of band before adding the public key to registry/publishers.json.");
  return {
    file,
    ...(typeof proposal.id === "string" ? { keyId: proposal.id } : {}),
    ...(typeof proposal.publisherId === "string" ? { publisherId: proposal.publisherId } : {}),
    status: errors.length ? "invalid" : "review-required",
    errors,
    warnings,
    trustedAutomatically: false,
  };
}

async function jsonFiles(directory: string): Promise<string[]> {
  try {
    const entries: Dirent[] = await readdir(directory, { withFileTypes: true });
    return entries
      .filter((entry: Dirent) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry: Dirent) => resolve(directory, entry.name))
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function validatePublisherProposalDirectory(directory: string): Promise<PublisherProposalReport[]> {
  const reports: PublisherProposalReport[] = [];
  for (const file of await jsonFiles(resolve(directory))) {
    try {
      reports.push(validatePublisherKeyProposal(await readJson(file), file));
    } catch (error) {
      reports.push({
        file,
        status: "invalid",
        errors: [`Could not read publisher proposal JSON: ${error instanceof Error ? error.message : String(error)}`],
        warnings: [],
        trustedAutomatically: false,
      });
    }
  }
  return reports;
}

export async function validateCommunityContributionDirectory(
  contributionDirectory: string,
  publisherProposalDirectory: string,
  keys?: PublisherKeyRegistry,
): Promise<CommunityContributionDirectoryReport> {
  const publisherKeys = keys ?? await loadPublisherKeys();
  const contributions: CommunityContributionReport[] = [];
  for (const file of await jsonFiles(resolve(contributionDirectory))) contributions.push(await validateCommunityContributionFile(file, publisherKeys));
  const publisherProposals = await validatePublisherProposalDirectory(publisherProposalDirectory);
  const counts = {
    blocked: contributions.filter((item) => item.status === "blocked").length,
    publisherOnboardingRequired: contributions.filter((item) => item.status === "publisher-onboarding-required").length,
    reviewReady: contributions.filter((item) => item.status === "review-ready").length,
    invalidPublisherProposals: publisherProposals.filter((item) => item.status === "invalid").length,
    publisherProposalsForReview: publisherProposals.filter((item) => item.status === "review-required").length,
  };
  return {
    ok: counts.blocked === 0 && counts.invalidPublisherProposals === 0,
    contributionDirectory: resolve(contributionDirectory),
    publisherProposalDirectory: resolve(publisherProposalDirectory),
    contributions,
    publisherProposals,
    counts,
    note: "Staged contribution files and publisher-key proposals are never loaded by the effective runtime registry. Passing validation means reviewable staging only, not activation or trust elevation.",
  };
}

export async function prepareCommunityContributionPromotion(
  manifest: unknown,
  bundledRegistry: CommunityRegistryIndex,
  file = "<memory>",
  keys?: PublisherKeyRegistry,
): Promise<{ ready: boolean; report: CommunityContributionReport; manifest?: CommunityPackageManifest; reasons: string[] }> {
  const report = await validateCommunityContributionManifest(manifest, file, keys);
  const reasons: string[] = [];
  if (report.status !== "review-ready") reasons.push(`Contribution status is ${report.status}, not review-ready.`);
  if (report.packageId && bundledRegistry.packages.some((pkg) => pkg.id === report.packageId)) reasons.push(`Bundled registry already contains package id ${report.packageId}; replacement/update requires a separate reviewed update path.`);
  if (reasons.length || report.status !== "review-ready") return { ready: false, report, reasons };
  return {
    ready: true,
    report,
    manifest: manifest as CommunityPackageManifest,
    reasons: ["Manifest is structurally valid, commit-pinned, community-trust, and signed by a currently trusted non-revoked publisher key. Maintainer review is still required before copying it into the bundled registry."],
  };
}
