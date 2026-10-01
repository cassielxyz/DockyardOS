import type { CapabilityKind, HostId, PermissionId, ProviderReadiness, RiskLevel, TrustLevel, UpdateChannel } from "./types.js";

export type CommunitySourceType = "github";
export type CommunityEntrypointType = "skill" | "agent" | "mcp" | "rules" | "workflow" | "docs";
export type CommunityInstallDecision = "automatic" | "approval-required" | "quarantine";
export type CommunityPackageStatus = "discovered" | "resolved" | "quarantined" | "approved" | "installed" | "rejected";
export type CommunityProviderMinimumReadiness = Extract<ProviderReadiness, "configured" | "authenticated" | "linked">;

export interface CommunitySource {
  type: CommunitySourceType;
  repository: string;
  ref: string;
  subdirectory?: string;
}

export interface CommunityEntrypoint {
  type: CommunityEntrypointType;
  path: string;
}

export interface CommunityPublisher {
  id: string;
  name: string;
  keyId?: string;
  signatureRequired?: boolean;
}

export type CommunityRuntimeConnectionRequirement =
  | {
      kind: "provider";
      id: string;
      required: boolean;
      minimumReadiness: CommunityProviderMinimumReadiness;
    }
  | {
      kind: "mcp";
      id: string;
      required: boolean;
    };

export interface CommunityRuntimeRequirements {
  /** Every listed executable must exist before an installed package can be called runtime-ready. */
  executables?: string[];
  /** External provider/MCP connections. Required entries gate readiness; optional entries are advisory only. */
  connections?: CommunityRuntimeConnectionRequirement[];
  /** Human-readable prerequisites or task-dependent caveats that cannot yet be machine-verified by DockyardOS. */
  notes?: string[];
}

export interface CommunityPackageManifest {
  schemaVersion: 1;
  id: string;
  displayName: string;
  version: string;
  kind: CapabilityKind;
  description: string;
  source: CommunitySource;
  publisher: CommunityPublisher;
  license: string;
  trust: TrustLevel;
  risk: RiskLevel;
  permissions: PermissionId[];
  capabilities: string[];
  tags: string[];
  hosts: HostId[];
  channel: UpdateChannel;
  entrypoints: CommunityEntrypoint[];
  runtimeRequirements?: CommunityRuntimeRequirements;
  maxFiles?: number;
  maxBytes?: number;
  signature?: {
    algorithm: "ed25519";
    keyId: string;
    value: string;
  };
}

export interface CommunityRegistrySource {
  id: string;
  displayName: string;
  type: "github-index" | "mcp-registry" | "awesome-list" | "official-catalog";
  locator: string;
  trust: TrustLevel;
  enabledByDefault: boolean;
  notes: string[];
}

export interface CommunityRegistryIndex {
  schemaVersion: 1;
  updatedAt: string;
  packages: CommunityPackageManifest[];
  discoverySources: CommunityRegistrySource[];
}

export interface CommunityResolution {
  packageId: string;
  repository: string;
  requestedRef: string;
  revision: string;
  resolvedAt: string;
  quarantinePath: string;
  contentSha256: string;
  files: number;
  bytes: number;
}

export interface CommunityScanFinding {
  severity: "info" | "low" | "medium" | "high" | "critical";
  code: string;
  path?: string;
  detail: string;
}

export interface CommunityScanReport {
  packageId: string;
  revision: string;
  files: number;
  bytes: number;
  executableFiles: string[];
  scriptFiles: string[];
  entrypointsPresent: string[];
  entrypointsMissing: string[];
  findings: CommunityScanFinding[];
  inferredPermissions: PermissionId[];
  canary: {
    status: "pass" | "warn" | "fail";
    checks: Array<{ name: string; status: "pass" | "warn" | "fail"; detail: string }>;
  };
}

export interface CommunityAssessment {
  packageId: string;
  decision: CommunityInstallDecision;
  reasons: string[];
  signature: {
    required: boolean;
    present: boolean;
    verified: boolean;
    keyId?: string;
  };
  declaredPermissions: PermissionId[];
  inferredPermissions: PermissionId[];
  permissionExpansion: PermissionId[];
  scan: CommunityScanReport;
}

export interface InstalledCommunityPackage {
  schemaVersion: 1;
  packageId: string;
  displayName: string;
  version: string;
  revision: string;
  contentSha256: string;
  installedAt: string;
  source: CommunitySource;
  permissions: PermissionId[];
  trust: TrustLevel;
  risk: RiskLevel;
  channel: UpdateChannel;
  status: CommunityPackageStatus;
  destination: string;
  signatureVerified: boolean;
}

export interface TransparencyRecord {
  schemaVersion: 1;
  sequence: number;
  timestamp: string;
  action: "resolve" | "quarantine" | "approve" | "install" | "update" | "rollback" | "reject";
  packageId: string;
  revision?: string;
  contentSha256?: string;
  previousHash: string;
  recordHash: string;
  detail: string;
}
