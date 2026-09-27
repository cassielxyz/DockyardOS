import { createHash } from "node:crypto";
import type { CommunityPackageManifest, CommunityRegistryIndex } from "./community-types.js";
import type { PublisherKey, PublisherKeyRegistry } from "./community-signature.js";
import { prepareCommunityContributionPromotion, validatePublisherKeyProposal, type PublisherKeyProposal } from "./community-contribution.js";

const REVIEWER = /^[A-Za-z0-9][A-Za-z0-9._@+/-]{1,127}$/;

export interface MaintainerReview {
  reviewedBy: string;
  rationale: string;
  reviewedAt: string;
}

export interface MaintainerPlan<T> {
  schemaVersion: 1;
  operation: "publisher-onboard" | "publisher-rotate" | "publisher-revoke" | "contribution-promote";
  review: MaintainerReview;
  beforeSha256: string;
  afterSha256: string;
  warnings: string[];
  changes: string[];
  next: T;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function maintainerObjectSha256(value: unknown): string {
  return createHash("sha256").update(stableJson(value), "utf8").digest("hex");
}

function review(input: { reviewedBy: string; rationale: string }, now = new Date()): MaintainerReview {
  const reviewedBy = input.reviewedBy.trim();
  const rationale = input.rationale.trim();
  if (!REVIEWER.test(reviewedBy)) throw new Error("Maintainer reviewer identity contains unsupported characters or is too short.");
  if (rationale.length < 12 || rationale.length > 1000 || /[\u0000-\u001f\u007f]/.test(rationale)) {
    throw new Error("Maintainer rationale must be 12-1000 printable characters.");
  }
  if (!Number.isFinite(now.getTime())) throw new Error("Maintainer review timestamp is invalid.");
  return { reviewedBy, rationale, reviewedAt: now.toISOString() };
}

function proposalKey(proposal: PublisherKeyProposal): PublisherKey {
  return {
    id: proposal.id,
    publisherId: proposal.publisherId,
    algorithm: "ed25519",
    publicKeyPem: proposal.publicKeyPem,
    createdAt: new Date(proposal.createdAt).toISOString(),
  };
}

function validatedProposal(value: unknown): PublisherKeyProposal {
  const report = validatePublisherKeyProposal(value);
  if (report.status !== "review-required") throw new Error(`Publisher key proposal is not reviewable: ${report.errors.join("; ")}`);
  return value as PublisherKeyProposal;
}

function publisherPlan(
  operation: MaintainerPlan<PublisherKeyRegistry>["operation"],
  current: PublisherKeyRegistry,
  nextKeys: PublisherKey[],
  reviewMetadata: MaintainerReview,
  changes: string[],
  warnings: string[],
): MaintainerPlan<PublisherKeyRegistry> {
  const next: PublisherKeyRegistry = {
    schemaVersion: 1,
    updatedAt: reviewMetadata.reviewedAt,
    keys: nextKeys,
  };
  return {
    schemaVersion: 1,
    operation,
    review: reviewMetadata,
    beforeSha256: maintainerObjectSha256(current),
    afterSha256: maintainerObjectSha256(next),
    warnings,
    changes,
    next,
  };
}

export function planPublisherOnboarding(
  proposalValue: unknown,
  current: PublisherKeyRegistry,
  reviewInput: { reviewedBy: string; rationale: string },
  now = new Date(),
): MaintainerPlan<PublisherKeyRegistry> {
  const proposal = validatedProposal(proposalValue);
  if (current.keys.some((key) => key.id === proposal.id)) throw new Error(`Publisher key id already exists: ${proposal.id}`);
  const metadata = review(reviewInput, now);
  return publisherPlan(
    "publisher-onboard",
    current,
    [...current.keys, proposalKey(proposal)],
    metadata,
    [`Trust publisher public key ${proposal.id} for publisher ${proposal.publisherId}.`],
    ["Identity ownership must be verified independently before applying this plan. The proposal file alone is not proof of identity."],
  );
}

export function planPublisherRotation(
  proposalValue: unknown,
  current: PublisherKeyRegistry,
  oldKeyId: string,
  reviewInput: { reviewedBy: string; rationale: string },
  now = new Date(),
): MaintainerPlan<PublisherKeyRegistry> {
  const proposal = validatedProposal(proposalValue);
  const old = current.keys.find((key) => key.id === oldKeyId);
  if (!old) throw new Error(`Publisher key not found: ${oldKeyId}`);
  if (old.revokedAt) throw new Error(`Publisher key is already revoked: ${oldKeyId}`);
  if (old.publisherId !== proposal.publisherId) throw new Error("Rotation proposal publisherId must match the old trusted key publisherId.");
  if (proposal.id === oldKeyId || current.keys.some((key) => key.id === proposal.id)) throw new Error(`Rotation requires a new unused key id: ${proposal.id}`);
  const metadata = review(reviewInput, now);
  const nextKeys = current.keys.map((key) => key.id === oldKeyId ? { ...key, revokedAt: metadata.reviewedAt } : key);
  nextKeys.push(proposalKey(proposal));
  return publisherPlan(
    "publisher-rotate",
    current,
    nextKeys,
    metadata,
    [
      `Add replacement key ${proposal.id} for publisher ${proposal.publisherId}.`,
      `Revoke previous key ${oldKeyId} at ${metadata.reviewedAt}.`,
    ],
    ["Existing manifests signed only by the revoked key will no longer verify as trusted after this change; publishers should re-sign maintained manifests with the replacement key."],
  );
}

export function planPublisherRevocation(
  current: PublisherKeyRegistry,
  keyId: string,
  reviewInput: { reviewedBy: string; rationale: string },
  now = new Date(),
): MaintainerPlan<PublisherKeyRegistry> {
  const target = current.keys.find((key) => key.id === keyId);
  if (!target) throw new Error(`Publisher key not found: ${keyId}`);
  if (target.revokedAt) throw new Error(`Publisher key is already revoked: ${keyId}`);
  const metadata = review(reviewInput, now);
  const nextKeys = current.keys.map((key) => key.id === keyId ? { ...key, revokedAt: metadata.reviewedAt } : key);
  const otherActive = nextKeys.filter((key) => key.publisherId === target.publisherId && !key.revokedAt);
  return publisherPlan(
    "publisher-revoke",
    current,
    nextKeys,
    metadata,
    [`Revoke publisher key ${keyId} for publisher ${target.publisherId} at ${metadata.reviewedAt}.`],
    otherActive.length ? [] : [`Publisher ${target.publisherId} will have no active trusted keys after this revocation.`],
  );
}

export async function planContributionPromotion(
  manifest: unknown,
  current: CommunityRegistryIndex,
  keys: PublisherKeyRegistry,
  reviewInput: { reviewedBy: string; rationale: string },
  file = "<memory>",
  now = new Date(),
): Promise<MaintainerPlan<CommunityRegistryIndex>> {
  const prepared = await prepareCommunityContributionPromotion(manifest, current, file, keys);
  if (!prepared.ready || !prepared.manifest) throw new Error(`Contribution is not ready for promotion: ${prepared.reasons.join("; ")}`);
  const metadata = review(reviewInput, now);
  const promoted: CommunityPackageManifest = prepared.manifest;
  if (promoted.trust !== "community") throw new Error("Third-party promotion cannot elevate trust above community.");
  const next: CommunityRegistryIndex = {
    ...current,
    updatedAt: metadata.reviewedAt,
    packages: [...current.packages, promoted],
  };
  return {
    schemaVersion: 1,
    operation: "contribution-promote",
    review: metadata,
    beforeSha256: maintainerObjectSha256(current),
    afterSha256: maintainerObjectSha256(next),
    warnings: ["Promotion copies the reviewed signed manifest into the bundled registry but does not change its community trust level."],
    changes: [`Add reviewed package ${promoted.id}@${promoted.version} from immutable source revision ${promoted.source.ref}.`],
    next,
  };
}

export function assertMaintainerApplyApproval(plan: MaintainerPlan<unknown>, expectedSha256: string, approved: boolean): void {
  if (!approved) throw new Error("Explicit maintainer approval flag is required to apply this trust/registry change.");
  if (!/^[0-9a-f]{64}$/.test(expectedSha256) || expectedSha256 !== plan.beforeSha256) {
    throw new Error(`Expected registry SHA-256 does not match the reviewed current state. Expected ${plan.beforeSha256}.`);
  }
  if (maintainerObjectSha256(plan.next) !== plan.afterSha256) throw new Error("Maintainer plan next-state digest is inconsistent.");
}
