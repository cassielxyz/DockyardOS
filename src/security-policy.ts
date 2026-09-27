import { resolve } from "node:path";
import type { SecurityFinding, SecurityRunResult } from "./security-types.js";
import { readJson, writeJsonAtomic } from "./fs-utils.js";
import { projectDirectory, projectIdForRoot } from "./project.js";

export type SecurityExceptionKind = "secret-baseline" | "dependency-exception";

interface SecurityExceptionBase {
  id: string;
  kind: SecurityExceptionKind;
  owner: string;
  rationale: string;
  createdAt: string;
  expiresAt: string;
}

export interface SecretBaselineException extends SecurityExceptionBase {
  kind: "secret-baseline";
  scanner: "gitleaks";
  fingerprint: string;
}

export interface DependencyException extends SecurityExceptionBase {
  kind: "dependency-exception";
  scanner: "osv-scanner";
  advisory: string;
  package: string;
}

export type SecurityPolicyException = SecretBaselineException | DependencyException;

export interface SecurityPolicyFile {
  schemaVersion: 1;
  projectId: string;
  updatedAt: string;
  exceptions: SecurityPolicyException[];
}

export interface SecurityPolicyMatch {
  exceptionId: string;
  kind: SecurityExceptionKind;
  scanner: SecurityFinding["scanner"];
  findingIndex: number;
  fingerprint?: string;
  advisory?: string;
  package?: string;
  owner: string;
  rationale: string;
  expiresAt: string;
}

export interface SecurityPolicyEvaluation {
  schemaVersion: 1;
  projectId: string;
  runId: string;
  runStatus: SecurityRunResult["status"];
  gate: "pass" | "accepted-risk" | "fail" | "incomplete";
  evaluatedAt: string;
  activeExceptionIds: string[];
  expiredExceptionIds: string[];
  matched: SecurityPolicyMatch[];
  unmatchedActiveExceptionIds: string[];
  rawFindingCount: number;
  acceptedFindingCount: number;
  blockingFindingCount: number;
  blockingFindingIndexes: number[];
  reasons: string[];
  policyPath: string;
  reportPath: string;
}

const ID = /^[a-z0-9][a-z0-9._-]{1,79}$/;
const OWNER = /^[A-Za-z0-9][A-Za-z0-9._@+/-]{0,127}$/;
const ADVISORY = /^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$/;
const PACKAGE = /^[A-Za-z0-9@][A-Za-z0-9@._/+:-]{0,255}$/;
const MAX_EXCEPTION_LIFETIME_MS = 365 * 24 * 60 * 60 * 1000;

function policyPath(root: string): string {
  return resolve(projectDirectory(projectIdForRoot(root)), "security", "policy.json");
}

function reportPath(root: string, runId: string): string {
  return resolve(projectDirectory(projectIdForRoot(root)), "security", "runs", runId, "policy-report.json");
}

function boundedText(value: string, label: string, max: number): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max || /[\u0000-\u001f\u007f]/.test(trimmed)) throw new Error(`${label} is empty, too long, or contains control characters.`);
  return trimmed;
}

function validateMetadata(input: { id: string; owner: string; rationale: string; expiresAt: string }, now = new Date()): {
  id: string;
  owner: string;
  rationale: string;
  expiresAt: string;
} {
  const id = input.id.trim();
  if (!ID.test(id)) throw new Error("Security exception id must be 2-80 lowercase letters/numbers/dot/underscore/hyphen.");
  const owner = input.owner.trim();
  if (!OWNER.test(owner)) throw new Error("Security exception owner contains unsupported characters.");
  const rationale = boundedText(input.rationale, "Security exception rationale", 1000);
  if (rationale.length < 8) throw new Error("Security exception rationale must contain at least 8 characters.");
  const expiryMs = Date.parse(input.expiresAt);
  if (!Number.isFinite(expiryMs)) throw new Error("Security exception expiresAt must be a valid ISO timestamp.");
  const nowMs = now.getTime();
  if (expiryMs <= nowMs) throw new Error("Security exception expiry must be in the future.");
  if (expiryMs - nowMs > MAX_EXCEPTION_LIFETIME_MS) throw new Error("Security exception lifetime cannot exceed 365 days.");
  return { id, owner, rationale, expiresAt: new Date(expiryMs).toISOString() };
}

function validatePolicy(policy: SecurityPolicyFile): void {
  if (policy.schemaVersion !== 1 || !Array.isArray(policy.exceptions)) throw new Error("Invalid DockyardOS security policy file.");
  const ids = new Set<string>();
  for (const exception of policy.exceptions) {
    if (!ID.test(exception.id) || ids.has(exception.id)) throw new Error(`Invalid/duplicate security exception id: ${exception.id}`);
    ids.add(exception.id);
    if (!OWNER.test(exception.owner) || !exception.rationale?.trim() || !Number.isFinite(Date.parse(exception.expiresAt))) throw new Error(`Security exception metadata is invalid: ${exception.id}`);
    if (exception.kind === "secret-baseline") {
      if (exception.scanner !== "gitleaks" || !exception.fingerprint?.trim()) throw new Error(`Secret baseline is invalid: ${exception.id}`);
    } else if (exception.kind === "dependency-exception") {
      if (exception.scanner !== "osv-scanner" || !ADVISORY.test(exception.advisory) || !PACKAGE.test(exception.package)) throw new Error(`Dependency exception is invalid: ${exception.id}`);
    } else {
      throw new Error(`Unknown security exception kind: ${(exception as SecurityPolicyException).kind}`);
    }
  }
}

export async function loadSecurityPolicy(root: string): Promise<SecurityPolicyFile> {
  const projectId = projectIdForRoot(root);
  const existing = await readJson<SecurityPolicyFile>(policyPath(root));
  if (!existing) return { schemaVersion: 1, projectId, updatedAt: new Date().toISOString(), exceptions: [] };
  validatePolicy(existing);
  if (existing.projectId !== projectId) throw new Error("Security policy project identity does not match the current project.");
  return existing;
}

async function saveSecurityPolicy(root: string, policy: SecurityPolicyFile): Promise<SecurityPolicyFile> {
  const next: SecurityPolicyFile = { ...policy, projectId: projectIdForRoot(root), updatedAt: new Date().toISOString() };
  validatePolicy(next);
  await writeJsonAtomic(policyPath(root), next);
  return next;
}

async function addException(root: string, exception: SecurityPolicyException): Promise<SecurityPolicyFile> {
  const policy = await loadSecurityPolicy(root);
  if (policy.exceptions.some((item) => item.id === exception.id)) throw new Error(`Security exception id already exists: ${exception.id}`);
  return saveSecurityPolicy(root, { ...policy, exceptions: [...policy.exceptions, exception] });
}

export async function addSecretBaseline(root: string, input: {
  id: string;
  fingerprint: string;
  owner: string;
  rationale: string;
  expiresAt: string;
}): Promise<SecurityPolicyFile> {
  const metadata = validateMetadata(input);
  const fingerprint = boundedText(input.fingerprint, "Gitleaks fingerprint", 512);
  const now = new Date().toISOString();
  return addException(root, {
    ...metadata,
    kind: "secret-baseline",
    scanner: "gitleaks",
    fingerprint,
    createdAt: now,
  });
}

export async function addDependencyException(root: string, input: {
  id: string;
  advisory: string;
  package: string;
  owner: string;
  rationale: string;
  expiresAt: string;
}): Promise<SecurityPolicyFile> {
  const metadata = validateMetadata(input);
  const advisory = input.advisory.trim();
  const packageName = input.package.trim();
  if (!ADVISORY.test(advisory)) throw new Error("Dependency advisory id contains unsupported characters.");
  if (!PACKAGE.test(packageName)) throw new Error("Dependency package name contains unsupported characters.");
  const now = new Date().toISOString();
  return addException(root, {
    ...metadata,
    kind: "dependency-exception",
    scanner: "osv-scanner",
    advisory,
    package: packageName,
    createdAt: now,
  });
}

export async function removeSecurityException(root: string, id: string): Promise<SecurityPolicyFile> {
  const policy = await loadSecurityPolicy(root);
  if (!policy.exceptions.some((item) => item.id === id)) throw new Error(`Security exception not found: ${id}`);
  return saveSecurityPolicy(root, { ...policy, exceptions: policy.exceptions.filter((item) => item.id !== id) });
}

function findingMatches(exception: SecurityPolicyException, finding: SecurityFinding): boolean {
  if (exception.kind === "secret-baseline") {
    return finding.scanner === "gitleaks" && Boolean(finding.fingerprint) && finding.fingerprint === exception.fingerprint;
  }
  return finding.scanner === "osv-scanner"
    && Boolean(finding.advisory)
    && Boolean(finding.package)
    && finding.advisory!.toLowerCase() === exception.advisory.toLowerCase()
    && finding.package!.toLowerCase() === exception.package.toLowerCase();
}

export async function evaluateSecurityPolicy(root: string, result: SecurityRunResult, options: { persist?: boolean; now?: Date } = {}): Promise<SecurityPolicyEvaluation> {
  const policy = await loadSecurityPolicy(root);
  const now = options.now ?? new Date();
  const nowMs = now.getTime();
  const active = policy.exceptions.filter((item) => Date.parse(item.expiresAt) > nowMs);
  const expired = policy.exceptions.filter((item) => Date.parse(item.expiresAt) <= nowMs);
  const findings = result.steps.flatMap((step) => step.findings);
  const matched: SecurityPolicyMatch[] = [];
  const acceptedIndexes = new Set<number>();
  const matchedExceptionIds = new Set<string>();

  findings.forEach((finding, findingIndex) => {
    const exception = active.find((item) => findingMatches(item, finding));
    if (!exception) return;
    acceptedIndexes.add(findingIndex);
    matchedExceptionIds.add(exception.id);
    matched.push({
      exceptionId: exception.id,
      kind: exception.kind,
      scanner: finding.scanner,
      findingIndex,
      ...(finding.fingerprint ? { fingerprint: finding.fingerprint } : {}),
      ...(finding.advisory ? { advisory: finding.advisory } : {}),
      ...(finding.package ? { package: finding.package } : {}),
      owner: exception.owner,
      rationale: exception.rationale,
      expiresAt: exception.expiresAt,
    });
  });

  const blockingFindingIndexes = findings.map((_, index) => index).filter((index) => !acceptedIndexes.has(index));
  const reasons: string[] = [];
  let gate: SecurityPolicyEvaluation["gate"];
  if (result.status === "error" || result.status === "incomplete") {
    gate = "incomplete";
    reasons.push(`raw scan status is ${result.status}; policy exceptions cannot convert an incomplete/error scan into success`);
  } else if (blockingFindingIndexes.length) {
    gate = "fail";
    reasons.push(`${blockingFindingIndexes.length} unexcepted finding(s) remain`);
  } else if (findings.length) {
    gate = "accepted-risk";
    reasons.push(`${findings.length} finding(s) matched active, owned, expiring exceptions; raw findings remain preserved`);
  } else {
    gate = "pass";
    reasons.push("raw scan completed without findings");
  }
  if (expired.length) reasons.push(`${expired.length} expired exception(s) no longer match findings`);

  const evaluation: SecurityPolicyEvaluation = {
    schemaVersion: 1,
    projectId: projectIdForRoot(root),
    runId: result.runId,
    runStatus: result.status,
    gate,
    evaluatedAt: now.toISOString(),
    activeExceptionIds: active.map((item) => item.id).sort(),
    expiredExceptionIds: expired.map((item) => item.id).sort(),
    matched,
    unmatchedActiveExceptionIds: active.filter((item) => !matchedExceptionIds.has(item.id)).map((item) => item.id).sort(),
    rawFindingCount: findings.length,
    acceptedFindingCount: acceptedIndexes.size,
    blockingFindingCount: blockingFindingIndexes.length,
    blockingFindingIndexes,
    reasons,
    policyPath: policyPath(root),
    reportPath: reportPath(root, result.runId),
  };
  if (options.persist !== false) await writeJsonAtomic(evaluation.reportPath, evaluation);
  return evaluation;
}
