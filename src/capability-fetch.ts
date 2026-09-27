import { randomUUID } from "node:crypto";
import { access, mkdir, rename, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { dockyardHome } from "./project.js";
import { run } from "./process.js";
import type { Candidate } from "./types.js";
import type { ResolvedCapabilitySource } from "./capability-types.js";

const GITHUB_LOCATOR = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const FULL_SHA = /^[a-f0-9]{40}$/i;
const SAFE_REF = /^[A-Za-z0-9._/-]+$/;

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export function normalizeGithubLocator(locator: string): string {
  let value = locator.trim().replace(/^https:\/\/github\.com\//i, "").replace(/\.git$/i, "").replace(/^\/+|\/+$/g, "");
  if (!GITHUB_LOCATOR.test(value)) throw new Error(`Unsupported GitHub source locator: ${locator}`);
  return value;
}

function validateRef(ref: string): void {
  if (FULL_SHA.test(ref)) return;
  if (!SAFE_REF.test(ref) || ref.includes("..") || ref.startsWith("-") || ref.includes("//")) throw new Error(`Unsafe or unsupported Git ref: ${ref}`);
}

function githubUrl(locator: string): string {
  return `https://github.com/${normalizeGithubLocator(locator)}.git`;
}

export function resolveGithubRevision(locator: string, requestedRef = "HEAD"): string {
  const normalized = normalizeGithubLocator(locator);
  validateRef(requestedRef);
  if (FULL_SHA.test(requestedRef)) return requestedRef.toLowerCase();
  const url = githubUrl(normalized);
  const refs = requestedRef.toUpperCase() === "HEAD"
    ? ["HEAD"]
    : [`refs/heads/${requestedRef}`, `refs/tags/${requestedRef}^{}`, `refs/tags/${requestedRef}`];
  const result = run("git", ["ls-remote", "--exit-code", url, ...refs], { timeoutMs: 30_000, maxOutputBytes: 16_384 });
  if (!result.ok) throw new Error(`Unable to resolve ${normalized}@${requestedRef}: ${result.stderr || result.stdout}`);
  const rows = result.stdout.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => line.split(/\s+/));
  const peeled = rows.find((row) => row[1]?.endsWith("^{}"));
  const chosen = peeled ?? rows[0];
  const sha = chosen?.[0];
  if (!sha || !FULL_SHA.test(sha)) throw new Error(`GitHub did not return an exact commit for ${normalized}@${requestedRef}.`);
  return sha.toLowerCase();
}

function cacheRoot(locator: string): string {
  return resolve(dockyardHome(), "source-cache", "github", normalizeGithubLocator(locator).replace("/", "--"));
}

function verifyCached(path: string, revision: string): boolean {
  if (!run("git", ["rev-parse", "--is-inside-work-tree"], { cwd: path, timeoutMs: 5_000, maxOutputBytes: 4_096 }).ok) return false;
  const head = run("git", ["rev-parse", "HEAD"], { cwd: path, timeoutMs: 5_000, maxOutputBytes: 4_096 });
  return head.ok && head.stdout.toLowerCase() === revision.toLowerCase();
}

export async function fetchGithubRevision(locator: string, revision: string): Promise<string> {
  const normalized = normalizeGithubLocator(locator);
  if (!FULL_SHA.test(revision)) throw new Error("fetchGithubRevision requires an exact 40-character commit SHA.");
  const parent = cacheRoot(normalized);
  const finalPath = resolve(parent, revision.toLowerCase());
  await mkdir(parent, { recursive: true });
  if (await exists(finalPath)) {
    if (verifyCached(finalPath, revision)) return finalPath;
    await rm(finalPath, { recursive: true, force: true });
  }

  const staging = resolve(parent, `.staging-${revision.slice(0, 12)}-${randomUUID().slice(0, 8)}`);
  await mkdir(staging, { recursive: true });
  try {
    const init = run("git", ["init", "--quiet"], { cwd: staging, timeoutMs: 10_000, maxOutputBytes: 8_192 });
    if (!init.ok) throw new Error(init.stderr || "git init failed");
    const remote = run("git", ["remote", "add", "origin", githubUrl(normalized)], { cwd: staging, timeoutMs: 5_000, maxOutputBytes: 8_192 });
    if (!remote.ok) throw new Error(remote.stderr || "git remote add failed");
    const fetched = run("git", ["-c", "protocol.file.allow=never", "fetch", "--quiet", "--depth=1", "--no-tags", "origin", revision], { cwd: staging, timeoutMs: 90_000, maxOutputBytes: 32_768 });
    if (!fetched.ok) throw new Error(fetched.stderr || fetched.stdout || `Unable to fetch ${normalized}@${revision}`);
    const checkout = run("git", ["checkout", "--quiet", "--detach", "FETCH_HEAD"], { cwd: staging, timeoutMs: 30_000, maxOutputBytes: 16_384 });
    if (!checkout.ok) throw new Error(checkout.stderr || checkout.stdout || "git checkout failed");
    const head = run("git", ["rev-parse", "HEAD"], { cwd: staging, timeoutMs: 5_000, maxOutputBytes: 4_096 });
    if (!head.ok || head.stdout.toLowerCase() !== revision.toLowerCase()) throw new Error(`Fetched revision mismatch: expected ${revision}, got ${head.stdout || "unknown"}`);
    // Submodules are intentionally never initialized. Git hooks are not imported from repository content.
    if (await exists(finalPath)) await rm(finalPath, { recursive: true, force: true });
    await rename(staging, finalPath);
    return finalPath;
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

export async function resolveCapabilitySource(candidate: Candidate, requestedRef = "HEAD"): Promise<ResolvedCapabilitySource> {
  if (candidate.source.type !== "github") throw new Error(`${candidate.id}: distribution fetch currently supports GitHub skill sources only.`);
  if (candidate.kind !== "skill") throw new Error(`${candidate.id}: automatic capability distribution currently supports Agent Skills only; ${candidate.kind} installation uses its provider/tool-specific path.`);
  const revision = resolveGithubRevision(candidate.source.locator, requestedRef);
  const repositoryPath = await fetchGithubRevision(candidate.source.locator, revision);
  return {
    candidateId: candidate.id,
    sourceType: candidate.source.type,
    sourceLocator: normalizeGithubLocator(candidate.source.locator),
    requestedRef,
    revision,
    repositoryPath,
    fetchedAt: new Date().toISOString(),
  };
}
