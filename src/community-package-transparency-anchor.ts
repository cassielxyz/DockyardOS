import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { maintainerObjectSha256, type MaintainerReview } from "./community-maintainer.js";
import { readTransparencyLog, verifyTransparencyLog } from "./community-transparency.js";
import { writeJsonAtomic } from "./fs-utils.js";
import { dockyardHome } from "./project.js";
import { commandExists, run, type ProcessResult } from "./process.js";

const SAFE_ID = /^[a-z0-9][a-z0-9._-]{1,79}$/;
const REVIEWER = /^[A-Za-z0-9][A-Za-z0-9._@+/-]{1,127}$/;
const GITHUB_REPOSITORY = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const SAFE_BRANCH = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const GIT_OBJECT_SHA = /^[a-f0-9]{40}$/i;
const CANONICAL_BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const GITHUB_API_VERSION = "2026-03-10";
const MAX_LOCAL_LOG_BYTES = 8 * 1024 * 1024;
const MAX_PUBLIC_ANCHOR_BYTES = 128 * 1024;

export type PackageTransparencyAnchorGhExecutor = (args: string[]) => ProcessResult;

export interface PackageTransparencyAnchorInput {
  anchorId: string;
  repository: string;
  branch: string;
  reviewedBy: string;
  rationale: string;
  reviewedAt?: string;
}

export interface PublicPackageTransparencyAnchorRecord {
  schemaVersion: 1;
  kind: "dockyard-community-package-action-anchor";
  anchorId: string;
  chainSchemaVersion: 1;
  records: number;
  headRecordHash: string;
  transparencyLogSha256: string;
}

export interface PackageTransparencyAnchorRemoteState {
  exists: boolean;
  blobSha?: string;
  contentSha256?: string;
}

export interface PackageTransparencyAnchorPlan {
  schemaVersion: 1;
  operation: "package-action-transparency-anchor";
  review: MaintainerReview;
  local: {
    transparencyPath: string;
    transparencyLogSha256: string;
    records: number;
    headRecordHash: string;
  };
  anchorRecord: PublicPackageTransparencyAnchorRecord;
  anchorSha256: string;
  target: {
    provider: "github";
    repository: string;
    branch: string;
    path: string;
    public: true;
  };
  remote: PackageTransparencyAnchorRemoteState;
  alreadyAnchored: boolean;
  approvalSha256: string;
  approvalRequired: true;
  notes: string[];
}

export interface PackageTransparencyAnchorResult {
  schemaVersion: 1;
  operation: "package-action-transparency-anchor";
  status: "complete" | "already-anchored" | "anchored-unverified";
  anchorId: string;
  records: number;
  headRecordHash: string;
  transparencyLogSha256: string;
  anchorSha256: string;
  repository: string;
  branch: string;
  path: string;
  blobSha?: string;
  commitSha?: string;
  auditPath: string;
  verificationError?: string;
}

interface LocalTransparencyEvidence {
  path: string;
  bytes: Buffer;
  sha256: string;
  records: number;
  headRecordHash: string;
}

interface GitHubContentResponse {
  type?: unknown;
  encoding?: unknown;
  content?: unknown;
  size?: unknown;
  sha?: unknown;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function validateId(label: string, value: string): string {
  const result = value.trim();
  if (!SAFE_ID.test(result)) throw new Error(`${label} must be 2-80 lowercase letters/numbers/dot/underscore/hyphen.`);
  return result;
}

function canonicalIso(label: string, value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) throw new Error(`${label} must be a canonical ISO timestamp.`);
  return value;
}

function validateReview(input: PackageTransparencyAnchorInput, now = new Date()): MaintainerReview {
  if (!Number.isFinite(now.getTime())) throw new Error("Transparency anchor review timestamp is invalid.");
  const reviewedAt = input.reviewedAt ? canonicalIso("--reviewed-at", input.reviewedAt) : now.toISOString();
  const reviewedBy = input.reviewedBy.trim();
  const rationale = input.rationale.trim();
  if (!REVIEWER.test(reviewedBy)) throw new Error("Transparency anchor reviewer identity contains unsupported characters or is too short.");
  if (rationale.length < 12 || rationale.length > 1000 || /[\u0000-\u001f\u007f]/.test(rationale)) {
    throw new Error("Transparency anchor rationale must be 12-1000 printable characters.");
  }
  return { reviewedBy, rationale, reviewedAt };
}

function validateRepository(value: string): string {
  const repository = value.trim();
  if (!GITHUB_REPOSITORY.test(repository) || repository.includes("..") || repository.endsWith(".git")) {
    throw new Error("Transparency anchor repository must be an explicit OWNER/REPO identifier without .git.");
  }
  return repository;
}

function validateBranch(value: string): string {
  const branch = value.trim();
  if (!SAFE_BRANCH.test(branch)
    || branch.startsWith("-")
    || branch.includes("..")
    || branch.includes("//")
    || branch.includes("@{")
    || branch.endsWith("/")
    || branch.endsWith(".")
    || branch.endsWith(".lock")) {
    throw new Error("Transparency anchor branch is not a safe Git branch name.");
  }
  return branch;
}

function inside(base: string, target: string): boolean {
  const rel = relative(base, target);
  return Boolean(rel) && !rel.startsWith("..") && !isAbsolute(rel);
}

function communityRoot(): string {
  return resolve(dockyardHome(), "community");
}

function transparencyPath(): string {
  return resolve(communityRoot(), "transparency.json");
}

function anchorTargetPath(anchorId: string, records: number, headRecordHash: string): string {
  return `dockyard-transparency/package-actions/${anchorId}/${String(records).padStart(12, "0")}-${headRecordHash}.json`;
}

function auditPath(anchorId: string, records: number, headRecordHash: string): string {
  return resolve(
    communityRoot(),
    "package-action-anchors",
    anchorId,
    `${String(records).padStart(12, "0")}-${headRecordHash}.audit.json`,
  );
}

async function loadLocalTransparencyEvidence(): Promise<LocalTransparencyEvidence> {
  const root = communityRoot();
  let rootStat;
  try {
    rootStat = await lstat(root);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error("No local community transparency history exists to anchor.");
    throw error;
  }
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error("DockyardOS community state must be a real non-symlink directory before public anchoring.");

  const target = transparencyPath();
  let stat;
  try {
    stat = await lstat(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error("No local package-action transparency log exists to anchor.");
    throw error;
  }
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Local community transparency log must be a real regular non-symlink file.");
  if (stat.size < 1 || stat.size > MAX_LOCAL_LOG_BYTES) throw new Error(`Local community transparency log must be 1-${MAX_LOCAL_LOG_BYTES} bytes.`);
  const [resolvedRoot, resolvedTarget] = await Promise.all([realpath(root), realpath(target)]);
  if (!inside(resolvedRoot, resolvedTarget)) throw new Error("Local community transparency log resolves outside DockyardOS community state.");

  const bytes = await readFile(resolvedTarget);
  let parsed: { schemaVersion?: unknown; records?: unknown[] };
  try {
    parsed = JSON.parse(bytes.toString("utf8")) as { schemaVersion?: unknown; records?: unknown[] };
  } catch {
    throw new Error("Local community transparency log is not valid JSON.");
  }
  if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.records) || parsed.records.length < 1) {
    throw new Error("Local community transparency log must contain at least one package-action record.");
  }

  const verification = await verifyTransparencyLog();
  if (!verification.ok || !verification.head) {
    throw new Error(`Local community transparency chain is invalid: ${verification.errors.join("; ") || "missing chain head"}`);
  }
  const current = await readTransparencyLog();
  if (current.records.length !== parsed.records.length || current.records.at(-1)?.recordHash !== verification.head) {
    throw new Error("Local community transparency log changed while it was being verified; retry the anchor plan.");
  }
  const reread = await readFile(resolvedTarget);
  if (sha256(reread) !== sha256(bytes)) throw new Error("Local community transparency log changed while it was being hashed; retry the anchor plan.");

  return {
    path: resolvedTarget,
    bytes,
    sha256: sha256(bytes),
    records: parsed.records.length,
    headRecordHash: verification.head,
  };
}

function publicBytes(record: PublicPackageTransparencyAnchorRecord): Buffer {
  return Buffer.from(`${JSON.stringify(record, null, 2)}\n`, "utf8");
}

function defaultGh(root: string): PackageTransparencyAnchorGhExecutor {
  if (!commandExists("gh")) throw new Error("Public package-action transparency anchoring requires the authenticated GitHub CLI (`gh`).");
  return (args) => run("gh", [
    "api",
    "-H", "Accept: application/vnd.github+json",
    "-H", `X-GitHub-Api-Version: ${GITHUB_API_VERSION}`,
    ...args,
  ], { cwd: root, timeoutMs: 45_000, maxOutputBytes: 256 * 1024 });
}

function parseObject(value: string, label: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    // handled below
  }
  throw new Error(`${label} did not return a valid JSON object.`);
}

function isNotFound(result: ProcessResult): boolean {
  return result.status === 1 && /(?:HTTP\s+404|not found)/i.test(`${result.stderr}\n${result.stdout}`);
}

function contentEndpoint(repository: string, path: string, branch: string): string {
  return `/repos/${repository}/contents/${path}?ref=${encodeURIComponent(branch)}`;
}

function decodeGitHubContent(object: GitHubContentResponse): { bytes: Buffer; blobSha: string } {
  if (object.type !== "file" || object.encoding !== "base64" || typeof object.content !== "string" || typeof object.sha !== "string" || !GIT_OBJECT_SHA.test(object.sha)) {
    throw new Error("Existing public transparency anchor response is malformed or not a file.");
  }
  const compact = object.content.replace(/\s+/g, "");
  if (!compact || !CANONICAL_BASE64.test(compact)) throw new Error("Existing public transparency anchor contains malformed Base64.");
  const bytes = Buffer.from(compact, "base64");
  if (bytes.length > MAX_PUBLIC_ANCHOR_BYTES) throw new Error("Existing public transparency anchor exceeds the safety size bound.");
  if (typeof object.size === "number" && object.size !== bytes.length) throw new Error("Existing public transparency anchor size metadata does not match decoded bytes.");
  return { bytes, blobSha: object.sha.toLowerCase() };
}

function verifyPublicRepository(gh: PackageTransparencyAnchorGhExecutor, repository: string, branch: string): void {
  const repoResult = gh(["--method", "GET", `/repos/${repository}`]);
  if (!repoResult.ok) throw new Error(`Could not verify public transparency repository: ${repoResult.stderr || repoResult.stdout}`);
  const repo = parseObject(repoResult.stdout, "GitHub repository lookup");
  if (repo.private !== false || repo.archived === true || repo.disabled === true) {
    throw new Error("Transparency anchor repository must be publicly readable, enabled, and non-archived.");
  }
  if (typeof repo.full_name === "string" && repo.full_name.toLowerCase() !== repository.toLowerCase()) {
    throw new Error("GitHub repository identity does not match the requested transparency repository.");
  }
  const branchResult = gh(["--method", "GET", `/repos/${repository}/branches/${encodeURIComponent(branch)}`]);
  if (!branchResult.ok) throw new Error(`Could not verify transparency anchor branch: ${branchResult.stderr || branchResult.stdout}`);
}

function loadRemoteState(
  gh: PackageTransparencyAnchorGhExecutor,
  repository: string,
  path: string,
  branch: string,
  expectedBytes: Buffer,
): PackageTransparencyAnchorRemoteState {
  const result = gh(["--method", "GET", contentEndpoint(repository, path, branch)]);
  if (!result.ok) {
    if (isNotFound(result)) return { exists: false };
    throw new Error(`Could not inspect existing public transparency anchor: ${result.stderr || result.stdout}`);
  }
  const content = decodeGitHubContent(parseObject(result.stdout, "GitHub content lookup") as GitHubContentResponse);
  const digest = sha256(content.bytes);
  if (!content.bytes.equals(expectedBytes)) throw new Error("The derived public package-action anchor path already exists with different bytes; refusing to overwrite it.");
  return { exists: true, blobSha: content.blobSha, contentSha256: digest };
}

function approvalMaterial(plan: Omit<PackageTransparencyAnchorPlan, "approvalSha256" | "approvalRequired" | "notes">): unknown {
  return {
    operation: plan.operation,
    review: plan.review,
    local: plan.local,
    anchorRecord: plan.anchorRecord,
    anchorSha256: plan.anchorSha256,
    target: plan.target,
    remote: plan.remote,
    alreadyAnchored: plan.alreadyAnchored,
  };
}

export async function planPackageTransparencyAnchor(
  root: string,
  input: PackageTransparencyAnchorInput,
  options: { ghExec?: PackageTransparencyAnchorGhExecutor; now?: Date } = {},
): Promise<PackageTransparencyAnchorPlan> {
  const anchorId = validateId("--anchor-id", input.anchorId);
  const repository = validateRepository(input.repository);
  const branch = validateBranch(input.branch);
  const review = validateReview(input, options.now ?? new Date());
  const local = await loadLocalTransparencyEvidence();
  const record: PublicPackageTransparencyAnchorRecord = {
    schemaVersion: 1,
    kind: "dockyard-community-package-action-anchor",
    anchorId,
    chainSchemaVersion: 1,
    records: local.records,
    headRecordHash: local.headRecordHash,
    transparencyLogSha256: local.sha256,
  };
  const bytes = publicBytes(record);
  if (bytes.length > MAX_PUBLIC_ANCHOR_BYTES) throw new Error("Generated public package-action anchor exceeds the safety size bound.");
  const path = anchorTargetPath(anchorId, local.records, local.headRecordHash);
  const gh = options.ghExec ?? defaultGh(root);
  verifyPublicRepository(gh, repository, branch);
  const remote = loadRemoteState(gh, repository, path, branch, bytes);

  const base: Omit<PackageTransparencyAnchorPlan, "approvalSha256" | "approvalRequired" | "notes"> = {
    schemaVersion: 1,
    operation: "package-action-transparency-anchor",
    review,
    local: {
      transparencyPath: local.path,
      transparencyLogSha256: local.sha256,
      records: local.records,
      headRecordHash: local.headRecordHash,
    },
    anchorRecord: record,
    anchorSha256: sha256(bytes),
    target: { provider: "github", repository, branch, path, public: true },
    remote,
    alreadyAnchored: remote.exists,
  };
  return {
    ...base,
    approvalSha256: maintainerObjectSha256(approvalMaterial(base)),
    approvalRequired: true,
    notes: [
      "The public anchor contains only chain length and hashes; package ids, actions, local details, reviewer identity, and rationale are not published.",
      "The plan is read-only. Run requires explicit approval and the exact plan SHA-256.",
      "The target path is content-addressed/create-only. Existing different bytes are never overwritten.",
      "Run re-verifies the local hash chain and remote target immediately before mutation.",
    ],
  };
}

function expectedApproval(value: string): string {
  const digest = value.trim().toLowerCase();
  if (!SHA256.test(digest)) throw new Error("--expected-plan-sha256 must be the exact 64-character SHA-256 from the reviewed plan.");
  return digest;
}

function parseMutationResponse(value: string): { blobSha?: string; commitSha?: string } {
  const object = parseObject(value, "GitHub transparency mutation");
  const content = object.content && typeof object.content === "object" && !Array.isArray(object.content) ? object.content as Record<string, unknown> : undefined;
  const commit = object.commit && typeof object.commit === "object" && !Array.isArray(object.commit) ? object.commit as Record<string, unknown> : undefined;
  const blobSha = typeof content?.sha === "string" && GIT_OBJECT_SHA.test(content.sha) ? content.sha.toLowerCase() : undefined;
  const commitSha = typeof commit?.sha === "string" && GIT_OBJECT_SHA.test(commit.sha) ? commit.sha.toLowerCase() : undefined;
  return { ...(blobSha ? { blobSha } : {}), ...(commitSha ? { commitSha } : {}) };
}

async function writeAudit(
  plan: PackageTransparencyAnchorPlan,
  status: PackageTransparencyAnchorResult["status"],
  extra: { blobSha?: string; commitSha?: string; verificationError?: string } = {},
): Promise<PackageTransparencyAnchorResult> {
  const target = auditPath(plan.anchorRecord.anchorId, plan.local.records, plan.local.headRecordHash);
  const result: PackageTransparencyAnchorResult = {
    schemaVersion: 1,
    operation: "package-action-transparency-anchor",
    status,
    anchorId: plan.anchorRecord.anchorId,
    records: plan.local.records,
    headRecordHash: plan.local.headRecordHash,
    transparencyLogSha256: plan.local.transparencyLogSha256,
    anchorSha256: plan.anchorSha256,
    repository: plan.target.repository,
    branch: plan.target.branch,
    path: plan.target.path,
    ...(extra.blobSha ? { blobSha: extra.blobSha } : {}),
    ...(extra.commitSha ? { commitSha: extra.commitSha } : {}),
    auditPath: target,
    ...(extra.verificationError ? { verificationError: extra.verificationError } : {}),
  };
  await writeJsonAtomic(target, {
    ...result,
    reviewedBy: plan.review.reviewedBy,
    rationale: plan.review.rationale,
    reviewedAt: plan.review.reviewedAt,
    approvalSha256: plan.approvalSha256,
  });
  return result;
}

export async function publishPackageTransparencyAnchor(
  root: string,
  input: PackageTransparencyAnchorInput,
  options: {
    approveAnchor?: boolean;
    expectedPlanSha256: string;
    ghExec?: PackageTransparencyAnchorGhExecutor;
  },
): Promise<PackageTransparencyAnchorResult> {
  if (options.approveAnchor !== true) throw new Error("Package-action transparency anchoring requires explicit --approve-anchor.");
  const expected = expectedApproval(options.expectedPlanSha256);
  const plan = await planPackageTransparencyAnchor(root, input, { ghExec: options.ghExec });
  if (plan.approvalSha256 !== expected) throw new Error("Package-action transparency anchor plan changed after review; generate and approve a fresh plan.");
  if (plan.alreadyAnchored) return writeAudit(plan, "already-anchored", { blobSha: plan.remote.blobSha });

  const gh = options.ghExec ?? defaultGh(root);
  const bytes = publicBytes(plan.anchorRecord);
  const requestRoot = resolve(communityRoot(), "package-action-anchors", ".requests");
  await mkdir(requestRoot, { recursive: true });
  const requestPath = resolve(requestRoot, `anchor-${randomUUID()}.json`);
  const request = {
    message: `DockyardOS package-action transparency anchor ${plan.anchorRecord.anchorId} #${plan.local.records}`,
    content: bytes.toString("base64"),
    branch: plan.target.branch,
  };
  await writeFile(requestPath, `${JSON.stringify(request)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });

  let mutation: ProcessResult;
  try {
    mutation = gh([
      "--method", "PUT",
      `/repos/${plan.target.repository}/contents/${plan.target.path}`,
      "--input", requestPath,
    ]);
  } finally {
    await rm(requestPath, { force: true });
  }
  if (!mutation.ok) throw new Error(`GitHub rejected the public package-action transparency anchor: ${mutation.stderr || mutation.stdout}`);
  const mutationMetadata = parseMutationResponse(mutation.stdout);

  let verificationError: string | undefined;
  let verifiedBlobSha: string | undefined;
  try {
    const verified = loadRemoteState(gh, plan.target.repository, plan.target.path, plan.target.branch, bytes);
    if (!verified.exists || verified.contentSha256 !== plan.anchorSha256) throw new Error("Public anchor could not be re-read with the expected content SHA-256.");
    verifiedBlobSha = verified.blobSha;
  } catch (error) {
    verificationError = error instanceof Error ? error.message : String(error);
  }

  return writeAudit(plan, verificationError ? "anchored-unverified" : "complete", {
    blobSha: verifiedBlobSha ?? mutationMetadata.blobSha,
    commitSha: mutationMetadata.commitSha,
    ...(verificationError ? { verificationError } : {}),
  });
}
