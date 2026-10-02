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
export type ProviderReadiness = "unavailable" | "installed" | "configured" | "authenticated" | "linked" | "degraded" | "unknown";
export type ProviderEnvironment = "local" | "preview" | "production";
export type CostPreference = "free-first" | "balanced" | "performance";

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
  teamRunId?: string;
  teamPhase?: string;
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

export interface ProviderCommandProbe {
  command: string;
  args: string[];
  successReadiness: ProviderReadiness;
  timeoutMs?: number;
  fallback?: {
    command: string;
    args: string[];
  };
}

export interface ProviderSecureCredentialProbe {
  envVars: string[];
  validationUrl: string;
  header: string;
  successReadiness: ProviderReadiness;
  timeoutMs?: number;
}

export interface ProviderAdapterDefinition {
  id: string;
  displayName: string;
  cliCommands: string[];
  configMarkers: string[];
  linkedMarkers?: string[];
  secureCredentialProbe?: ProviderSecureCredentialProbe;
  authProbe?: ProviderCommandProbe;
  statusProbe?: ProviderCommandProbe;
  capabilities: string[];
  environments: ProviderEnvironment[];
  freeTierCheck: "live-required" | "not-applicable";
  notes?: string[];
}

export interface ProviderProbeSignal {
  type: "cli" | "config" | "credential" | "linked" | "auth" | "status";
  ok: boolean;
  detail: string;
}

export interface ProviderProbeResult {
  providerId: string;
  displayName: string;
  readiness: ProviderReadiness;
  installed: boolean;
  configured: boolean;
  authenticated?: boolean;
  linked?: boolean;
  liveChecked: boolean;
  signals: ProviderProbeSignal[];
  safeSummary?: string;
}

export interface ProviderRequirement {
  capability: string;
  required: boolean;
  preferredProviders?: string[];
}

export interface ProviderPlanRequest {
  stack: string[];
  requirements: ProviderRequirement[];
  environment: ProviderEnvironment;
  costPreference: CostPreference;
  live: boolean;
  preferredProviders?: string[];
  excludedProviders?: string[];
}

export interface ProviderPlanCandidate {
  provider: ProviderDefinition;
  readiness: ProviderReadiness;
  score: number;
  reasons: string[];
  capabilities: string[];
  liveAvailabilityCheckRequired: boolean;
  livePricingCheckRequired: boolean;
}

export interface ProviderCapabilityPlan {
  capability: string;
  required: boolean;
  selected?: ProviderPlanCandidate;
  fallbacks: ProviderPlanCandidate[];
  compatibilityNotes: string[];
}

export interface ProviderPlan {
  request: ProviderPlanRequest;
  probes: ProviderProbeResult[];
  capabilities: ProviderCapabilityPlan[];
  unresolved: string[];
  requiresApprovalBeforeProductionMutation: boolean;
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