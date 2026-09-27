import { createHash, createPublicKey, randomUUID, verify as verifySignature } from "node:crypto";
import { lstat, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { validateCommunityRegistry } from "./community-registry.js";
import { maintainerObjectSha256, type MaintainerReview } from "./community-maintainer.js";
import { signRegistryEnvelopeWithLocalKey } from "./community-publisher.js";
import { loadRegistryTrustStore, remoteRegistryEnvelopePayload } from "./community-remote.js";
import type { RegistryTrustStore, SignedRegistryEnvelope } from "./community-remote-types.js";
import type { CommunityRegistryIndex } from "./community-types.js";
import { writeJsonAtomic } from "./fs-utils.js";
import { dockyardHome } from "./project.js";
import { commandExists, run, type ProcessResult } from "./process.js";

const SAFE_ID = /^[a-z0-9][a-z0-9._-]{1,79}$/;
const REVIEWER = /^[A-Za-z0-9][A-Za-z0-9._@+/-]{1,127}$/;
const GITHUB_REPOSITORY = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const SAFE_BRANCH = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const GIT_OBJECT_SHA = /^[a-f0-9]{40}$/i;
const GITHUB_API_VERSION = "2026-03-10";
const MAX_PUBLICATION_BYTES = 1024 * 1024;
const MAX_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

export type RegistryPublicationGhExecutor = (args: string[]) => ProcessResult;

export interface RegistryPublicationInput {
  indexPath: string;
  registryId: string;
  keyId: string;
  sequence: number;
  expiresAt: string;
  repository: string;
  targetPath: string;
  branch: string;
  reviewedBy: string;
  rationale: string;
  reviewedAt?: string;
}

export interface RegistryPublicationRemoteState {
  exists: boolean;
  blobSha?: string;
  contentSha256?: string;
  sequence?: number;
}

export interface RegistryPublicationPlan {
  schemaVersion: 1;
  operation: "registry-envelope-publish";
  review: MaintainerReview;
  registryId: string;
  keyId: string;
  sequence: number;
  expiresAt: string;
  indexPath: string;
  indexSha256: string;
  envelopePayloadSha256: string;
  target: {
    provider: "github";
    repository: string;
    path: string;
    branch: string;
  };
  remote: RegistryPublicationRemoteState;
  approvalSha256: string;
  approvalRequired: true;
  notes: string[];
}

export interface RegistryPublicationResult {
  schemaVersion: 1;
  operation: "registry-envelope-publish";
  status: "complete" | "published-unverified";
  registryId: string;
  keyId: string;
  sequence: number;
  repository: string;
  path: string;
  branch: string;
  signedContentSha256: string;
  blobSha?: string;
  commitSha?: string;
  envelopePath: string;
  auditPath: string;
  verificationError?: string;
}

interface LoadedIndex {
  index: CommunityRegistryIndex;
  path: string;
  sha256: string;
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
  if (!SAFE_ID.test(result)) throw new Error(`${label} must match ${SAFE_ID}.`);
  return result;
}

function validateRepository(value: string): string {
  const repository = value.trim();
  if (!GITHUB_REPOSITORY.test(repository) || repository.includes("..") || repository.endsWith(".git")) {
    throw new Error("Registry publication repository must be an explicit OWNER/REPO identifier without .git.");
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
    throw new Error("Registry publication branch is not a safe Git branch name.");
  }
  return branch;
}

function validateTargetPath(value: string): string {
  const path = value.trim();
  if (!path || path.length > 300 || isAbsolute(path) || path.includes("\\") || !path.endsWith(".json")) {
    throw new Error("Registry publication target path must be a relative .json path no longer than 300 characters.");
  }
  const parts = path.split("/");
  if (parts.some((part) => !part || part === "." || part === ".." || /[\u0000-\u001f\u007f]/.test(part))) {
    throw new Error("Registry publication target path contains an unsafe path segment.");
  }
  return path;
}

function validateSequence(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error("Registry publication sequence must be a positive safe integer.");
  return value;
}

function canonicalIso(label: string, value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) throw new Error(`${label} must be a canonical ISO timestamp.`);
  return value;
}

function validateReview(input: RegistryPublicationInput, now = new Date()): MaintainerReview {
  if (!Number.isFinite(now.getTime())) throw new Error("Registry publication review timestamp is invalid.");
  const reviewedAt = input.reviewedAt ? canonicalIso("--reviewed-at", input.reviewedAt) : now.toISOString();
  const reviewedBy = input.reviewedBy.trim();
  const rationale = input.rationale.trim();
  if (!REVIEWER.test(reviewedBy)) throw new Error("Registry publication reviewer identity contains unsupported characters or is too short.");
  if (rationale.length < 12 || rationale.length > 1000 || /[\u0000-\u001f\u007f]/.test(rationale)) {
    throw new Error("Registry publication rationale must be 12-1000 printable characters.");
  }
  return { reviewedBy, rationale, reviewedAt };
}

function validateExpiry(value: string, reviewedAt: string): string {
  const expiresAt = canonicalIso("--expires-at", value);
  const reviewedMs = Date.parse(reviewedAt);
  const expiryMs = Date.parse(expiresAt);
  if (expiryMs <= reviewedMs) throw new Error("Registry publication expiry must be after the reviewed timestamp.");
  if (expiryMs - reviewedMs > MAX_EXPIRY_MS) throw new Error("Registry publication expiry may be at most 30 days after review.");
  return expiresAt;
}

async function loadStagedIndex(root: string, inputPath: string): Promise<LoadedIndex> {
  const base = resolve(root, "registry", "remote-publications");
  const target = resolve(root, inputPath);
  const rel = relative(base, target);
  if (!rel || rel.startsWith("..") || isAbsolute(rel) || !target.endsWith(".json")) {
    throw new Error("Registry publication index must be a .json file inside registry/remote-publications/.");
  }
  const stat = await lstat(target);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Registry publication index must be a regular non-symlink review file.");
  if (stat.size > MAX_PUBLICATION_BYTES) throw new Error("Registry publication index exceeds the 1 MiB review/publication bound.");
  const bytes = await readFile(target);
  let index: CommunityRegistryIndex;
  try {
    index = JSON.parse(bytes.toString("utf8")) as CommunityRegistryIndex;
  } catch (error) {
    throw new Error(`Registry publication index is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const errors = validateCommunityRegistry(index);
  if (errors.length) throw new Error(`Registry publication index is invalid: ${errors.join("; ")}`);
  return { index, path: target, sha256: maintainerObjectSha256(index) };
}

function trustedRegistryKey(store: RegistryTrustStore, registryId: string, keyId: string): RegistryTrustStore["keys"][number] {
  const key = store.keys.find((item) => item.id === keyId && item.registryId === registryId);
  if (!key) throw new Error(`Trusted registry key not found for publication: ${registryId}/${keyId}.`);
  if (key.revokedAt) throw new Error(`Registry publication key is revoked: ${keyId}.`);
  if (key.algorithm !== "ed25519") throw new Error(`Registry publication key must use Ed25519: ${keyId}.`);
  return key;
}

function githubContentEndpoint(repository: string, path: string): string {
  return `/repos/${repository}/contents/${path.split("/").map((part) => encodeURIComponent(part)).join("/")}`;
}

function githubBranchEndpoint(repository: string, branch: string): string {
  return `/repos/${repository}/branches/${encodeURIComponent(branch)}`;
}

function parseObject(value: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

function defaultGh(root: string): RegistryPublicationGhExecutor {
  return (args) => run("gh", args, { cwd: root, timeoutMs: 60_000, maxOutputBytes: 2 * 1024 * 1024 });
}

function ensureGh(gh?: RegistryPublicationGhExecutor): void {
  if (!gh && !commandExists("gh")) throw new Error("Registry publication requires the authenticated GitHub CLI (`gh`).");
}

function isNotFound(result: ProcessResult): boolean {
  return /(?:HTTP\s+404|\b404\b|Not Found)/i.test(`${result.stderr}\n${result.stdout}`);
}

function readGitHubContent(
  repository: string,
  path: string,
  branch: string,
  gh: RegistryPublicationGhExecutor,
  expectedRegistryId: string,
): RegistryPublicationRemoteState {
  const response = gh([
    "api",
    "--method", "GET",
    "-H", "Accept: application/vnd.github+json",
    "-H", `X-GitHub-Api-Version: ${GITHUB_API_VERSION}`,
    githubContentEndpoint(repository, path),
    "-f", `ref=${branch}`,
  ]);
  if (!response.ok) {
    if (!isNotFound(response)) throw new Error(`GitHub registry target lookup failed: ${response.stderr || response.stdout || `gh exited with ${response.status}`}`);
    const branchCheck = gh([
      "api",
      "--method", "GET",
      "-H", "Accept: application/vnd.github+json",
      "-H", `X-GitHub-Api-Version: ${GITHUB_API_VERSION}`,
      githubBranchEndpoint(repository, branch),
    ]);
    if (!branchCheck.ok) {
      throw new Error(`GitHub registry target returned 404 and branch access could not be confirmed: ${branchCheck.stderr || branchCheck.stdout || `gh exited with ${branchCheck.status}`}`);
    }
    return { exists: false };
  }

  const parsed = parseObject(response.stdout) as GitHubContentResponse | undefined;
  if (!parsed || parsed.type !== "file" || parsed.encoding !== "base64" || typeof parsed.content !== "string") {
    throw new Error("GitHub registry target is not a Base64-encoded regular file response.");
  }
  if (typeof parsed.size !== "number" || !Number.isSafeInteger(parsed.size) || parsed.size < 0 || parsed.size > MAX_PUBLICATION_BYTES) {
    throw new Error("GitHub registry target size is invalid or exceeds the 1 MiB publication bound.");
  }
  if (typeof parsed.sha !== "string" || !GIT_OBJECT_SHA.test(parsed.sha)) throw new Error("GitHub registry target returned an invalid blob SHA.");
  const bytes = Buffer.from(parsed.content.replace(/\s/g, ""), "base64");
  if (bytes.length !== parsed.size) throw new Error("GitHub registry target Base64 content length does not match the declared file size.");
  let envelope: SignedRegistryEnvelope;
  try {
    envelope = JSON.parse(bytes.toString("utf8")) as SignedRegistryEnvelope;
  } catch {
    throw new Error("Existing GitHub registry target is not valid JSON; publication fails closed.");
  }
  if (envelope.schemaVersion !== 1 || envelope.registryId !== expectedRegistryId || !Number.isSafeInteger(envelope.sequence) || envelope.sequence < 1) {
    throw new Error("Existing GitHub registry target is not a compatible envelope for this registry; publication fails closed.");
  }
  return {
    exists: true,
    blobSha: parsed.sha.toLowerCase(),
    contentSha256: sha256(bytes),
    sequence: envelope.sequence,
  };
}

function unsignedEnvelope(plan: Pick<RegistryPublicationPlan, "registryId" | "sequence" | "review" | "expiresAt" | "keyId">, index: CommunityRegistryIndex): SignedRegistryEnvelope {
  return {
    schemaVersion: 1,
    registryId: plan.registryId,
    issuedAt: plan.review.reviewedAt,
    expiresAt: plan.expiresAt,
    sequence: plan.sequence,
    index,
    signature: { algorithm: "ed25519", keyId: plan.keyId, value: "" },
  };
}

function approvalMaterial(plan: Omit<RegistryPublicationPlan, "approvalSha256" | "approvalRequired" | "notes">): unknown {
  return {
    schemaVersion: plan.schemaVersion,
    operation: plan.operation,
    review: plan.review,
    registryId: plan.registryId,
    keyId: plan.keyId,
    sequence: plan.sequence,
    expiresAt: plan.expiresAt,
    indexPath: plan.indexPath,
    indexSha256: plan.indexSha256,
    envelopePayloadSha256: plan.envelopePayloadSha256,
    target: plan.target,
    remote: plan.remote,
  };
}

export async function planRegistryPublication(
  root: string,
  input: RegistryPublicationInput,
  options: { ghExec?: RegistryPublicationGhExecutor; trustStorePath?: string; now?: Date } = {},
): Promise<RegistryPublicationPlan> {
  ensureGh(options.ghExec);
  const registryId = validateId("registryId", input.registryId);
  const keyId = validateId("keyId", input.keyId);
  const sequence = validateSequence(input.sequence);
  const repository = validateRepository(input.repository);
  const targetPath = validateTargetPath(input.targetPath);
  const branch = validateBranch(input.branch);
  const review = validateReview(input, options.now ?? new Date());
  const expiresAt = validateExpiry(input.expiresAt, review.reviewedAt);
  const loaded = await loadStagedIndex(root, input.indexPath);
  const trustStore = await loadRegistryTrustStore(options.trustStorePath);
  trustedRegistryKey(trustStore, registryId, keyId);
  const envelope = unsignedEnvelope({ registryId, keyId, sequence, review, expiresAt }, loaded.index);
  const envelopePayloadSha256 = sha256(remoteRegistryEnvelopePayload(envelope));
  const gh = options.ghExec ?? defaultGh(root);
  const remote = readGitHubContent(repository, targetPath, branch, gh, registryId);
  if (remote.exists && (remote.sequence ?? 0) >= sequence) {
    throw new Error(`Registry publication sequence must advance the remote sequence (${String(remote.sequence)} -> ${sequence}).`);
  }

  const base = {
    schemaVersion: 1 as const,
    operation: "registry-envelope-publish" as const,
    review,
    registryId,
    keyId,
    sequence,
    expiresAt,
    indexPath: loaded.path,
    indexSha256: loaded.sha256,
    envelopePayloadSha256,
    target: { provider: "github" as const, repository, path: targetPath, branch },
    remote,
  };
  return {
    ...base,
    approvalSha256: maintainerObjectSha256(approvalMaterial(base)),
    approvalRequired: true,
    notes: [
      "Plan is read-only and does not access the local registry private key.",
      "Run must reuse this exact reviewed timestamp and approval SHA-256; target content changes invalidate approval.",
      "Publication uses GitHub's contents API through the authenticated gh CLI and binds updates to the observed blob SHA.",
      "Remote registry envelopes are limited to 1 MiB so plan/run verification can use the normal GitHub contents response safely.",
    ],
  };
}

function verifySignedEnvelope(envelope: SignedRegistryEnvelope, trustedPublicKeyPem: string): void {
  const ok = verifySignature(
    null,
    Buffer.from(remoteRegistryEnvelopePayload(envelope), "utf8"),
    createPublicKey(trustedPublicKeyPem),
    Buffer.from(envelope.signature.value, "base64"),
  );
  if (!ok) throw new Error("Locally signed registry envelope does not verify against the trusted registry public key.");
}

function expectedApproval(value: string): string {
  const digest = value.trim().toLowerCase();
  if (!SHA256.test(digest)) throw new Error("--expected-plan-sha256 must be a 64-character SHA-256 digest from the reviewed publication plan.");
  return digest;
}

function publicationDirectory(registryId: string): string {
  return resolve(dockyardHome(), "community", "publications", registryId);
}

export async function publishRegistryEnvelope(
  root: string,
  input: RegistryPublicationInput,
  options: {
    approvePublication?: boolean;
    expectedPlanSha256: string;
    ghExec?: RegistryPublicationGhExecutor;
    trustStorePath?: string;
    now?: Date;
  },
): Promise<RegistryPublicationResult> {
  if (options.approvePublication !== true) throw new Error("Registry publication is mutating and requires explicit --approve-publication.");
  if (!input.reviewedAt) throw new Error("Registry publication run requires --reviewed-at from the exact reviewed plan.");
  const expected = expectedApproval(options.expectedPlanSha256);
  const plan = await planRegistryPublication(root, input, options);
  if (plan.approvalSha256 !== expected) {
    throw new Error("Registry publication plan changed after review; generate and approve a fresh plan.");
  }

  const loaded = await loadStagedIndex(root, input.indexPath);
  if (loaded.sha256 !== plan.indexSha256) throw new Error("Registry publication index changed immediately before signing; aborting.");
  const trustStore = await loadRegistryTrustStore(options.trustStorePath);
  const trustedKey = trustedRegistryKey(trustStore, plan.registryId, plan.keyId);
  const unsigned = unsignedEnvelope(plan, loaded.index);
  if (sha256(remoteRegistryEnvelopePayload(unsigned)) !== plan.envelopePayloadSha256) {
    throw new Error("Registry envelope payload changed after review; aborting.");
  }
  const signed = await signRegistryEnvelopeWithLocalKey(unsigned, plan.keyId);
  verifySignedEnvelope(signed, trustedKey.publicKeyPem);
  const signedBytes = Buffer.from(`${JSON.stringify(signed, null, 2)}\n`, "utf8");
  if (signedBytes.length > MAX_PUBLICATION_BYTES) throw new Error("Signed registry envelope exceeds the 1 MiB publication bound.");
  const signedContentSha256 = sha256(signedBytes);
  const gh = options.ghExec ?? defaultGh(root);
  const requestDirectory = resolve(dockyardHome(), "community", "publication-requests");
  await mkdir(requestDirectory, { recursive: true, mode: 0o700 });
  const requestPath = resolve(requestDirectory, `${plan.registryId}-${plan.sequence}-${randomUUID()}.json`);
  const request = {
    message: `chore(registry): publish ${plan.registryId} sequence ${plan.sequence}`,
    content: signedBytes.toString("base64"),
    branch: plan.target.branch,
    ...(plan.remote.blobSha ? { sha: plan.remote.blobSha } : {}),
  };
  await writeFile(requestPath, `${JSON.stringify(request)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });

  let publishResult: ProcessResult;
  try {
    publishResult = gh([
      "api",
      "--method", "PUT",
      "-H", "Accept: application/vnd.github+json",
      "-H", `X-GitHub-Api-Version: ${GITHUB_API_VERSION}`,
      githubContentEndpoint(plan.target.repository, plan.target.path),
      "--input", requestPath,
    ]);
  } finally {
    await rm(requestPath, { force: true });
  }
  if (!publishResult.ok) {
    throw new Error(`GitHub rejected registry publication: ${publishResult.stderr || publishResult.stdout || `gh exited with ${publishResult.status}`}`);
  }

  const response = parseObject(publishResult.stdout);
  const content = response?.content && typeof response.content === "object" && !Array.isArray(response.content) ? response.content as Record<string, unknown> : undefined;
  const commit = response?.commit && typeof response.commit === "object" && !Array.isArray(response.commit) ? response.commit as Record<string, unknown> : undefined;
  const blobSha = typeof content?.sha === "string" && GIT_OBJECT_SHA.test(content.sha) ? content.sha.toLowerCase() : undefined;
  const commitSha = typeof commit?.sha === "string" && GIT_OBJECT_SHA.test(commit.sha) ? commit.sha.toLowerCase() : undefined;

  let status: RegistryPublicationResult["status"] = "complete";
  let verificationError: string | undefined;
  try {
    const verified = readGitHubContent(plan.target.repository, plan.target.path, plan.target.branch, gh, plan.registryId);
    if (!verified.exists || verified.sequence !== plan.sequence || verified.contentSha256 !== signedContentSha256) {
      throw new Error("post-publication GitHub content does not match the exact signed envelope bytes/sequence");
    }
    if (blobSha && verified.blobSha !== blobSha) throw new Error("post-publication GitHub blob SHA does not match the mutation response");
  } catch (error) {
    status = "published-unverified";
    verificationError = error instanceof Error ? error.message : String(error);
  }

  const directory = publicationDirectory(plan.registryId);
  const envelopePath = resolve(directory, `${String(plan.sequence).padStart(12, "0")}-${signedContentSha256}.json`);
  const auditPath = resolve(directory, `${String(plan.sequence).padStart(12, "0")}-${signedContentSha256}.audit.json`);
  await writeJsonAtomic(envelopePath, signed);
  const result: RegistryPublicationResult = {
    schemaVersion: 1,
    operation: "registry-envelope-publish",
    status,
    registryId: plan.registryId,
    keyId: plan.keyId,
    sequence: plan.sequence,
    repository: plan.target.repository,
    path: plan.target.path,
    branch: plan.target.branch,
    signedContentSha256,
    ...(blobSha ? { blobSha } : {}),
    ...(commitSha ? { commitSha } : {}),
    envelopePath,
    auditPath,
    ...(verificationError ? { verificationError } : {}),
  };
  await writeJsonAtomic(auditPath, {
    ...result,
    reviewedAt: plan.review.reviewedAt,
    reviewedBy: plan.review.reviewedBy,
    rationale: plan.review.rationale,
    approvalSha256: plan.approvalSha256,
    indexSha256: plan.indexSha256,
    envelopePayloadSha256: plan.envelopePayloadSha256,
    remoteBefore: plan.remote,
  });
  return result;
}
