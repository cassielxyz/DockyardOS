export type OperatingMode = "safe" | "balanced" | "autonomous";
export type SecurityLevel = "standard" | "high";
export type WorkflowProfile = "fast" | "standard" | "full";

export interface ProjectConfig {
  schemaVersion: 1;
  id: string;
  name: string;
  root: string;
  sourceKey: string;
  createdAt: string;
  updatedAt: string;
  mode: OperatingMode;
  checkpointIntervalMinutes: number;
  maxCheckpoints: number;
}

export interface GitSnapshot {
  repository: boolean;
  branch?: string;
  head?: string;
  dirty: boolean;
  staged: boolean;
  unstaged: boolean;
  untracked: string[];
  status: string[];
  patchStored: boolean;
  patchTruncated: boolean;
}

export interface CheckpointState {
  phase?: string;
  activeTask?: string;
  completed: string[];
  blocked: string[];
  next: string[];
  capabilities: string[];
  notes?: string;
}

export interface Checkpoint {
  schemaVersion: 1;
  id: string;
  projectId: string;
  createdAt: string;
  reason: string;
  git: GitSnapshot;
  state: CheckpointState;
  session?: SessionState;
}

export interface SessionState {
  conversationId?: string;
  transcriptPath?: string;
  artifactDirectoryPath?: string;
  modelName?: string;
  updatedAt: string;
}

export type GateDecision = "allow" | "ask" | "force_ask" | "deny" | "deny_unless_prior_grant";

export interface PolicyDecision {
  decision: GateDecision;
  reason: string;
}

export interface DoctorCheck {
  name: string;
  status: "pass" | "warn" | "fail";
  detail: string;
}

export interface Candidate {
  id: string;
  displayName: string;
  category: string;
  kind: "skill" | "tool" | "agent" | "mcp";
  trust: "official" | "community" | "dockyard";
  tags: string[];
}

export interface ProviderDefinition {
  id: string;
  displayName: string;
  capabilities: string[];
  connectionKinds: Array<"mcp" | "api" | "cli" | "sdk">;
  tags: string[];
  requiresLiveAvailabilityCheck: boolean;
}

export interface WorkflowPlan {
  profile: WorkflowProfile;
  agents: string[];
  skills: string[];
  tools: string[];
  securityGates: string[];
  providerCandidates: string[];
}
