import { loadEffectiveCommunityRegistry } from "./community-effective-registry.js";
import { resolveAssessEffectiveCommunityPackage, resolveAssessInstallPinnedEffectiveCommunityPackage } from "./community-effective-install.js";
import { communityStatus } from "./community-manager.js";
import type { CommunityAssessment, InstalledCommunityPackage } from "./community-types.js";
import type { EffectiveRegistryOrigin } from "./community-effective-registry.js";

export type CommunityUpdateState = "up-to-date" | "update-available" | "approval-required" | "quarantined" | "manifest-missing" | "error";

export interface CommunityUpdateCheck {
  packageId: string;
  state: CommunityUpdateState;
  activeRevision?: string;
  activeContentSha256?: string;
  candidateRevision?: string;
  candidateContentSha256?: string;
  origin?: EffectiveRegistryOrigin;
  assessment?: CommunityAssessment["decision"];
  reasons: string[];
  error?: string;
}

interface CommunityStateView {
  packages: Record<string, {
    activeRevision?: string;
    versions: InstalledCommunityPackage[];
  }>;
}

async function installedState(): Promise<CommunityStateView> {
  return await communityStatus() as unknown as CommunityStateView;
}

function activeRecord(entry: CommunityStateView["packages"][string]): InstalledCommunityPackage | undefined {
  if (!entry.activeRevision) return undefined;
  return entry.versions.find((version) => version.revision === entry.activeRevision);
}

export async function checkCommunityUpdates(id?: string): Promise<CommunityUpdateCheck[]> {
  const state = await installedState();
  const effective = await loadEffectiveCommunityRegistry();
  const ids = id ? [id] : Object.keys(state.packages).sort();
  const results: CommunityUpdateCheck[] = [];

  for (const packageId of ids) {
    const entry = state.packages[packageId];
    const active = entry ? activeRecord(entry) : undefined;
    if (!entry || !active) {
      results.push({ packageId, state: "error", reasons: [], error: `Community package is not active: ${packageId}` });
      continue;
    }
    const candidate = effective.packages.find((item) => item.manifest.id === packageId);
    if (!candidate) {
      const conflict = effective.conflicts.find((item) => item.kind === "package" && item.id === packageId);
      results.push({
        packageId,
        state: "manifest-missing",
        activeRevision: active.revision,
        activeContentSha256: active.contentSha256,
        reasons: [conflict?.reason ?? "No unique package manifest is available in the effective registry."],
      });
      continue;
    }

    try {
      const resolved = await resolveAssessEffectiveCommunityPackage(packageId);
      const same = resolved.resolution.revision.toLowerCase() === active.revision.toLowerCase()
        && resolved.resolution.contentSha256.toLowerCase() === active.contentSha256.toLowerCase();
      const assessment = resolved.assessment.decision;
      const stateValue: CommunityUpdateState = same
        ? "up-to-date"
        : assessment === "quarantine"
          ? "quarantined"
          : assessment === "approval-required"
            ? "approval-required"
            : "update-available";
      results.push({
        packageId,
        state: stateValue,
        activeRevision: active.revision,
        activeContentSha256: active.contentSha256,
        candidateRevision: resolved.resolution.revision,
        candidateContentSha256: resolved.resolution.contentSha256,
        origin: resolved.origin,
        assessment,
        reasons: resolved.assessment.reasons,
      });
    } catch (error) {
      results.push({
        packageId,
        state: "error",
        activeRevision: active.revision,
        activeContentSha256: active.contentSha256,
        origin: candidate.origin,
        reasons: [],
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
}

export async function applySafeCommunityUpdates(id?: string): Promise<Array<{
  packageId: string;
  action: "updated" | "unchanged" | "skipped" | "error";
  state: CommunityUpdateState;
  reason: string;
  revision?: string;
}>> {
  const checks = await checkCommunityUpdates(id);
  const results: Array<{
    packageId: string;
    action: "updated" | "unchanged" | "skipped" | "error";
    state: CommunityUpdateState;
    reason: string;
    revision?: string;
  }> = [];

  for (const check of checks) {
    if (check.state === "up-to-date") {
      results.push({
        packageId: check.packageId,
        action: "unchanged",
        state: check.state,
        reason: "Active immutable revision already matches the assessed candidate.",
        ...(check.activeRevision ? { revision: check.activeRevision } : {}),
      });
      continue;
    }
    if (check.state !== "update-available" || check.assessment !== "automatic" || !check.candidateRevision || !check.candidateContentSha256) {
      const assessmentReason = check.reasons.join("; ");
      results.push({
        packageId: check.packageId,
        action: check.state === "error" ? "error" : "skipped",
        state: check.state,
        reason: check.error ?? (assessmentReason || "Update is not eligible for unattended activation."),
        ...(check.activeRevision ? { revision: check.activeRevision } : {}),
      });
      continue;
    }

    try {
      const installed = await resolveAssessInstallPinnedEffectiveCommunityPackage(check.packageId, {
        expectedRevision: check.candidateRevision,
        expectedContentSha256: check.candidateContentSha256,
        approve: false,
      });
      results.push({
        packageId: check.packageId,
        action: "updated",
        state: check.state,
        reason: "Update remained automatic after a fresh pinned assessment and was activated.",
        revision: installed.installed.revision,
      });
    } catch (error) {
      results.push({
        packageId: check.packageId,
        action: "error",
        state: "error",
        reason: error instanceof Error ? error.message : String(error),
        ...(check.activeRevision ? { revision: check.activeRevision } : {}),
      });
    }
  }
  return results;
}
