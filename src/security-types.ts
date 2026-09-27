export type SecurityProfileId = "general" | "web" | "api" | "mobile" | "llm";
export type SecurityScannerId = "gitleaks" | "osv-scanner" | "semgrep" | "strix";
export type SecurityScanMode = "quick" | "standard" | "deep";
export type SecurityTargetType = "source" | "url" | "repository";
export type SecuritySeverity = "info" | "low" | "medium" | "high" | "critical" | "unknown";
export type SecurityStepStatus = "planned" | "clean" | "findings" | "error" | "skipped";

export interface SecurityTarget {
  type: SecurityTargetType;
  value: string;
  authorized?: boolean;
}

export interface SecurityControl {
  id: string;
  title: string;
  source: string;
  required: boolean;
}

export interface SecurityProfile {
  id: SecurityProfileId;
  displayName: string;
  frameworkVersion: string;
  controls: SecurityControl[];
  scanners: SecurityScannerId[];
  notes: string[];
}

export interface SecurityPlanRequest {
  profile: SecurityProfileId;
  target: SecurityTarget;
  mode: SecurityScanMode;
  scanners?: SecurityScannerId[];
  strixBudgetUsd?: number;
  includeStrix?: boolean;
}

export interface SecurityPlanStep {
  id: string;
  scanner: SecurityScannerId;
  required: boolean;
  command: string;
  args: string[];
  cwd: string;
  artifactPath?: string;
  reason: string;
  longRunning: boolean;
  findingExitCodes: number[];
}

export interface SecurityScanPlan {
  runId: string;
  projectId: string;
  root: string;
  artifactDirectory: string;
  request: SecurityPlanRequest;
  profile: SecurityProfile;
  steps: SecurityPlanStep[];
  gates: string[];
  createdAt: string;
}

export interface SecurityFinding {
  scanner: SecurityScannerId;
  ruleId?: string;
  title: string;
  severity: SecuritySeverity;
  file?: string;
  line?: number;
  package?: string;
  advisory?: string;
  fingerprint?: string;
  remediation?: string;
}

export interface SecurityStepResult {
  scanner: SecurityScannerId;
  status: SecurityStepStatus;
  exitCode: number | null;
  artifactPath?: string;
  findings: SecurityFinding[];
  summary: string;
  startedAt: string;
  finishedAt: string;
}

export interface SecurityRunResult {
  runId: string;
  profile: SecurityProfileId;
  target: SecurityTarget;
  status: "clean" | "findings" | "incomplete" | "error";
  steps: SecurityStepResult[];
  gates: string[];
  artifactDirectory: string;
  startedAt: string;
  finishedAt: string;
}

export interface ThreatModelAsset {
  name: string;
  classification: "public" | "internal" | "confidential" | "restricted";
  notes?: string;
}

export interface ThreatModelBoundary {
  name: string;
  from: string;
  to: string;
  protections: string[];
}

export interface ThreatModel {
  schemaVersion: 1;
  projectId: string;
  profile: SecurityProfileId;
  createdAt: string;
  assets: ThreatModelAsset[];
  trustBoundaries: ThreatModelBoundary[];
  assumptions: string[];
  threats: Array<{
    id: string;
    category: string;
    scenario: string;
    impact: SecuritySeverity;
    mitigations: string[];
    verification: string[];
  }>;
}
