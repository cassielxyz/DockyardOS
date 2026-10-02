import { resolve } from "node:path";
import { loadEffectiveCommunityRegistry } from "./community-effective-registry.js";
import {
  resolveAssessEffectiveCommunityPackage,
  resolveAssessInstallPinnedEffectiveCommunityPackage,
} from "./community-effective-install.js";
import { communityStatus } from "./community-manager.js";
import { writeJsonAtomic } from "./fs-utils.js";
import { dockyardHome } from "./project.js";

export type SkillBootstrapStatus =
  | "already-active"
  | "activated"
  | "staged-review"
  | "quarantined"
  | "failed";

export interface SkillBootstrapEntry {
  packageId: string;
  displayName: string;
  status: SkillBootstrapStatus;
  reason: string;
  revision?: string;
  contentSha256?: string;
  quarantinePath?: string;
}

export interface SkillBootstrapResult {
  schemaVersion: 1;
  generatedAt: string;
  installableSkills: number;
  activated: number;
  alreadyActive: number;
  stagedReview: number;
  quarantined: number;
  failed: number;
  discoverySources: number;
  entries: SkillBootstrapEntry[];
  reportPath: string;
}

function summaryPath(): string {
  return resolve(dockyardHome(), "skills", "bootstrap.json");
}

export async function bootstrapInstallableSkills(options: {
  ids?: string[];
  activateAutomatic?: boolean;
  maxPackages?: number;
} = {}): Promise<SkillBootstrapResult> {
  const registry = await loadEffectiveCommunityRegistry();
  const wanted = new Set(options.ids ?? []);
  const limit = Math.max(1, Math.min(options.maxPackages ?? 128, 256));
  const packages = registry.packages
    .filter(({ manifest }) => manifest.kind === "skill")
    .filter(({ manifest }) => !wanted.size || wanted.has(manifest.id))
    .slice(0, limit);
  const activateAutomatic = options.activateAutomatic !== false;
  const entries: SkillBootstrapEntry[] = [];

  for (const { manifest } of packages) {
    try {
      const status = await communityStatus(manifest.id) as { activeRevision?: string };
      if (status.activeRevision) {
        entries.push({
          packageId: manifest.id,
          displayName: manifest.displayName,
          status: "already-active",
          reason: "An integrity-tracked active revision already exists in the DockyardOS user library.",
          revision: status.activeRevision,
        });
        continue;
      }

      // Resolution intentionally downloads into Dockyard's quarantine/cache first.
      // No fetched package receives execution authority merely because it is present on disk.
      const assessed = await resolveAssessEffectiveCommunityPackage(manifest.id);
      const base = {
        packageId: manifest.id,
        displayName: manifest.displayName,
        revision: assessed.resolution.revision,
        contentSha256: assessed.resolution.contentSha256,
        quarantinePath: assessed.resolution.quarantinePath,
      };

      if (assessed.assessment.decision === "automatic" && activateAutomatic) {
        await resolveAssessInstallPinnedEffectiveCommunityPackage(manifest.id, {
          expectedRevision: assessed.resolution.revision,
          expectedContentSha256: assessed.resolution.contentSha256,
          approve: false,
        });
        entries.push({
          ...base,
          status: "activated",
          reason: "Downloaded, freshly reassessed at the pinned revision, and activated under the existing automatic-safe package policy.",
        });
        continue;
      }

      if (assessed.assessment.decision === "approval-required") {
        entries.push({
          ...base,
          status: "staged-review",
          reason: "Downloaded and assessed in Dockyard quarantine. Activation remains approval-gated because the package declares higher-impact permissions.",
        });
        continue;
      }

      entries.push({
        ...base,
        status: "quarantined",
        reason: assessed.assessment.reasons.join("; ") || "Package assessment requires quarantine.",
      });
    } catch (error) {
      entries.push({
        packageId: manifest.id,
        displayName: manifest.displayName,
        status: "failed",
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const reportPath = summaryPath();
  const result: SkillBootstrapResult = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    installableSkills: packages.length,
    activated: entries.filter((entry) => entry.status === "activated").length,
    alreadyActive: entries.filter((entry) => entry.status === "already-active").length,
    stagedReview: entries.filter((entry) => entry.status === "staged-review").length,
    quarantined: entries.filter((entry) => entry.status === "quarantined").length,
    failed: entries.filter((entry) => entry.status === "failed").length,
    discoverySources: registry.discoverySources.length,
    entries,
    reportPath,
  };
  await writeJsonAtomic(reportPath, result);
  return result;
}
