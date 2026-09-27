import type { SecurityLevel, WorkflowProfile } from "./types.js";

export type TeamPhaseId = "discovery" | "architecture" | "planning" | "implementation" | "verification" | "security" | "release";
export type TeamPhaseStatus = "pending" | "active" | "completed" | "blocked" | "skipped";
export type AgentAssignmentKind = "lead" | "implementer" | "reviewer" | "specialist";
export type IsolationMode = "shared-read" | "worktree-write" | "review-only";

export interface AgentAssignment {
  agentId: string;
  kind: AgentAssignmentKind;
  isolation: IsolationMode;
  reason: string;
  required: boolean;
}

export interface TeamPhasePlan {
  id: TeamPhaseId;
  title: string;
  status: TeamPhaseStatus;
  assignments: AgentAssignment[];
  skills: string[];
  tools: string[];
  mcps: string[];
  inputs: string[];
  outputs: string[];
  gates: string[];
  parallelizable: boolean;
  maxParallelWriters: number;
}

export interface TeamCompositionRequest {
  task: string;
  taskType: string;
  stack: string[];
  security: SecurityLevel;
  workflowProfile: WorkflowProfile;
  recipeId?: string;
  selectedAgents: string[];
  selectedSkills: string[];
  selectedTools: string[];
  selectedMcps: string[];
  securityGates: string[];
}

export interface TeamComposition {
  schemaVersion: 1;
  task: string;
  taskType: string;
  stack: string[];
  security: SecurityLevel;
  workflowProfile: WorkflowProfile;
  recipeId?: string;
  phases: TeamPhasePlan[];
  contextPolicy: {
    maxActiveAgents: number;
    maxParallelWriters: number;
    handoffIncludes: string[];
    handoffExcludes: string[];
  };
}

export interface TeamPhaseRuntime {
  id: TeamPhaseId;
  status: TeamPhaseStatus;
  startedAt?: string;
  completedAt?: string;
  notes?: string;
  artifactRefs: string[];
  activeAgents: string[];
  worktrees: Array<{ taskId: string; agentId: string; branch: string; path: string }>;
}

export interface TeamRunState {
  schemaVersion: 1;
  id: string;
  projectId: string;
  task: string;
  createdAt: string;
  updatedAt: string;
  status: "active" | "blocked" | "completed" | "cancelled";
  currentPhase: TeamPhaseId;
  composition: TeamComposition;
  phases: TeamPhaseRuntime[];
  decisions: string[];
  failures: Array<{ phase: TeamPhaseId; agentId?: string; summary: string; at: string }>;
}

export interface TeamHandoff {
  runId: string;
  fromPhase?: TeamPhaseId;
  toPhase: TeamPhaseId;
  task: string;
  completedOutputs: string[];
  decisions: string[];
  unresolved: string[];
  activeAgents: string[];
  requiredGates: string[];
  instruction: string;
}

export interface WorktreePlan {
  taskId: string;
  agentId: string;
  baseRef: string;
  branch: string;
  path: string;
}
