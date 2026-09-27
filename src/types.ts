export type OperatingMode = "safe" | "balanced" | "autonomous";
export type SecurityLevel = "standard" | "high";
export type WorkflowProfile = "fast" | "standard" | "full";
export type CapabilityKind = "skill" | "tool" | "agent" | "mcp" | "provider" | "workflow";
export type TrustLevel = "official" | "maintainer" | "community" | "dockyard";
export type UpdateChannel = "stable" | "recommended" | "edge" | "dev";
export type RiskLevel = "low" | "medium" | "high";
export type ContextCost = "tiny" | "small" | "medium" | "large";
export type HostId = "antigravity" | "gemini-cli" | "codex" | "claude-code" | "cursor" | "opencode" | "universal";
export type PermissionId = "filesystem-read" | "filesystem-write" | "shell" | "network" | "browser" | "git-write" | "secrets" | "database-read" | "database-write" | "deployment" | "dns";

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

export interface CapabilitySource {
  type: "github" | "package" | "official-registry" | "dockyard" | "website";
  locator: string;
  revisionStrategy: "bundled" | "pin-on-install" | "live-metadata-only";
  license?: string;
}

export interface Candidate {
  id: string;
  displayName: string;
  category: string;
  kind: CapabilityKind;
  trust: TrustLevel;
  capabilities: string[];
  tags: string[];
  stacks: string[];
  hosts: HostId[];
  permissions: PermissionId[];
  risk: RiskLevel;
  contextCost: ContextCost;
  maturity: number;
  maintenance: number;
  defaultChannel: UpdateChannel;
  source: CapabilitySource;
  conflictsWith?: string[];
  requires?: string[];
}

export interface ProviderDefinition {
  id: string;
  displayName: string;
  capabilities: string[];
  connectionKinds: Array<"mcp" | "api" | "cli" | "sdk">;
  tags: string[];
  requiresLiveAvailabilityCheck: boolean;
}

export interface SelectionRequest {
  taskType: string;
  stack: string[];
  capabilities: string[];
  security: SecurityLevel;
  host: HostId;
  channel: UpdateChannel;
  allowCommunity: boolean;
  maxSkills: number;
  maxAgents: number;
  maxTools: number;
  maxMcps: number;
  preferred?: string[];
  excluded?: string[];
}

export interface ScoredCandidate {
  candidate: Candidate;
  score: number;
  reasons: string[];
}

export interface TeamRecipe {
  id: string;
  displayName: string;
  taskTypes: string[];
  stacks: string[];
  capabilities: string[];
  required: string[];
  preferred: string[];
  agents: string[];
  securityLevel: SecurityLevel;
  workflowProfile: WorkflowProfile;
}

export interface SelectionResult {
  request: SelectionRequest;
  recipe?: TeamRecipe;
  skills: ScoredCandidate[];
  agents: ScoredCandidate[];
  tools: ScoredCandidate[];
  mcps: ScoredCandidate[];
  providers: ProviderDefinition[];
  securityGates: string[];
}

export interface WorkflowPlan {
  profile: WorkflowProfile;
  agents: string[];
  skills: string[];
  tools: string[];
  securityGates: string[];
  providerCandidates: string[];
}
