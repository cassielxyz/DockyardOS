import { access, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { commandExists, run } from "./process.js";
import type {
  SecurityFinding,
  SecurityRunResult,
  SecurityScanPlan,
  SecurityScannerId,
  SecuritySeverity,
  SecurityStepResult,
} from "./security-types.js";

function severity(value: unknown): SecuritySeverity {
  const normalized = String(value ?? "unknown").toLowerCase();
  if (normalized.includes("critical")) return "critical";
  if (normalized.includes("high") || normalized === "error") return "high";
  if (normalized.includes("medium") || normalized === "warning" || normalized === "warn") return "medium";
  if (normalized.includes("low")) return "low";
  if (normalized.includes("info")) return "info";
  return "unknown";
}

function safeJson(value: string): any | undefined {
  if (!value.trim()) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

async function jsonArtifact(path?: string): Promise<any | undefined> {
  if (!path) return undefined;
  try {
    await access(path);
    return safeJson(await readFile(path, "utf8"));
  } catch {
    return undefined;
  }
}

export function parseGitleaks(data: any): SecurityFinding[] {
  if (!Array.isArray(data)) return [];
  return data.map((item: any) => ({
    scanner: "gitleaks" as const,
    ...(item.RuleID ? { ruleId: String(item.RuleID) } : {}),
    title: String(item.Description ?? item.RuleID ?? "Potential secret detected"),
    severity: "high" as const,
    ...(item.File ? { file: String(item.File) } : {}),
    ...(Number.isFinite(Number(item.StartLine)) ? { line: Number(item.StartLine) } : {}),
    ...(item.Fingerprint ? { fingerprint: String(item.Fingerprint) } : {}),
    remediation: "Rotate exposed credentials if real, remove them from source/history, and store secrets in an approved secret manager.",
  }));
}

export function parseSemgrep(data: any): SecurityFinding[] {
  const results = Array.isArray(data?.results) ? data.results : [];
  return results.map((item: any) => ({
    scanner: "semgrep" as const,
    ...(item.check_id ? { ruleId: String(item.check_id) } : {}),
    title: String(item.extra?.message ?? item.check_id ?? "Static-analysis finding"),
    severity: severity(item.extra?.severity),
    ...(item.path ? { file: String(item.path) } : {}),
    ...(Number.isFinite(Number(item.start?.line)) ? { line: Number(item.start.line) } : {}),
    ...(item.extra?.fingerprint ? { fingerprint: String(item.extra.fingerprint) } : {}),
    ...(item.extra?.metadata?.fix ? { remediation: String(item.extra.metadata.fix) } : {}),
  }));
}

export function parseOsv(data: any): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const results = Array.isArray(data?.results) ? data.results : [];
  for (const result of results) {
    const packages = Array.isArray(result?.packages) ? result.packages : [];
    for (const entry of packages) {
      const pkg = entry?.package ?? {};
      const vulns = Array.isArray(entry?.vulnerabilities) ? entry.vulnerabilities : [];
      for (const vuln of vulns) {
        const advisory = String(vuln?.id ?? vuln?.aliases?.[0] ?? "OSV advisory");
        findings.push({
          scanner: "osv-scanner",
          ruleId: advisory,
          title: String(vuln?.summary ?? `${pkg.name ?? "Dependency"} has a known vulnerability`),
          severity: severity(vuln?.database_specific?.severity ?? vuln?.severity?.[0]?.score),
          ...(result?.source?.path ? { file: String(result.source.path) } : {}),
          ...(pkg?.name ? { package: String(pkg.name) } : {}),
          advisory,
          remediation: "Upgrade or replace the affected dependency using the advisory's fixed-version guidance, then rerun the dependency scan and tests.",
        });
      }
    }
  }
  return findings;
}

function timeoutFor(scanner: SecurityScannerId, mode: SecurityScanPlan["request"]["mode"]): number {
  if (scanner !== "strix") return mode === "deep" ? 20 * 60_000 : 10 * 60_000;
  if (mode === "quick") return 45 * 60_000;
  if (mode === "standard") return 120 * 60_000;
  return 4 * 60 * 60_000;
}

function parseStrixSummary(stdout: string, stderr: string): SecurityFinding[] {
  const combined = `${stdout}\n${stderr}`;
  const match = combined.match(/(?:vulnerabilit(?:y|ies)|findings?)\s*[:=]\s*(\d+)/i);
  if (!match || Number(match[1]) <= 0) return [];
  return [{
    scanner: "strix",
    title: `Strix reported ${match[1]} potential security finding(s)`,
    severity: "unknown",
    remediation: "Review the preserved Strix run artifacts for evidence, remediate verified findings, and rerun the same authorized scope.",
  }];
}

async function latestStrixRun(cwd: string): Promise<any | undefined> {
  const runsRoot = resolve(cwd, "strix_runs");
  try {
    const entries = await readdir(runsRoot, { withFileTypes: true });
    const runs: any[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const data = await jsonArtifact(resolve(runsRoot, entry.name, "run.json"));
      if (data) runs.push({ ...data, __directory: entry.name });
    }
    runs.sort((a, b) => String(b.started_at ?? b.created_at ?? b.__directory).localeCompare(String(a.started_at ?? a.created_at ?? a.__directory)));
    return runs[0];
  } catch {
    return undefined;
  }
}

async function resultForStep(plan: SecurityScanPlan, step: SecurityScanPlan["steps"][number]): Promise<SecurityStepResult> {
  const startedAt = new Date().toISOString();
  if (!commandExists(step.command)) {
    return {
      scanner: step.scanner,
      status: "skipped",
      exitCode: null,
      ...(step.artifactPath ? { artifactPath: step.artifactPath } : {}),
      findings: [],
      summary: `${step.command} is not installed or not available on PATH.`,
      startedAt,
      finishedAt: new Date().toISOString(),
    };
  }

  const executed = run(step.command, step.args, {
    cwd: step.cwd,
    timeoutMs: timeoutFor(step.scanner, plan.request.mode),
    maxOutputBytes: 128 * 1024,
  });
  const artifact = await jsonArtifact(step.artifactPath);
  let findings: SecurityFinding[] = [];
  if (step.scanner === "gitleaks") findings = parseGitleaks(artifact ?? safeJson(executed.stdout));
  else if (step.scanner === "semgrep") findings = parseSemgrep(artifact ?? safeJson(executed.stdout));
  else if (step.scanner === "osv-scanner") findings = parseOsv(artifact ?? safeJson(executed.stdout));
  else findings = parseStrixSummary(executed.stdout, executed.stderr);

  const strixRun = step.scanner === "strix" ? await latestStrixRun(step.cwd) : undefined;
  const strixIncomplete = step.scanner === "strix" && (!strixRun || String(strixRun.status ?? "").toLowerCase() !== "completed");
  const findingExit = executed.status !== null && step.findingExitCodes.includes(executed.status);
  const status = executed.timedOut || strixIncomplete || (executed.status !== 0 && !findingExit)
    ? "error"
    : findings.length || findingExit
      ? "findings"
      : "clean";

  return {
    scanner: step.scanner,
    status,
    exitCode: executed.status,
    ...(step.artifactPath ? { artifactPath: step.artifactPath } : {}),
    findings,
    summary: executed.timedOut
      ? `${step.command} exceeded the DockyardOS scan timeout.`
      : strixIncomplete
        ? `Strix did not produce a completed run.json; a budget stop or interrupted run cannot be treated as clean.`
        : status === "clean"
          ? `${step.command} completed without reported findings.`
          : status === "findings"
            ? `${step.command} reported ${findings.length || "one or more"} finding(s).`
            : `${step.command} failed: ${executed.stderr || executed.stdout || `exit ${executed.status}`}`,
    startedAt,
    finishedAt: new Date().toISOString(),
  };
}

export async function executeSecurityPlan(plan: SecurityScanPlan): Promise<SecurityRunResult> {
  const startedAt = new Date().toISOString();
  const steps: SecurityStepResult[] = [];
  for (const step of plan.steps) steps.push(await resultForStep(plan, step));

  const hasError = steps.some((step) => step.status === "error");
  const hasSkippedRequired = plan.steps.some((step, index) => step.required && steps[index]?.status === "skipped");
  const hasFindings = steps.some((step) => step.status === "findings" || step.findings.length > 0);
  const status: SecurityRunResult["status"] = hasError
    ? "error"
    : hasSkippedRequired
      ? "incomplete"
      : hasFindings
        ? "findings"
        : "clean";

  const result: SecurityRunResult = {
    runId: plan.runId,
    profile: plan.request.profile,
    target: plan.request.target,
    status,
    steps,
    gates: plan.gates,
    artifactDirectory: plan.artifactDirectory,
    startedAt,
    finishedAt: new Date().toISOString(),
  };
  await writeFile(resolve(plan.artifactDirectory, "result.json"), `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
  return result;
}

export function securityRunSummary(result: SecurityRunResult): Record<string, unknown> {
  const findings = result.steps.flatMap((step) => step.findings);
  const severityCounts = findings.reduce<Record<string, number>>((counts, finding) => {
    counts[finding.severity] = (counts[finding.severity] ?? 0) + 1;
    return counts;
  }, {});
  return {
    runId: result.runId,
    status: result.status,
    profile: result.profile,
    scanners: result.steps.map((step) => ({ scanner: step.scanner, status: step.status, findings: step.findings.length, summary: step.summary })),
    findings: findings.length,
    severities: severityCounts,
    gates: result.gates,
    artifactDirectory: result.artifactDirectory,
  };
}
