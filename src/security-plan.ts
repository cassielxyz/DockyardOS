import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import type { SecurityPlanRequest, SecurityPlanStep, SecurityScanPlan, SecurityScannerId } from "./security-types.js";
import { projectDirectory, requireProject } from "./project.js";
import { securityProfile } from "./security-profiles.js";

function sourcePath(root: string, value: string): string {
  const projectRoot = resolve(root);
  const target = resolve(projectRoot, value);
  const prefix = projectRoot.endsWith(process.platform === "win32" ? "\\" : "/") ? projectRoot : `${projectRoot}${process.platform === "win32" ? "\\" : "/"}`;
  if (target !== projectRoot && !target.startsWith(prefix)) {
    throw new Error("Source security scans are restricted to the initialized DockyardOS project root.");
  }
  return target;
}

function validateTarget(request: SecurityPlanRequest, root: string): void {
  const { target } = request;
  if (target.type === "source") {
    sourcePath(root, target.value);
    return;
  }
  if (!target.authorized) {
    throw new Error("Remote security targets require explicit authorization: set authorized=true only for systems you are permitted to test.");
  }
  if (target.type === "url") {
    let url: URL;
    try {
      url = new URL(target.value);
    } catch {
      throw new Error("Security URL target must be a valid http(s) URL.");
    }
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("Security URL target must use http or https.");
  }
}

function sourceOnly(scanner: SecurityScannerId): boolean {
  return ["gitleaks", "osv-scanner", "semgrep"].includes(scanner);
}

function stepFor(
  scanner: SecurityScannerId,
  request: SecurityPlanRequest,
  root: string,
  artifactDirectory: string,
): SecurityPlanStep | undefined {
  if (sourceOnly(scanner) && request.target.type !== "source") return undefined;
  const target = request.target.type === "source" ? sourcePath(root, request.target.value) : request.target.value;

  if (scanner === "gitleaks") {
    const artifactPath = resolve(artifactDirectory, "gitleaks.json");
    return {
      id: "secret-scan",
      scanner,
      required: true,
      command: "gitleaks",
      args: ["dir", target, "--redact=100", "--report-format", "json", "--report-path", artifactPath],
      cwd: root,
      artifactPath,
      reason: "Detect hard-coded secrets and credentials while redacting secret values from logs and reports.",
      longRunning: false,
      findingExitCodes: [1],
    };
  }

  if (scanner === "osv-scanner") {
    const artifactPath = resolve(artifactDirectory, "osv.json");
    return {
      id: "dependency-scan",
      scanner,
      required: true,
      command: "osv-scanner",
      args: ["scan", "source", "-r", target, "--format", "json", "--output-file", artifactPath],
      cwd: root,
      artifactPath,
      reason: "Check dependency manifests, lockfiles, SBOMs, and discovered packages against OSV advisories.",
      longRunning: false,
      findingExitCodes: [1],
    };
  }

  if (scanner === "semgrep") {
    const artifactPath = resolve(artifactDirectory, "semgrep.json");
    return {
      id: "static-analysis",
      scanner,
      required: true,
      command: "semgrep",
      args: ["--config=auto", "--json", "--output", artifactPath, target],
      cwd: root,
      artifactPath,
      reason: "Run Semgrep Community Edition language-aware static application-security rules over the source tree.",
      longRunning: false,
      findingExitCodes: [1],
    };
  }

  if (scanner === "strix") {
    if (!request.includeStrix) return undefined;
    if (!request.strixBudgetUsd || request.strixBudgetUsd <= 0) {
      throw new Error("Strix execution requires an explicit positive strixBudgetUsd because the configured LLM provider may incur cost.");
    }
    const scanMode = request.mode === "deep" ? "deep" : request.mode === "standard" ? "standard" : "quick";
    return {
      id: "strix-verification",
      scanner,
      required: true,
      command: "strix",
      args: ["-n", "-t", target, "--scan-mode", scanMode, "--max-budget", String(request.strixBudgetUsd)],
      cwd: artifactDirectory,
      reason: "Run an explicitly authorized Strix verification in headless mode and preserve its run artifacts outside the source repository.",
      longRunning: true,
      findingExitCodes: [2],
    };
  }

  return undefined;
}

export async function createSecurityPlan(root: string, request: SecurityPlanRequest): Promise<SecurityScanPlan> {
  const project = await requireProject(root);
  validateTarget(request, project.root);
  const profile = securityProfile(request.profile);
  const runId = `${new Date().toISOString().replace(/[-:.]/g, "")}-${randomUUID().slice(0, 8)}`;
  const artifactDirectory = resolve(projectDirectory(project.id), "security", runId);
  await mkdir(artifactDirectory, { recursive: true });

  const requested = request.scanners?.length ? request.scanners : profile.scanners;
  const unique = [...new Set(requested)];
  const steps = unique
    .map((scanner) => stepFor(scanner, request, project.root, artifactDirectory))
    .filter((step): step is SecurityPlanStep => Boolean(step));

  const gates = ["threat-model", "secret-scan", "dependency-scan", "static-analysis", "owasp-coverage", "post-fix-regression"];
  if (request.includeStrix) gates.push("strix-verification");

  return {
    runId,
    projectId: project.id,
    root: project.root,
    artifactDirectory,
    request,
    profile,
    steps,
    gates,
    createdAt: new Date().toISOString(),
  };
}

export function securityPlanSummary(plan: SecurityScanPlan): Record<string, unknown> {
  return {
    runId: plan.runId,
    profile: `${plan.profile.displayName} (${plan.profile.frameworkVersion})`,
    target: { type: plan.request.target.type, value: plan.request.target.value, authorized: plan.request.target.authorized ?? plan.request.target.type === "source" },
    controls: plan.profile.controls.map((control) => `${control.id} ${control.title}`),
    steps: plan.steps.map((step) => ({ scanner: step.scanner, required: step.required, command: step.command, args: step.args, longRunning: step.longRunning, artifactPath: step.artifactPath ?? null })),
    gates: plan.gates,
    artifactDirectory: plan.artifactDirectory,
  };
}
