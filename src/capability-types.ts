import type { Candidate, PermissionId, UpdateChannel } from "./types.js";
import type { RegistryLockEntry, UpdateDecision } from "./registry-lock.js";

export type CapabilityBundleKind = "single-skill" | "skill-collection";
export type CapabilityLifecycleStatus = "resolved" | "quarantined" | "approval-required" | "staged" | "active";

export interface ResolvedCapabilitySource {
  candidateId: string;
  sourceType: Candidate["source"]["type"];
  sourceLocator: string;
  requestedRef: string;
  revision: string;
  repositoryPath: string;
  fetchedAt: string;
}

export interface DiscoveredSkill {
  name: string;
  description: string;
  skillFile: string;
  root: string;
  relativeRoot: string;
  relativeSkillFile: string;
  score: number;
}

export interface CapabilityFileRecord {
  path: string;
  size: number;
  sha256: string;
  executableLike: boolean;
  binary: boolean;
}

export interface CapabilityInspectionFlag {
  severity: "info" | "warning" | "danger";
  code: string;
  message: string;
  file?: string;
}

export interface CapabilityInspection {
  candidateId: string;
  displayName: string;
  revision: string;
  sourceLocator: string;
  bundleKind: CapabilityBundleKind;
  skills: DiscoveredSkill[];
  files: CapabilityFileRecord[];
  contentSha256: string;
  declaredPermissions: PermissionId[];
  detectedPermissions: PermissionId[];
  undeclaredPermissions: PermissionId[];
  flags: CapabilityInspectionFlag[];
  decision: UpdateDecision;
  reasons: string[];
  inspectedAt: string;
}

export interface CapabilityInstallRecord {
  schemaVersion: 1;
  candidateId: string;
  displayName: string;
  sourceLocator: string;
  revision: string;
  contentSha256: string;
  bundleKind: CapabilityBundleKind;
  status: CapabilityLifecycleStatus;
  stagedPath?: string;
  quarantinePath?: string;
  skillNames: string[];
  detectedPermissions: PermissionId[];
  decision: UpdateDecision;
  reasons: string[];
  lockEntry?: RegistryLockEntry;
  createdAt: string;
  updatedAt: string;
}

export interface CapabilitySyncItem {
  candidateId: string;
  currentRevision?: string;
  availableRevision?: string;
  decision: "unchanged" | UpdateDecision | "error";
  reasons: string[];
  applied: boolean;
  record?: CapabilityInstallRecord;
}

export interface CapabilitySyncResult {
  projectId: string;
  channel: UpdateChannel;
  checkedAt: string;
  items: CapabilitySyncItem[];
}

export interface ManagedSkillMarker {
  schemaVersion: 1;
  managedBy: "DockyardOS";
  candidateId: string;
  revision: string;
  contentSha256: string;
  skillName: string;
  installedAt: string;
}
