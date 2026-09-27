import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { projectDirectory, requireProject } from "./project.js";
import { securityProfile } from "./security-profiles.js";
import type { SecurityProfileId, SecuritySeverity, ThreatModel, ThreatModelAsset } from "./security-types.js";

const DEFAULT_ASSETS: ThreatModelAsset[] = [
  { name: "source-code", classification: "internal", notes: "Application source, configuration, build scripts, and infrastructure definitions." },
  { name: "credentials-and-tokens", classification: "restricted", notes: "API keys, session secrets, provider credentials, signing keys, and deployment secrets." },
  { name: "user-and-business-data", classification: "confidential", notes: "User records, uploaded content, business data, and any regulated or sensitive information." },
  { name: "build-and-dependency-chain", classification: "internal", notes: "Lockfiles, packages, CI actions, release artifacts, and third-party build inputs." },
];

function impactFor(title: string): SecuritySeverity {
  const value = title.toLowerCase();
  if (/access control|authentication|credential|cryptograph|injection|ssrf|sensitive information|agency|data storage/.test(value)) return "high";
  if (/supply chain|integrity|poison|misconfiguration|privacy/.test(value)) return "high";
  return "medium";
}

function mitigations(title: string): string[] {
  const value = title.toLowerCase();
  const result = ["Apply least privilege and explicit trust boundaries.", "Add automated verification to CI and rerun it after remediation."];
  if (/access control|authorization|authentication/.test(value)) result.push("Enforce server-side authorization on every protected resource and action; test negative cases.");
  if (/credential|sensitive|data storage|privacy/.test(value)) result.push("Keep secrets and sensitive data out of source/logs, minimize retention, encrypt where appropriate, and rotate exposed credentials.");
  if (/injection|output|input/.test(value)) result.push("Use typed/parameterized interfaces, contextual encoding, validation, and allowlists at trust boundaries.");
  if (/supply chain|integrity/.test(value)) result.push("Pin trusted dependencies/actions, verify provenance, scan lockfiles, and review permission-changing updates.");
  if (/misconfiguration|exceptional/.test(value)) result.push("Use secure defaults, fail closed, minimize exposed services, and test error paths without leaking sensitive details.");
  if (/logging|alerting/.test(value)) result.push("Record security-relevant events without secrets and ensure alerts reach an actionable owner.");
  if (/resource|consumption/.test(value)) result.push("Apply quotas, rate limits, timeouts, cost budgets, and bounded concurrency.");
  if (/prompt injection|agency|hidden context|model|embedding/.test(value)) result.push("Constrain tool permissions, separate untrusted content from instructions, validate model outputs, and gate high-impact actions with human approval.");
  return [...new Set(result)];
}

function verification(title: string): string[] {
  const value = title.toLowerCase();
  const checks = ["Run DockyardOS secret, dependency, and static-analysis gates for the same revision."];
  if (/access control|authorization|authentication/.test(value)) checks.push("Add unit/integration tests for unauthorized, cross-tenant, expired-session, and privilege-escalation attempts.");
  if (/supply chain|integrity/.test(value)) checks.push("Verify dependency/advisory scans and immutable revision/content locks pass.");
  if (/injection|ssrf|misconfiguration|prompt injection|agency/.test(value)) checks.push("Use an explicitly authorized staging verification (Strix where applicable) and preserve evidence outside the source repository.");
  return checks;
}

export async function createThreatModel(
  root: string,
  profileId: SecurityProfileId,
  options: { assets?: ThreatModelAsset[]; assumptions?: string[] } = {},
): Promise<{ model: ThreatModel; path: string }> {
  const project = await requireProject(root);
  const profile = securityProfile(profileId);
  const model: ThreatModel = {
    schemaVersion: 1,
    projectId: project.id,
    profile: profileId,
    createdAt: new Date().toISOString(),
    assets: options.assets?.length ? options.assets : DEFAULT_ASSETS,
    trustBoundaries: [
      { name: "user-to-application", from: "untrusted user/client", to: "application", protections: ["authentication where required", "authorization", "input validation", "rate limiting"] },
      { name: "application-to-data", from: "application", to: "databases/storage", protections: ["least-privilege service identity", "row/object authorization", "encryption", "audit logging"] },
      { name: "application-to-third-party", from: "application", to: "external providers/APIs", protections: ["scoped credentials", "timeouts", "egress validation", "response validation"] },
      { name: "source-to-production", from: "repository/CI", to: "production", protections: ["review", "tests", "security gates", "artifact provenance", "deployment approval"] },
    ],
    assumptions: options.assumptions?.length ? options.assumptions : [
      "Only explicitly authorized systems are used for dynamic security testing.",
      "Production-destructive actions require approval even in autonomous mode.",
      "Secrets are supplied through provider/CI secret stores rather than committed files.",
    ],
    threats: profile.controls.map((control) => ({
      id: control.id,
      category: control.source,
      scenario: `${control.title} affects one or more project trust boundaries or protected assets.`,
      impact: impactFor(control.title),
      mitigations: mitigations(control.title),
      verification: verification(control.title),
    })),
  };
  const directory = resolve(projectDirectory(project.id), "security");
  await mkdir(directory, { recursive: true });
  const path = resolve(directory, `threat-model-${profileId}.json`);
  await writeFile(path, `${JSON.stringify(model, null, 2)}\n`, { mode: 0o600 });
  return { model, path };
}

export function threatModelSummary(model: ThreatModel): Record<string, unknown> {
  const impacts = model.threats.reduce<Record<string, number>>((counts, threat) => {
    counts[threat.impact] = (counts[threat.impact] ?? 0) + 1;
    return counts;
  }, {});
  return {
    profile: model.profile,
    assets: model.assets.map((asset) => ({ name: asset.name, classification: asset.classification })),
    trustBoundaries: model.trustBoundaries.map((boundary) => boundary.name),
    threats: model.threats.length,
    impacts,
  };
}
