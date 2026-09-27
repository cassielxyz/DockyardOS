import { resolve } from "node:path";
import { scanCommunityPackageTree } from "./community-fetch.js";
import {
  assessCommunityPackage,
  communityStatus,
  installResolvedCommunityPackage,
  resolveAssessCommunityPackage,
} from "./community-manager.js";
import type { CommunityResolution, InstalledCommunityPackage } from "./community-types.js";

export interface CommunityInstallExpectations {
  approve?: boolean;
  expectedRevision?: string;
  expectedContentSha256?: string;
}

export function assertExpectedCommunityResolution(
  resolution: CommunityResolution,
  expectations: CommunityInstallExpectations,
): void {
  if (expectations.expectedRevision) {
    if (!/^[a-f0-9]{40}$/i.test(expectations.expectedRevision)) throw new Error("--expected-revision must be a 40-character Git commit SHA.");
    if (resolution.revision.toLowerCase() !== expectations.expectedRevision.toLowerCase()) {
      throw new Error(`Community package upstream moved after assessment: expected revision ${expectations.expectedRevision}, resolved ${resolution.revision}. Re-assess before approval.`);
    }
  }
  if (expectations.expectedContentSha256) {
    if (!/^[a-f0-9]{64}$/i.test(expectations.expectedContentSha256)) throw new Error("--expected-sha256 must be a 64-character SHA-256 digest.");
    if (resolution.contentSha256.toLowerCase() !== expectations.expectedContentSha256.toLowerCase()) {
      throw new Error(`Community package content changed after assessment: expected ${expectations.expectedContentSha256}, resolved ${resolution.contentSha256}. Re-assess before approval.`);
    }
  }
}

export async function resolveAssessInstallPinnedCommunityPackage(
  id: string,
  expectations: CommunityInstallExpectations = {},
) {
  const resolved = await resolveAssessCommunityPackage(id);
  assertExpectedCommunityResolution(resolved.resolution, expectations);

  const sourceRoot = resolve(resolved.resolution.quarantinePath, resolved.manifest.source.subdirectory ?? ".");
  const freshScan = await scanCommunityPackageTree(sourceRoot, resolved.manifest, resolved.resolution.revision);
  const status = await communityStatus(id) as {
    activeRevision?: string;
    versions?: InstalledCommunityPackage[];
  };
  const previous = status.activeRevision
    ? status.versions?.find((version) => version.revision === status.activeRevision)
    : undefined;
  const freshAssessment = await assessCommunityPackage(
    resolved.manifest,
    resolved.resolution,
    freshScan,
    previous,
  );
  assertExpectedCommunityResolution(resolved.resolution, expectations);

  const installed = await installResolvedCommunityPackage(
    resolved.manifest,
    resolved.resolution,
    freshAssessment,
    { approve: expectations.approve },
  );
  return { ...resolved, assessment: freshAssessment, installed };
}
