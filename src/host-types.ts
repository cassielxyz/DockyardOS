import type { HostId } from "./types.js";

export type HostScope = "project" | "user" | "runtime";
export type HostFeature = "skills" | "plugins" | "extensions" | "mcp" | "hooks" | "subagents" | "rules" | "commands" | "project-instructions" | "resume";
export type HostInstallStrategy = "copy-skill" | "copy-plugin" | "cli-extension" | "runtime-capability-directory" | "instructions-only" | "unsupported";

export interface HostSkillLocation {
  scope: HostScope;
  path?: string;
  strategy: HostInstallStrategy;
  commandTemplate?: string[];
  note?: string;
}

export interface HostAdapterDefinition {
  id: HostId;
  displayName: string;
  executable?: string;
  features: HostFeature[];
  preferredSkillLocations: HostSkillLocation[];
  projectInstructionFiles: string[];
  supportsNativeResume: boolean;
  supportsDockyardHooks: boolean;
  notes: string[];
  verifiedAgainst: {
    date: string;
    source: string;
  }[];
}

export interface HostInspection {
  host: HostId;
  displayName: string;
  executableAvailable: boolean;
  projectSignals: Array<{ path: string; exists: boolean }>;
  globalSignals: Array<{ path: string; exists: boolean }>;
  nativeResumeAvailable: boolean;
  features: HostFeature[];
}

export interface HostInstallAction {
  type: "create-directory" | "copy-skill" | "copy-plugin" | "run-command" | "write-instructions" | "manual";
  scope: HostScope;
  destination?: string;
  command?: string[];
  reason: string;
  requiresApproval: boolean;
}

export interface HostInstallPlan {
  host: HostId;
  workspaceRoot: string;
  actions: HostInstallAction[];
  sharedState: {
    dockyardHome: string;
    projectStateIsHostIndependent: true;
  };
  warnings: string[];
}
