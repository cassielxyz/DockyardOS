import type { HostId } from "./types.js";

export type DockyardHostId = HostId | "vscode";
export type HostIntegrationMode = "native-hooks" | "extension" | "plugin" | "instructions" | "rules" | "agents";
export type HostReadiness = "unavailable" | "installed" | "integration-available" | "ready";

export interface HostAdapterDefinition {
  id: DockyardHostId;
  displayName: string;
  command?: string;
  integrationDirectory: string;
  integrationMode: HostIntegrationMode;
  capabilities: string[];
  installHint: string;
  verifyHint: string;
  notes: string[];
}

export interface HostProbeResult {
  id: DockyardHostId;
  displayName: string;
  installed: boolean;
  integrationAvailable: boolean;
  readiness: HostReadiness;
  integrationDirectory: string;
  installHint: string;
  verifyHint: string;
  notes: string[];
}

export interface PortableHostContext {
  schemaVersion: 1;
  host: DockyardHostId;
  project: {
    id: string;
    name: string;
    root: string;
    mode: string;
  };
  checkpoint?: {
    id: string;
    createdAt: string;
    reason: string;
    phase?: string;
    activeTask?: string;
    completed: string[];
    blocked: string[];
    next: string[];
    capabilities: string[];
    git: {
      branch?: string;
      head?: string;
      dirty: boolean;
    };
  };
  team?: {
    id: string;
    status: string;
    currentPhase: string;
    activeAgents: string[];
    gates: string[];
    expectedOutputs: string[];
    worktrees: Array<{ taskId: string; agentId: string; branch: string; path: string }>;
    recentDecisions: string[];
    failures: Array<{ phase: string; agentId?: string; summary: string; at: string }>;
  };
  instructions: string[];
  generatedAt: string;
}
