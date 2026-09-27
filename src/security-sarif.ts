import { resolve } from "node:path";
import type { SecurityFinding, SecurityRunResult, SecuritySeverity } from "./security-types.js";
import type { SecurityPolicyEvaluation } from "./security-policy.js";
import { writeJsonAtomic } from "./fs-utils.js";

interface SarifRule {
  id: string;
  name: string;
  shortDescription: { text: string };
  properties: { scanner: string };
}

function ruleId(finding: SecurityFinding): string {
  return finding.ruleId?.trim() || `dockyard/${finding.scanner}`;
}

function sarifLevel(severity: SecuritySeverity): "error" | "warning" | "note" {
  if (severity === "critical" || severity === "high") return "error";
  if (severity === "medium" || severity === "unknown") return "warning";
  return "note";
}

function ruleName(id: string): string {
  const normalized = id.replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  return normalized.slice(0, 120) || "DockyardFinding";
}

function matchForIndex(policy: SecurityPolicyEvaluation, index: number) {
  return policy.matched.find((item) => item.findingIndex === index);
}

export function securityRunToSarif(result: SecurityRunResult, policy: SecurityPolicyEvaluation): Record<string, unknown> {
  if (policy.runId !== result.runId) throw new Error("Security policy evaluation does not belong to this security run.");
  const findings = result.steps.flatMap((step) => step.findings);
  const ruleMap = new Map<string, SarifRule>();
  for (const finding of findings) {
    const id = ruleId(finding);
    if (!ruleMap.has(id)) {
      ruleMap.set(id, {
        id,
        name: ruleName(id),
        shortDescription: { text: finding.title.slice(0, 1024) },
        properties: { scanner: finding.scanner },
      });
    }
  }

  const results = findings.map((finding, index) => {
    const accepted = matchForIndex(policy, index);
    const locations = finding.file ? [{
      physicalLocation: {
        artifactLocation: { uri: finding.file.replace(/\\/g, "/") },
        ...(finding.line ? { region: { startLine: Math.max(1, Math.trunc(finding.line)) } } : {}),
      },
    }] : undefined;
    return {
      ruleId: ruleId(finding),
      level: sarifLevel(finding.severity),
      message: { text: finding.title },
      ...(locations ? { locations } : {}),
      ...(finding.fingerprint ? { partialFingerprints: { dockyardFingerprint: finding.fingerprint } } : {}),
      ...(accepted ? {
        suppressions: [{
          kind: "external",
          status: "accepted",
          justification: `${accepted.rationale} (owner: ${accepted.owner}; exception: ${accepted.exceptionId}; expires: ${accepted.expiresAt})`,
        }],
      } : {}),
      properties: {
        scanner: finding.scanner,
        severity: finding.severity,
        ...(finding.package ? { package: finding.package } : {}),
        ...(finding.advisory ? { advisory: finding.advisory } : {}),
        ...(finding.remediation ? { remediation: finding.remediation } : {}),
        dockyardPolicyDisposition: accepted ? "accepted-risk" : "blocking",
      },
    };
  });

  const notifications = result.steps
    .filter((step) => step.status === "error" || step.status === "skipped")
    .map((step) => ({
      level: step.status === "error" ? "error" : "warning",
      message: { text: `${step.scanner}: ${step.summary}` },
      properties: { scanner: step.scanner, stepStatus: step.status },
    }));

  return {
    version: "2.1.0",
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    runs: [{
      tool: {
        driver: {
          name: "DockyardOS",
          informationUri: "https://github.com/cassielxyz/DockyardOS",
          rules: [...ruleMap.values()],
        },
      },
      invocations: [{
        executionSuccessful: result.status !== "error" && result.status !== "incomplete",
        ...(notifications.length ? { toolExecutionNotifications: notifications } : {}),
        properties: {
          dockyardRunId: result.runId,
          dockyardRunStatus: result.status,
          dockyardPolicyGate: policy.gate,
          rawFindingCount: policy.rawFindingCount,
          acceptedFindingCount: policy.acceptedFindingCount,
          blockingFindingCount: policy.blockingFindingCount,
        },
      }],
      results,
      properties: {
        dockyardProfile: result.profile,
        dockyardTargetType: result.target.type,
        dockyardPolicyGate: policy.gate,
        expiredExceptionIds: policy.expiredExceptionIds,
      },
    }],
  };
}

export async function exportSecuritySarif(result: SecurityRunResult, policy: SecurityPolicyEvaluation, outputPath?: string): Promise<{ path: string; sarif: Record<string, unknown> }> {
  const target = outputPath ? resolve(outputPath) : resolve(result.artifactDirectory, "dockyard.sarif");
  if (outputPath && !target.startsWith(resolve(result.artifactDirectory))) {
    throw new Error("Security SARIF output must stay inside the security run artifact directory.");
  }
  const sarif = securityRunToSarif(result, policy);
  await writeJsonAtomic(target, sarif);
  return { path: target, sarif };
}
