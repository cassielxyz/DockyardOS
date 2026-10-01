import {
  planCapabilityFulfillmentForIds,
  persistCapabilityFulfillment,
  type CapabilityFulfillmentPlan,
} from "./capability-fulfillment.js";
import {
  resolveAssessEffectiveCommunityPackage,
  resolveAssessInstallPinnedEffectiveCommunityPackage,
} from "./community-effective-install.js";

export type CapabilityActivationStatus =
  | "activated"
  | "approval-required"
  | "quarantined"
  | "failed";

export interface CapabilityActivationAttempt {
  candidateId: string;
  packageId: string;
  status: CapabilityActivationStatus;
  reason: string;
  revision?: string;
  contentSha256?: string;
}

export interface CapabilityActivationResult {
  schemaVersion: 1;
  attemptedAt: string;
  attempts: CapabilityActivationAttempt[];
  finalPlan: CapabilityFulfillmentPlan;
  persistedPath?: string;
}

export interface CapabilityActivationDependencies {
  assess: typeof resolveAssessEffectiveCommunityPackage;
  install: typeof resolveAssessInstallPinnedEffectiveCommunityPackage;
}

const DEFAULT_DEPENDENCIES: CapabilityActivationDependencies = {
  assess: resolveAssessEffectiveCommunityPackage,
  install: resolveAssessInstallPinnedEffectiveCommunityPackage,
};

function activationCandidates(plan: CapabilityFulfillmentPlan) {
  return plan.entries.filter((entry) =>
    entry.status === "installable-unassessed"
      && entry.automaticAction === "assess-install"
      && Boolean(entry.packageId),
  );
}

export async function activateAutomaticCapabilities(
  root: string,
  plan: CapabilityFulfillmentPlan,
  options: {
    requestHash?: string;
    maxAutomaticInstalls?: number;
    dependencies?: CapabilityActivationDependencies;
  } = {},
): Promise<CapabilityActivationResult> {
  const dependencies = options.dependencies ?? DEFAULT_DEPENDENCIES;
  const maxAutomaticInstalls = Math.max(0, Math.min(options.maxAutomaticInstalls ?? 3, 8));
  const attempts: CapabilityActivationAttempt[] = [];
  let considered = 0;

  for (const entry of activationCandidates(plan)) {
    if (considered >= maxAutomaticInstalls) break;
    considered += 1;
    const packageId = entry.packageId!;

    try {
      const assessed = await dependencies.assess(packageId);
      const revision = assessed.resolution.revision;
      const contentSha256 = assessed.resolution.contentSha256;

      if (assessed.assessment.decision === "approval-required") {
        attempts.push({
          candidateId: entry.candidateId,
          packageId,
          status: "approval-required",
          reason: assessed.assessment.reasons.join("; ") || "Existing package policy requires explicit approval.",
          revision,
          contentSha256,
        });
        continue;
      }
      if (assessed.assessment.decision === "quarantine") {
        attempts.push({
          candidateId: entry.candidateId,
          packageId,
          status: "quarantined",
          reason: assessed.assessment.reasons.join("; ") || "Existing package policy quarantined this capability.",
          revision,
          contentSha256,
        });
        continue;
      }

      await dependencies.install(packageId, {
        expectedRevision: revision,
        expectedContentSha256: contentSha256,
        approve: false,
      });
      attempts.push({
        candidateId: entry.candidateId,
        packageId,
        status: "activated",
        reason: "Existing DockyardOS package policy remained automatic after fresh pinned reassessment; activated without approval bypass.",
        revision,
        contentSha256,
      });
    } catch (error) {
      attempts.push({
        candidateId: entry.candidateId,
        packageId,
        status: "failed",
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const candidateIds = plan.entries.map((entry) => entry.candidateId);
  const finalPlan = await planCapabilityFulfillmentForIds(root, candidateIds);
  const persistedPath = await persistCapabilityFulfillment(root, finalPlan, options.requestHash).catch(() => undefined);
  return {
    schemaVersion: 1,
    attemptedAt: new Date().toISOString(),
    attempts,
    finalPlan,
    ...(persistedPath ? { persistedPath } : {}),
  };
}

export function capabilityActivationAgentText(result: CapabilityActivationResult): string[] {
  const activated = result.attempts.filter((item) => item.status === "activated");
  const review = result.attempts.filter((item) => item.status === "approval-required");
  const quarantined = result.attempts.filter((item) => item.status === "quarantined");
  const failed = result.attempts.filter((item) => item.status === "failed");
  const lines = [
    activated.length ? `DockyardOS safely auto-activated: ${activated.map((item) => item.candidateId).join(", ")}.` : "",
    review.length ? `DockyardOS left approval-required capabilities inactive: ${review.map((item) => item.candidateId).join(", ")}.` : "",
    quarantined.length ? `DockyardOS kept quarantined capabilities inactive: ${quarantined.map((item) => item.candidateId).join(", ")}.` : "",
    failed.length ? `DockyardOS automatic activation failed safely for: ${failed.map((item) => item.candidateId).join(", ")}.` : "",
  ];
  return lines.filter(Boolean);
}
