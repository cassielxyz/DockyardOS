import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { SecurityFinding, SecurityRunResult, SecuritySeverity } from "./security-types.js";

export interface SecurityRegressionReport {
  schemaVersion: 1;
  beforeRunId: string;
  afterRunId: string;
  createdAt: string;
  fixed: SecurityFinding[];
  remaining: SecurityFinding[];
  introduced: SecurityFinding[];
  beforeCount: number;
  afterCount: number;
  gate: "pass" | "fail";
  reasons: string[];
}

const SEVERITY_RANK: Record<SecuritySeverity, number> = { unknown: 0, info: 1, low: 2, medium: 3, high: 4, critical: 5 };

function findings(run: SecurityRunResult): SecurityFinding[] {
  return run.steps.flatMap((step) => step.findings);
}

function key(finding: SecurityFinding): string {
  if (finding.fingerprint) return `${finding.scanner}:fingerprint:${finding.fingerprint}`;
  return [
    finding.scanner,
    finding.ruleId ?? "",
    finding.file ?? "",
    finding.line ?? "",
    finding.package ?? "",
    finding.advisory ?? "",
    finding.title,
  ].join(":").toLowerCase();
}

export function compareSecurityRuns(before: SecurityRunResult, after: SecurityRunResult): SecurityRegressionReport {
  if (before.profile !== after.profile) throw new Error("Security regression comparison requires the same security profile.");
  if (before.target.type !== after.target.type || before.target.value !== after.target.value) {
    throw new Error("Security regression comparison requires the same target and scope.");
  }

  const beforeFindings = findings(before);
  const afterFindings = findings(after);
  const beforeMap = new Map(beforeFindings.map((finding) => [key(finding), finding]));
  const afterMap = new Map(afterFindings.map((finding) => [key(finding), finding]));
  const fixed = beforeFindings.filter((finding) => !afterMap.has(key(finding)));
  const remaining = afterFindings.filter((finding) => beforeMap.has(key(finding)));
  const introduced = afterFindings.filter((finding) => !beforeMap.has(key(finding)));
  const blockingIntroduced = introduced.filter((finding) => SEVERITY_RANK[finding.severity] >= SEVERITY_RANK.high);
  const blockingRemaining = remaining.filter((finding) => SEVERITY_RANK[finding.severity] >= SEVERITY_RANK.high);
  const reasons: string[] = [];
  if (blockingRemaining.length) reasons.push(`${blockingRemaining.length} high/critical finding(s) remain after remediation.`);
  if (blockingIntroduced.length) reasons.push(`${blockingIntroduced.length} new high/critical finding(s) were introduced.`);
  if (after.status === "error" || after.status === "incomplete") reasons.push(`Rerun status is ${after.status}; verification is not complete.`);
  if (!reasons.length) reasons.push("No high/critical regression remains or was introduced in the normalized rerun findings.");

  return {
    schemaVersion: 1,
    beforeRunId: before.runId,
    afterRunId: after.runId,
    createdAt: new Date().toISOString(),
    fixed,
    remaining,
    introduced,
    beforeCount: beforeFindings.length,
    afterCount: afterFindings.length,
    gate: reasons.length === 1 && reasons[0]!.startsWith("No high/critical") ? "pass" : "fail",
    reasons,
  };
}

export async function loadSecurityRun(path: string): Promise<SecurityRunResult> {
  const raw = JSON.parse(await readFile(path, "utf8"));
  if (!raw?.runId || !raw?.profile || !Array.isArray(raw?.steps)) throw new Error(`Invalid DockyardOS security result: ${path}`);
  return raw as SecurityRunResult;
}

export async function compareSecurityResultFiles(beforePath: string, afterPath: string): Promise<{ report: SecurityRegressionReport; path: string }> {
  const before = await loadSecurityRun(beforePath);
  const after = await loadSecurityRun(afterPath);
  const report = compareSecurityRuns(before, after);
  const path = resolve(after.artifactDirectory, "regression.json");
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  return { report, path };
}
