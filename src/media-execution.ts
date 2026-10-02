import { createHash } from "node:crypto";
import { mkdir, open, rename, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { writeJsonAtomic } from "./fs-utils.js";
import {
  assertLiveMediaExecutionApproval,
  mediaGenerationRequestBody,
  mediaSha256,
  planMediaGeneration,
  type MediaGenerationApprovals,
  type MediaGenerationPlan,
  type MediaGenerationPlanRequest,
} from "./media-generation.js";
import { verifyCurrentVeoPricing, type VeoPricingEvidence } from "./media-pricing.js";
import { projectDirectory, projectIdForRoot } from "./project.js";
import { redactSensitiveOutput } from "./process.js";

const GOOGLE_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const MAX_JSON_BYTES = 1024 * 1024;
const MAX_VIDEO_BYTES = 512 * 1024 * 1024;
const DEFAULT_POLL_MS = 10_000;
const DEFAULT_MAX_POLLS = 90;
const MAX_REDIRECTS = 5;

export interface MediaExecutionDependencies {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
  pollIntervalMs?: number;
  maxPolls?: number;
}

export interface MediaExecutionEvidence {
  schemaVersion: 1;
  providerId: "google-ai";
  actionId: "veo-generate-video";
  projectId: string;
  modelId: string;
  approvalSha256: string;
  requestBodySha256: string;
  promptSha256: string;
  pricing: {
    sourceUrl: string;
    sourceSha256: string;
    checkedAt: string;
    rateUsdPerSecond: number;
    estimatedMaxUsd: number;
    freeTierAvailable: false;
  };
  operationName?: string;
  operationNameSha256?: string;
  status: "preflight" | "submitted" | "failed" | "success";
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  providerRequestSent: boolean;
  output?: {
    path: string;
    sha256: string;
    bytes: number;
    contentType?: string;
  };
  frameSequenceHandoff?: {
    sourcePath: string;
    sourceSha256: string;
    sourceBytes: number;
    ffmpegRequired: true;
    suggestedFps: 24;
    outputDirectory: string;
  };
  error?: string;
  credentialStored: false;
  promptStored: false;
}

export interface MediaExecutionResult {
  status: "success";
  plan: MediaGenerationPlan;
  evidencePath: string;
  evidence: MediaExecutionEvidence;
}

function nowIso(dependencies: MediaExecutionDependencies): string {
  return (dependencies.now?.() ?? new Date()).toISOString();
}

function credentialFromEnvironment(): string {
  const value = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim();
  if (!value) throw new Error("Google AI media execution requires GEMINI_API_KEY or GOOGLE_API_KEY in the current process environment.");
  if (value.length > 4096 || /\s/.test(value)) throw new Error("Google AI credential format is invalid.");
  return value;
}

function mediaDirectory(plan: MediaGenerationPlan): string {
  return resolve(projectDirectory(plan.projectId), "media-generations", plan.approvalSha256);
}

function evidencePath(plan: MediaGenerationPlan): string {
  return resolve(mediaDirectory(plan), "evidence.json");
}

function safeFailure(error: unknown): string {
  const message = redactSensitiveOutput(error instanceof Error ? error.message : String(error));
  return message.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 500) || "Media execution failed.";
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_JSON_BYTES) throw new Error("Google media JSON response exceeds DockyardOS's 1 MiB limit.");
  if (!response.body) throw new Error("Google media API returned no JSON body.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_JSON_BYTES) {
      await reader.cancel();
      throw new Error("Google media JSON response exceeded DockyardOS's 1 MiB limit.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("Google media API returned invalid JSON.");
  }
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function operationNameFrom(value: unknown): string {
  const name = object(value)?.name;
  if (typeof name !== "string") throw new Error("Google media API did not return a long-running operation name.");
  const clean = name.trim();
  if (
    clean.length < 3
    || clean.length > 512
    || clean.includes("..")
    || clean.includes("?")
    || clean.includes("#")
    || !/^[A-Za-z0-9._~-]+(?:\/[A-Za-z0-9._~-]+)+$/.test(clean)
    || !(clean.startsWith("operations/") || clean.includes("/operations/"))
  ) {
    throw new Error("Google media API returned an unsafe operation name.");
  }
  return clean;
}

function operationVideoUri(value: unknown): string | undefined {
  const root = object(value);
  if (!root || root.done !== true) return undefined;
  const response = object(root.response);
  const generate = object(response?.generateVideoResponse);
  const samples = generate?.generatedSamples;
  if (!Array.isArray(samples) || !samples.length) return undefined;
  const video = object(object(samples[0])?.video);
  return typeof video?.uri === "string" ? video.uri : undefined;
}

function operationError(value: unknown): string | undefined {
  const root = object(value);
  const error = object(root?.error);
  if (!error) return undefined;
  const code = typeof error.code === "number" ? `HTTP/API ${error.code}` : "provider error";
  const message = typeof error.message === "string" ? error.message : "Generation operation failed.";
  return safeFailure(`${code}: ${message}`);
}

function validateInitialVideoUri(raw: string): URL {
  const url = new URL(raw);
  if (
    url.protocol !== "https:"
    || url.hostname !== "generativelanguage.googleapis.com"
    || url.username
    || url.password
    || (url.port && url.port !== "443")
  ) {
    throw new Error("Google media operation returned an unapproved initial video download URI.");
  }
  return url;
}

function approvedRedirectHost(hostname: string): boolean {
  return hostname === "generativelanguage.googleapis.com"
    || hostname === "storage.googleapis.com"
    || hostname.endsWith(".googleapis.com")
    || hostname.endsWith(".googleusercontent.com");
}

function apiKeyAllowedForHost(hostname: string): boolean {
  return hostname === "generativelanguage.googleapis.com" || hostname.endsWith(".googleapis.com");
}

async function verifyGoogleCredential(fetchImpl: typeof fetch, credential: string): Promise<void> {
  const response = await fetchImpl(`${GOOGLE_API_BASE}/models`, {
    method: "GET",
    headers: { "x-goog-api-key": credential, Accept: "application/json" },
    redirect: "error",
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Google AI read-only authentication verification failed with HTTP ${response.status}.`);
}

async function downloadVideo(
  fetchImpl: typeof fetch,
  rawUri: string,
  credential: string,
  target: string,
): Promise<{ sha256: string; bytes: number; contentType?: string }> {
  let url = validateInitialVideoUri(rawUri);
  let response: Response | undefined;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const headers: Record<string, string> = { Accept: "video/mp4,video/*,application/octet-stream" };
    if (apiKeyAllowedForHost(url.hostname)) headers["x-goog-api-key"] = credential;
    response = await fetchImpl(url.toString(), { method: "GET", headers, redirect: "manual", cache: "no-store" });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Google media download redirect omitted Location.");
      const next = new URL(location, url);
      if (
        next.protocol !== "https:"
        || !approvedRedirectHost(next.hostname)
        || next.username
        || next.password
        || (next.port && next.port !== "443")
      ) throw new Error("Google media download redirected to an unapproved host.");
      url = next;
      continue;
    }
    break;
  }
  if (!response || response.status >= 300 && response.status < 400) throw new Error("Google media download exceeded the redirect limit.");
  if (!response.ok) throw new Error(`Google media download failed with HTTP ${response.status}.`);
  if (!response.body) throw new Error("Google media download returned no body.");

  const declared = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_VIDEO_BYTES) throw new Error("Generated video exceeds DockyardOS's 512 MiB safety limit.");

  await mkdir(resolve(target, ".."), { recursive: true });
  const temp = `${target}.${process.pid}.tmp`;
  const handle = await open(temp, "w", 0o600);
  const hash = createHash("sha256");
  const reader = response.body.getReader();
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      bytes += value.byteLength;
      if (bytes > MAX_VIDEO_BYTES) {
        await reader.cancel();
        throw new Error("Generated video exceeded DockyardOS's 512 MiB safety limit.");
      }
      hash.update(value);
      await handle.write(value);
    }
    await handle.close();
    await rename(temp, target);
  } catch (error) {
    await handle.close().catch(() => undefined);
    await rm(temp, { force: true }).catch(() => undefined);
    throw error;
  }
  const contentType = response.headers.get("content-type")?.slice(0, 120) || undefined;
  return { sha256: hash.digest("hex"), bytes, ...(contentType ? { contentType } : {}) };
}

async function persistEvidence(plan: MediaGenerationPlan, evidence: MediaExecutionEvidence): Promise<string> {
  const path = evidencePath(plan);
  await writeJsonAtomic(path, evidence);
  return path;
}

function initialEvidence(plan: MediaGenerationPlan, pricing: VeoPricingEvidence, startedAt: string): MediaExecutionEvidence {
  return {
    schemaVersion: 1,
    providerId: "google-ai",
    actionId: "veo-generate-video",
    projectId: plan.projectId,
    modelId: plan.modelId,
    approvalSha256: plan.approvalSha256,
    requestBodySha256: plan.requestBodySha256,
    promptSha256: plan.request.promptSha256,
    pricing: {
      sourceUrl: pricing.sourceUrl,
      sourceSha256: pricing.sourceSha256,
      checkedAt: pricing.checkedAt,
      rateUsdPerSecond: pricing.rateUsdPerSecond,
      estimatedMaxUsd: pricing.estimatedMaxUsd,
      freeTierAvailable: false,
    },
    status: "preflight",
    startedAt,
    updatedAt: startedAt,
    providerRequestSent: false,
    credentialStored: false,
    promptStored: false,
  };
}

export async function executeMediaGeneration(
  root: string,
  request: MediaGenerationPlanRequest,
  approvals: MediaGenerationApprovals,
  dependencies: MediaExecutionDependencies = {},
): Promise<MediaExecutionResult> {
  const plan = planMediaGeneration(root, request);
  assertLiveMediaExecutionApproval(plan, approvals);
  if (plan.projectId !== projectIdForRoot(root)) throw new Error("Media generation project identity changed during planning.");

  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const credential = credentialFromEnvironment();
  await verifyGoogleCredential(fetchImpl, credential);

  const pricing = await verifyCurrentVeoPricing({
    modelId: plan.modelId,
    resolution: plan.request.resolution,
    durationSeconds: plan.request.durationSeconds,
  }, { fetchImpl, now: dependencies.now?.() });
  if (
    pricing.rateUsdPerSecond !== plan.pricing.expectedRateUsdPerSecond
    || pricing.estimatedMaxUsd !== plan.pricing.estimatedMaxUsd
  ) {
    throw new Error("Current official Veo pricing no longer matches the exact approved plan. Re-plan and re-approve before spending.");
  }

  const startedAt = nowIso(dependencies);
  let evidence = initialEvidence(plan, pricing, startedAt);
  const path = await persistEvidence(plan, evidence);
  let operationName: string | undefined;
  try {
    const body = mediaGenerationRequestBody(plan);
    const response = await fetchImpl(plan.endpoint, {
      method: "POST",
      headers: {
        "x-goog-api-key": credential,
        "content-type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      redirect: "error",
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Google Veo generation request failed with HTTP ${response.status}.`);
    operationName = operationNameFrom(await readBoundedJson(response));
    evidence = {
      ...evidence,
      operationName,
      operationNameSha256: mediaSha256(operationName),
      status: "submitted",
      providerRequestSent: true,
      updatedAt: nowIso(dependencies),
    };
    await persistEvidence(plan, evidence);

    const pollIntervalMs = Math.max(1_000, Math.min(60_000, Math.round(dependencies.pollIntervalMs ?? DEFAULT_POLL_MS)));
    const maxPolls = Math.max(1, Math.min(180, Math.round(dependencies.maxPolls ?? DEFAULT_MAX_POLLS)));
    const sleep = dependencies.sleep ?? ((ms: number) => new Promise<void>((resolveSleep) => setTimeout(resolveSleep, ms)));
    let videoUri: string | undefined;

    for (let attempt = 0; attempt < maxPolls; attempt += 1) {
      if (attempt > 0) await sleep(pollIntervalMs);
      const pollUrl = `${GOOGLE_API_BASE}/${operationName}`;
      const poll = await fetchImpl(pollUrl, {
        method: "GET",
        headers: { "x-goog-api-key": credential, Accept: "application/json" },
        redirect: "error",
        cache: "no-store",
      });
      if (!poll.ok) throw new Error(`Google Veo operation polling failed with HTTP ${poll.status}.`);
      const payload = await readBoundedJson(poll);
      const providerError = operationError(payload);
      if (providerError) throw new Error(providerError);
      const rootPayload = object(payload);
      if (rootPayload?.done === true) {
        videoUri = operationVideoUri(payload);
        if (!videoUri) throw new Error("Google Veo operation completed without a generated video URI.");
        break;
      }
    }
    if (!videoUri) throw new Error("Google Veo operation did not complete within DockyardOS's bounded polling window.");

    const directory = mediaDirectory(plan);
    await mkdir(directory, { recursive: true });
    const sourcePath = resolve(directory, "source.mp4");
    const output = await downloadVideo(fetchImpl, videoUri, credential, sourcePath);
    const completedAt = nowIso(dependencies);
    evidence = {
      ...evidence,
      status: "success",
      updatedAt: completedAt,
      completedAt,
      output: { path: sourcePath, ...output },
      frameSequenceHandoff: {
        sourcePath,
        sourceSha256: output.sha256,
        sourceBytes: output.bytes,
        ffmpegRequired: true,
        suggestedFps: 24,
        outputDirectory: resolve(directory, "frames"),
      },
    };
    await persistEvidence(plan, evidence);
    await writeJsonAtomic(resolve(directory, "frame-sequence-handoff.json"), evidence.frameSequenceHandoff);
    return { status: "success", plan, evidencePath: path, evidence };
  } catch (error) {
    const failedAt = nowIso(dependencies);
    evidence = {
      ...evidence,
      ...(operationName ? { operationName, operationNameSha256: mediaSha256(operationName) } : {}),
      status: "failed",
      updatedAt: failedAt,
      completedAt: failedAt,
      error: safeFailure(error),
      providerRequestSent: evidence.providerRequestSent,
    };
    await persistEvidence(plan, evidence).catch(() => undefined);
    throw error;
  }
}
