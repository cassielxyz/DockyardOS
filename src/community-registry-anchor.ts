import { createHash, createPublicKey, randomUUID, verify as verifySignature } from "node:crypto";
import { lstat, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { maintainerObjectSha256, type MaintainerReview } from "./community-maintainer.js";
import { loadRegistryTrustStore, remoteRegistryEnvelopePayload } from "./community-remote.js";
import type { RegistryTrustStore, SignedRegistryEnvelope } from "./community-remote-types.js";
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
const MAX_EVIDENCE_BYTES = 1024 * 1024;
const MAX_ANCHOR_BYTES = 128 * 1024;

export type RegistryAnchorGhExecutor = (args: string[]) => ProcessResult;

export interface RegistryAnchorInput {
  auditPath: string;
  repository: string;
  branch: string;
  reviewedBy: string;
  rationale: string;
  reviewedAt?: string;
}

export interface PublicRegistryAnchorRecord {
  schemaVersion: 1;
  kind: "dockyard-registry-publication-anchor";
  anchoredAt: string;
  registryId: string;
  sequence: number;
  keyId: string;
  signedContentSha256: string;
  indexSha256: string;
  envelopePayloadSha256: string;
  publicationApprovalSha256: string;
  publicationAuditSha256: string;
  publication: {
    provider: "github";
    repository: string;
    path: string;
    branch: string;
    blobSha: string;
    commitSha: string;
  };
}

export interface RegistryAnchorRemoteState {
  exists: boolean;
  blobSha?: string;
  contentSha256?: string;
}

export interface RegistryAnchorPlan {
  schemaVersion: 1;
  operation: "registry-public-transparency-anchor";
  review: MaintainerReview;
  publicationAuditPath: string;
  publicationAuditSha256: string;
  anchorRecord: PublicRegistryAnchorRecord;
  anchorSha256: string;
  target: {
    provider: "github";
    repository: string;
    branch: string;
    path: string;
    public: true;
  };
  remote: RegistryAnchorRemoteState;
  alreadyAnchored: boolean;
  approvalSha256: string;
  approvalRequired: true;
  notes: string[];
}

export interface RegistryAnchorResult {
  schemaVersion: 1;
  operation: "registry-public-transparency-anchor";
  status: "complete" | "already-anchored" | "anchored-unverified";
  registryId: string;
  sequence: number;
  signedContentSha256: string;
  anchorSha256: string;
  repository: string;
  branch: string;
  path: string;
  blobSha?: string;
  commitSha?: string;
  auditPath: string;
  verificationError?: string;
}

interface PublicationAuditFile {
  schemaVersion?: unknown;
  operation?: unknown;
  status?: unknown;
  registryId?: unknown;
  keyId?: unknown;
  sequence?: unknown;
  repository?: unknown;
  path?: unknown;
  branch?: unknown;
  signedContentSha256?: unknown;
  blobSha?: unknown;
  commitSha?: unknown;
  envelopePath?: unknown;
  reviewedAt?: unknown;
  approvalSha256?: unknown;
  indexSha256?: unknown;
  envelopePayloadSha256?: unknown;
}

interface VerifiedPublicationEvidence {
  auditPath: string;
  auditSha256: string;
  registryId: string;
  keyId: string;
  sequence: number;
  repository: string;
  path: string;
  branch: string;
  signedContentSha256: string;
  blobSha: string;
  commitSha: string;
  reviewedAt: string;
  approvalSha256: string;
  indexSha256: string;
  envelopePayloadSha256: string;
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

function parseObject(value: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

function canonicalIso(label: string, value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) throw new Error(`${label} must be a canonical ISO timestamp.`);
  return value;
}

function validateId(label: string, value: string): string {
  const result = value.trim();
  if (!SAFE_ID.test(result)) throw new Error(`${label} must match ${SAFE_ID}.`);
  return result;
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

function validateReview(input: RegistryAnchorInput, now = new Date()): MaintainerReview {
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

function inside(base: string, target: string): boolean {
  const rel = relative(base, target);
  return Boolean(rel) && !rel.startsWith("..") && !isAbsolute(rel);
}

async function readConfinedRegularFile(base: string, target: string, label: string, maxBytes: number): Promise<{ bytes: Buffer; resolvedPath: string }> {
  const baseStat = await lstat(base);
  if (!baseStat.isDirectory() || baseStat.isSymbolicLink()) throw new Error(`${label} base directory must be a real non-symlink directory.`);
  const stat = await lstat(target);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} must be a real regular non-symlink file.`);
  if (stat.size > maxBytes) throw new Error(`${label} exceeds the ${maxBytes} byte safety bound.`);
  const [resolvedBase, resolvedTarget] = await Promise.all([realpath(base), realpath(target)]);
  if (!inside(resolvedBase, resolvedTarget)) throw new Error(`${label} resolves outside its allowed directory; symlinked parent paths are not allowed.`);
  return { bytes: await readFile(target), resolvedPath: resolvedTarget };
}

function publicationRoot(): string {
  return resolve(dockyardHome(), "community", "publications");
}

function anchorAuditPath(registryId: string, sequence: number, contentSha256: string): string {
  return resolve(
    dockyardHome(),
    "community",
    "anchors",
    registryId,
    `${String(sequence).padStart(12, "0")}-${contentSha256}.audit.json`,
  );
}

function anchorTargetPath(registryId: string, sequence: number, contentSha256: string): string {
  return `dockyard-transparency/registry-publications/${registryId}/${String(sequence).padStart(12, "0")}-${contentSha256}.json`;
}

async function loadTrustStore(root: string): Promise<RegistryTrustStore> {
  const registryRoot = resolve(root, "registry");
  const target = resolve(registryRoot, "registry-keys.json");
  const file = await readConfinedRegularFile(registryRoot, target, "Registry anchor trust store", MAX_EVIDENCE_BYTES);
  return loadRegistryTrustStore(file.resolvedPath);
}

function trustedKey(store: RegistryTrustStore, registryId: string, keyId: string): RegistryTrustStore["keys"][number] {
  const key = store.keys.find((item) => item.registryId === registryId && item.id === keyId);
  if (!key) throw new Error(`Trusted registry key not found for transparency anchor: ${registryId}/${keyId}.`);
  if (key.revokedAt) throw new Error(`Registry transparency anchor key is revoked: ${keyId}.`);
  if (key.algorithm !== "ed25519") throw new Error(`Registry transparency anchor key must use Ed25519: ${keyId}.`);
  return key;
}

function requiredString(object: PublicationAuditFile, key: keyof PublicationAuditFile, label: string): string {
  const value = object[key];
  if (typeof value !== "string" || !value) throw new Error(`Publication audit ${label} is missing or invalid.`);
  return value;
}

function requiredSha256(object: PublicationAuditFile, key: keyof PublicationAuditFile, label: string): string {
  const value = requiredString(object, key, label).toLowerCase();
  if (!SHA256.test(value)) throw new Error(`Publication audit ${label} is not a SHA-256 digest.`);
  return value;
}

function requiredGitSha(object: PublicationAuditFile, key: keyof PublicationAuditFile, label: string): string {
  const value = requiredString(object, key, label).toLowerCase();
  if (!GIT_OBJECT_SHA.test(value)) throw new Error(`Publication audit ${label} is not a full Git object SHA.`);
  return value;
}

async function loadVerifiedPublication(root: string, auditInputPath: string): Promise<VerifiedPublicationEvidence> {
  const base = publicationRoot();
  const auditTarget = resolve(auditInputPath);
  const auditFile = await readConfinedRegularFile(base, auditTarget, "Registry publication audit", MAX_EVIDENCE_BYTES);
  let audit: PublicationAuditFile;
  try {
    audit = JSON.parse(auditFile.bytes.toString("utf8")) as PublicationAuditFile;
  } catch (error) {
    throw new Error(`Registry publication audit is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (audit.schemaVersion !== 1 || audit.operation !== "registry-envelope-publish") throw new Error("Registry publication audit is not a compatible P19 publication record.");
  if (audit.status !== "complete") throw new Error("Only a P19 publication with status complete may be publicly anchored.");

  const registryId = validateId("registryId", requiredString(audit, "registryId", "registryId"));
  const keyId = validateId("keyId", requiredString(audit, "keyId", "keyId"));
  const sequence = audit.sequence;
  if (typeof sequence !== "number" || !Number.isSafeInteger(sequence) || sequence < 1) throw new Error("Publication audit sequence must be a positive safe integer.");
  const repository = validateRepository(requiredString(audit, "repository", "repository"));
  const path = requiredString(audit, "path", "path");
  const branch = validateBranch(requiredString(audit, "branch", "branch"));
  const signedContentSha256 = requiredSha256(audit, "signedContentSha256", "signedContentSha256");
  const blobSha = requiredGitSha(audit, "blobSha", "blobSha");
  const commitSha = requiredGitSha(audit, "commitSha", "commitSha");
  const approvalSha256 = requiredSha256(audit, "approvalSha256", "approvalSha256");
  const indexSha256 = requiredSha256(audit, "indexSha256", "indexSha256");
  const envelopePayloadSha256 = requiredSha256(audit, "envelopePayloadSha256", "envelopePayloadSha256");
  const reviewedAt = canonicalIso("publication audit reviewedAt", requiredString(audit, "reviewedAt", "reviewedAt"));

  const registryDirectory = resolve(base, registryId);
  const registryStat = await lstat(registryDirectory);
  if (!registryStat.isDirectory() || registryStat.isSymbolicLink()) throw new Error("Registry publication evidence directory must be a real non-symlink directory.");
  const resolvedRegistryDirectory = await realpath(registryDirectory);
  if (!inside(resolvedRegistryDirectory, auditFile.resolvedPath)) throw new Error("Registry publication audit is not stored beneath its registry-specific publication directory.");

  const envelopePath = resolve(requiredString(audit, "envelopePath", "envelopePath"));
  const envelopeFile = await readConfinedRegularFile(registryDirectory, envelopePath, "Signed registry publication envelope", MAX_EVIDENCE_BYTES);
  if (sha256(envelopeFile.bytes) !== signedContentSha256) throw new Error("Signed registry publication envelope SHA-256 does not match the complete P19 audit.");
  let envelope: SignedRegistryEnvelope;
  try {
    envelope = JSON.parse(envelopeFile.bytes.toString("utf8")) as SignedRegistryEnvelope;
  } catch {
    throw new Error("Signed registry publication envelope is not valid JSON.");
  }
  if (envelope.schemaVersion !== 1 || envelope.registryId !== registryId || envelope.sequence !== sequence || envelope.signature?.keyId !== keyId || envelope.signature?.algorithm !== "ed25519") {
    throw new Error("Signed registry publication envelope identity does not match the complete P19 audit.");
  }
  if (maintainerObjectSha256(envelope.index) !== indexSha256) throw new Error("Signed registry publication index SHA-256 does not match the complete P19 audit.");
  if (sha256(remoteRegistryEnvelopePayload(envelope)) !== envelopePayloadSha256) throw new Error("Signed registry publication payload SHA-256 does not match the complete P19 audit.");

  const store = await loadTrustStore(root);
  const key = trustedKey(store, registryId, keyId);
  const signatureOk = verifySignature(
    null,
    Buffer.from(remoteRegistryEnvelopePayload(envelope), "utf8"),
    createPublicKey(key.publicKeyPem),
    Buffer.from(envelope.signature.value, "base64"),
  );
  if (!signatureOk) throw new Error("Signed registry publication envelope does not verify against the trusted registry public key.");

  return {
    auditPath: auditFile.resolvedPath,
    auditSha256: sha256(auditFile.bytes),
    registryId,
    keyId,
    sequence,
    repository,
    path,
    branch,
    signedContentSha256,
    blobSha,
    commitSha,
    reviewedAt,
    approvalSha256,
    indexSha256,
    envelopePayloadSha256,
  };
}

function defaultGh(root: string): RegistryAnchorGhExecutor {
  return (args) => run("gh", args, { cwd: root, timeoutMs: 60_000, maxOutputBytes: 2 * 1024 * 1024 });
}

function ensureGh(gh?: RegistryAnchorGhExecutor): void {
  if (!gh && !commandExists("gh")) throw new Error("Public transparency anchoring requires the authenticated GitHub CLI (`gh`).");
}

function repoEndpoint(repository: string): string {
  return `/repos/${repository}`;
}

function branchEndpoint(repository: string, branch: string): string {
  return `/repos/${repository}/branches/${encodeURIComponent(branch)}`;
}

function contentEndpoint(repository: string, path: string): string {
  return `/repos/${repository}/contents/${path.split("/").map((part) => encodeURIComponent(part)).join("/")}`;
}

function isNotFound(result: ProcessResult): boolean {
  return /(?:HTTP\s+404|\b404\b|Not Found)/i.test(`${result.stderr}\n${result.stdout}`);
}

function decodeCanonicalBase64(value: string, expectedBytes: number): Buffer {
  const compact = value.replace(/\s/g, "");
  if (!CANONICAL_BASE64.test(compact)) throw new Error("Public transparency target returned malformed Base64 content.");
  const bytes = Buffer.from(compact, "base64");
  if (bytes.length !== expectedBytes || bytes.toString("base64") !== compact) throw new Error("Public transparency target Base64 content is not canonical for its declared size.");
  return bytes;
}

function assertPublicRepository(repository: string, gh: RegistryAnchorGhExecutor): void {
  const result = gh([
    "api", "--method", "GET",
    "-H", "Accept: application/vnd.github+json",
    "-H", `X-GitHub-Api-Version: ${GITHUB_API_VERSION}`,
    repoEndpoint(repository),
  ]);
  if (!result.ok) throw new Error(`Public transparency repository lookup failed: ${result.stderr || result.stdout || `gh exited with ${result.status}`}`);
  const parsed = parseObject(result.stdout);
  if (!parsed || parsed.private !== false) throw new Error("Transparency anchor repository must be publicly readable on GitHub.");
  if (typeof parsed.full_name === "string" && parsed.full_name.toLowerCase() !== repository.toLowerCase()) throw new Error("GitHub transparency repository identity did not match the requested OWNER/REPO.");
  if (parsed.archived === true || parsed.disabled === true) throw new Error("Transparency anchor repository must be active and writable, not archived or disabled.");
}

function assertBranch(repository: string, branch: string, gh: RegistryAnchorGhExecutor): void {
  const result = gh([
    "api", "--method", "GET",
    "-H", "Accept: application/vnd.github+json",
    "-H", `X-GitHub-Api-Version: ${GITHUB_API_VERSION}`,
    branchEndpoint(repository, branch),
  ]);
  if (!result.ok) throw new Error(`Public transparency branch lookup failed: ${result.stderr || result.stdout || `gh exited with ${result.status}`}`);
}

function readRemoteAnchor(repository: string, branch: string, path: string, gh: RegistryAnchorGhExecutor): RegistryAnchorRemoteState {
  const result = gh([
    "api", "--method", "GET",
    "-H", "Accept: application/vnd.github+json",
    "-H", `X-GitHub-Api-Version: ${GITHUB_API_VERSION}`,
    contentEndpoint(repository, path),
    "-f", `ref=${branch}`,
  ]);
  if (!result.ok) {
    if (isNotFound(result)) return { exists: false };
    throw new Error(`Public transparency anchor lookup failed: ${result.stderr || result.stdout || `gh exited with ${result.status}`}`);
  }
  const parsed = parseObject(result.stdout) as GitHubContentResponse | undefined;
  if (!parsed || parsed.type !== "file" || parsed.encoding !== "base64" || typeof parsed.content !== "string") throw new Error("Public transparency target is not a Base64-encoded regular file response.");
  if (typeof parsed.size !== "number" || !Number.isSafeInteger(parsed.size) || parsed.size < 0 || parsed.size > MAX_ANCHOR_BYTES) throw new Error("Public transparency target size is invalid or exceeds the anchor bound.");
  if (typeof parsed.sha !== "string" || !GIT_OBJECT_SHA.test(parsed.sha)) throw new Error("Public transparency target returned an invalid blob SHA.");
  const bytes = decodeCanonicalBase64(parsed.content, parsed.size);
  return { exists: true, blobSha: parsed.sha.toLowerCase(), contentSha256: sha256(bytes) };
}

function recordBytes(record: PublicRegistryAnchorRecord): Buffer {
  return Buffer.from(`${JSON.stringify(record, null, 2)}\n`, "utf8");
}

function approvalMaterial(plan: Omit<RegistryAnchorPlan, "approvalSha256" | "approvalRequired" | "notes">): unknown {
  return {
    schemaVersion: plan.schemaVersion,
    operation: plan.operation,
    review: plan.review,
    publicationAuditSha256: plan.publicationAuditSha256,
    anchorRecord: plan.anchorRecord,
    anchorSha256: plan.anchorSha256,
    target: plan.target,
    remote: plan.remote,
    alreadyAnchored: plan.alreadyAnchored,
  };
}

export async function planRegistryTransparencyAnchor(
  root: string,
  input: RegistryAnchorInput,
  options: { ghExec?: RegistryAnchorGhExecutor; now?: Date } = {},
): Promise<RegistryAnchorPlan> {
  ensureGh(options.ghExec);
  const review = validateReview(input, options.now ?? new Date());
  const evidence = await loadVerifiedPublication(root, input.auditPath);
  const repository = validateRepository(input.repository);
  const branch = validateBranch(input.branch);
  if (repository.toLowerCase() === evidence.repository.toLowerCase()) throw new Error("Public transparency anchor repository must differ from the registry publication repository.");

  const record: PublicRegistryAnchorRecord = {
    schemaVersion: 1,
    kind: "dockyard-registry-publication-anchor",
    anchoredAt: review.reviewedAt,
    registryId: evidence.registryId,
    sequence: evidence.sequence,
    keyId: evidence.keyId,
    signedContentSha256: evidence.signedContentSha256,
    indexSha256: evidence.indexSha256,
    envelopePayloadSha256: evidence.envelopePayloadSha256,
    publicationApprovalSha256: evidence.approvalSha256,
    publicationAuditSha256: evidence.auditSha256,
    publication: {
      provider: "github",
      repository: evidence.repository,
      path: evidence.path,
      branch: evidence.branch,
      blobSha: evidence.blobSha,
      commitSha: evidence.commitSha,
    },
  };
  const bytes = recordBytes(record);
  if (bytes.length > MAX_ANCHOR_BYTES) throw new Error("Public transparency anchor exceeds the 128 KiB bound.");
  const anchorSha256 = sha256(bytes);
  const path = anchorTargetPath(evidence.registryId, evidence.sequence, evidence.signedContentSha256);
  const gh = options.ghExec ?? defaultGh(root);
  assertPublicRepository(repository, gh);
  assertBranch(repository, branch, gh);
  const remote = readRemoteAnchor(repository, branch, path, gh);
  if (remote.exists && remote.contentSha256 !== anchorSha256) throw new Error("Content-addressed public transparency anchor path already exists with different bytes; refusing overwrite.");

  const base = {
    schemaVersion: 1 as const,
    operation: "registry-public-transparency-anchor" as const,
    review,
    publicationAuditPath: evidence.auditPath,
    publicationAuditSha256: evidence.auditSha256,
    anchorRecord: record,
    anchorSha256,
    target: { provider: "github" as const, repository, branch, path, public: true as const },
    remote,
    alreadyAnchored: remote.exists,
  };
  return {
    ...base,
    approvalSha256: maintainerObjectSha256(approvalMaterial(base)),
    approvalRequired: true,
    notes: [
      "Plan is read-only and requires a complete, locally verified P19 publication audit and signed envelope.",
      "The anchor destination must be a different public GitHub repository; anchor paths are derived and create-only.",
      "Reviewer identity and rationale are bound into approval/audit evidence but are not included in the public anchor record.",
      "An exact existing anchor is idempotent; different bytes at the content-addressed path fail closed.",
    ],
  };
}

function expectedApproval(value: string): string {
  const digest = value.trim().toLowerCase();
  if (!SHA256.test(digest)) throw new Error("--expected-plan-sha256 must be a 64-character SHA-256 digest from the reviewed transparency plan.");
  return digest;
}

async function persistAnchorAudit(plan: RegistryAnchorPlan, result: RegistryAnchorResult): Promise<void> {
  await writeJsonAtomic(result.auditPath, {
    ...result,
    reviewedAt: plan.review.reviewedAt,
    reviewedBy: plan.review.reviewedBy,
    rationale: plan.review.rationale,
    approvalSha256: plan.approvalSha256,
    publicationAuditPath: plan.publicationAuditPath,
    publicationAuditSha256: plan.publicationAuditSha256,
    anchorRecord: plan.anchorRecord,
    remoteBefore: plan.remote,
  });
}

export async function publishRegistryTransparencyAnchor(
  root: string,
  input: RegistryAnchorInput,
  options: { approveAnchor?: boolean; expectedPlanSha256: string; ghExec?: RegistryAnchorGhExecutor; now?: Date },
): Promise<RegistryAnchorResult> {
  if (options.approveAnchor !== true) throw new Error("Public transparency anchoring is mutating and requires explicit --approve-anchor.");
  if (!input.reviewedAt) throw new Error("Transparency anchor run requires --reviewed-at from the exact reviewed plan.");
  const expected = expectedApproval(options.expectedPlanSha256);
  const plan = await planRegistryTransparencyAnchor(root, input, options);
  if (plan.approvalSha256 !== expected) throw new Error("Transparency anchor plan changed after review; generate and approve a fresh plan.");

  const auditPath = anchorAuditPath(plan.anchorRecord.registryId, plan.anchorRecord.sequence, plan.anchorRecord.signedContentSha256);
  if (plan.alreadyAnchored) {
    const result: RegistryAnchorResult = {
      schemaVersion: 1,
      operation: "registry-public-transparency-anchor",
      status: "already-anchored",
      registryId: plan.anchorRecord.registryId,
      sequence: plan.anchorRecord.sequence,
      signedContentSha256: plan.anchorRecord.signedContentSha256,
      anchorSha256: plan.anchorSha256,
      repository: plan.target.repository,
      branch: plan.target.branch,
      path: plan.target.path,
      ...(plan.remote.blobSha ? { blobSha: plan.remote.blobSha } : {}),
      auditPath,
    };
    await persistAnchorAudit(plan, result);
    return result;
  }

  const bytes = recordBytes(plan.anchorRecord);
  if (sha256(bytes) !== plan.anchorSha256) throw new Error("Public transparency anchor bytes changed after review; aborting.");
  const gh = options.ghExec ?? defaultGh(root);
  const requestDirectory = resolve(dockyardHome(), "community", "anchor-requests");
  await mkdir(requestDirectory, { recursive: true, mode: 0o700 });
  const requestPath = resolve(requestDirectory, `${plan.anchorRecord.registryId}-${plan.anchorRecord.sequence}-${randomUUID()}.json`);
  await writeFile(requestPath, `${JSON.stringify({
    message: `chore(transparency): anchor ${plan.anchorRecord.registryId} sequence ${plan.anchorRecord.sequence}`,
    content: bytes.toString("base64"),
    branch: plan.target.branch,
  })}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });

  let publishResult: ProcessResult;
  try {
    publishResult = gh([
      "api", "--method", "PUT",
      "-H", "Accept: application/vnd.github+json",
      "-H", `X-GitHub-Api-Version: ${GITHUB_API_VERSION}`,
      contentEndpoint(plan.target.repository, plan.target.path),
      "--input", requestPath,
    ]);
  } finally {
    await rm(requestPath, { force: true });
  }
  if (!publishResult.ok) throw new Error(`GitHub rejected public transparency anchor creation: ${publishResult.stderr || publishResult.stdout || `gh exited with ${publishResult.status}`}`);

  const response = parseObject(publishResult.stdout);
  const content = response?.content && typeof response.content === "object" && !Array.isArray(response.content) ? response.content as Record<string, unknown> : undefined;
  const commit = response?.commit && typeof response.commit === "object" && !Array.isArray(response.commit) ? response.commit as Record<string, unknown> : undefined;
  const blobSha = typeof content?.sha === "string" && GIT_OBJECT_SHA.test(content.sha) ? content.sha.toLowerCase() : undefined;
  const commitSha = typeof commit?.sha === "string" && GIT_OBJECT_SHA.test(commit.sha) ? commit.sha.toLowerCase() : undefined;
  const metadataErrors: string[] = [];
  if (!response) metadataErrors.push("GitHub anchor response was not a JSON object");
  if (!blobSha) metadataErrors.push("GitHub anchor response did not include a valid content blob SHA");
  if (!commitSha) metadataErrors.push("GitHub anchor response did not include a valid commit SHA");

  let status: RegistryAnchorResult["status"] = metadataErrors.length ? "anchored-unverified" : "complete";
  let verificationError = metadataErrors.length ? metadataErrors.join("; ") : undefined;
  try {
    const verified = readRemoteAnchor(plan.target.repository, plan.target.branch, plan.target.path, gh);
    if (!verified.exists || verified.contentSha256 !== plan.anchorSha256) throw new Error("post-anchor public content does not match the exact reviewed anchor bytes");
    if (!blobSha || verified.blobSha !== blobSha) throw new Error("post-anchor public blob SHA does not match a valid mutation response blob SHA");
  } catch (error) {
    status = "anchored-unverified";
    const postError = error instanceof Error ? error.message : String(error);
    verificationError = verificationError ? `${verificationError}; ${postError}` : postError;
  }

  const result: RegistryAnchorResult = {
    schemaVersion: 1,
    operation: "registry-public-transparency-anchor",
    status,
    registryId: plan.anchorRecord.registryId,
    sequence: plan.anchorRecord.sequence,
    signedContentSha256: plan.anchorRecord.signedContentSha256,
    anchorSha256: plan.anchorSha256,
    repository: plan.target.repository,
    branch: plan.target.branch,
    path: plan.target.path,
    ...(blobSha ? { blobSha } : {}),
    ...(commitSha ? { commitSha } : {}),
    auditPath,
    ...(verificationError ? { verificationError } : {}),
  };
  await persistAnchorAudit(plan, result);
  return result;
}
