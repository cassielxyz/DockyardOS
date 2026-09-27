import { resolve } from "node:path";
import { scanCommunityPackageTree, resolveAndQuarantine } from "./community-fetch.js";
import { findEffectiveCommunityPackage } from "./community-effective-registry.js";
import {
  assessCommunityPackage,
  communityStatus,
  installResolvedCommunityPackage,
} from "./community-manager.js";
import { assertExpectedCommunityResolution, type CommunityInstallExpectations } from "./community-install.js";
import type { InstalledCommunityPackage } from "./community-types.js";

export async function resolveAssessEffectiveCommunityPackage(id: string) {
  const effective = await findEffectiveCommunityPackage(id);
  if (!effective) throw new Error(`Community package is not available in the collision-safe effective registry: ${id}`);
  const { resolution, scan } = await resolveAndQuarantine(effective.manifest);
  const state = await communityStatus(id) as {
    activeRevision?: string;
    versions?: InstalledCommunityPackage[];
  };
  const previous = state.activeRevision
    ? state.versions?.find((version) => version.revision === state.activeRevision)
    : undefined;
  const assessment = await assessCommunityPackage(effective.manifest, resolution, scan, previous);
  return {
    manifest: effective.manifest,
    origin: effective.origin,
    resolution,
    assessment,
  };
}

export async function resolveAssessInstallPinnedEffectiveCommunityPackage(
  id: string,
  expectations: CommunityInstallExpectations = {},
) {
  const resolved = await resolveAssessEffectiveCommunityPackage(id);
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
