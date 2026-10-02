import { createHash } from "node:crypto";
import { expectedVeoRateUsdPerSecond, VEO_PRICING_URL } from "./media-pricing.js";
import { projectIdForRoot } from "./project.js";
import {
  selectVideoGenerationModel,
  type VideoModelPriority,
  type VideoResolution,
} from "./media-models.js";

export type MediaAspectRatio = "16:9" | "9:16";
export type MediaDurationSeconds = 4 | 6 | 8;

export interface MediaGenerationPlanRequest {
  prompt: string;
  priority?: VideoModelPriority;
  resolution?: VideoResolution;
  aspectRatio?: MediaAspectRatio;
  durationSeconds?: MediaDurationSeconds;
}

export interface MediaGenerationPlan {
  schemaVersion: 1;
  providerId: "google-ai";
  actionId: "veo-generate-video";
  projectId: string;
  modelId: string;
  billable: true;
  approvalRequired: true;
  executionEnabled: false;
  endpoint: string;
  request: {
    prompt: string;
    promptSha256: string;
    promptCharacters: number;
    aspectRatio: MediaAspectRatio;
    resolution: VideoResolution;
    durationSeconds: MediaDurationSeconds;
    numberOfVideos: 1;
  };
  requestBodySha256: string;
  approvalSha256: string;
  credential: {
    envVars: ["GEMINI_API_KEY", "GOOGLE_API_KEY"];
    header: "x-goog-api-key";
    persistedByDockyardCore: false;
  };
  pricing: {
    status: "live-review-required";
    sourceUrl: string;
    freeTierAvailable: false;
    billingUnit: "second";
    expectedRateUsdPerSecond: number;
    estimatedMaxUsd: number;
    detail: string;
  };
  notes: string[];
}

export interface MediaGenerationApprovals {
  approveBillable?: boolean;
  expectedPlanSha256?: string;
}

export interface MediaGenerationRequestBody {
  instances: Array<{ prompt: string }>;
  parameters: {
    aspectRatio: MediaAspectRatio;
    durationSeconds: string;
    resolution: VideoResolution;
    numberOfVideos: 1;
  };
}

export function mediaSha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonical(item)).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function normalizePrompt(raw: string): string {
  const prompt = raw.replace(/\r\n/g, "\n").trim();
  if (!prompt) throw new Error("Veo generation plan requires a non-empty prompt.");
  if (prompt.length > 16_000) throw new Error("Veo generation prompt is too large for Dockyard's bounded plan.");
  if (prompt.includes("\u0000")) throw new Error("Veo generation prompt contains an invalid NUL character.");
  return prompt;
}

function validateDurationResolution(durationSeconds: MediaDurationSeconds, resolution: VideoResolution): void {
  if ((resolution === "1080p" || resolution === "4k") && durationSeconds !== 8) {
    throw new Error(`${resolution} Veo generation requires an 8-second duration.`);
  }
}

function requestBodyFromValues(
  prompt: string,
  aspectRatio: MediaAspectRatio,
  durationSeconds: MediaDurationSeconds,
  resolution: VideoResolution,
): MediaGenerationRequestBody {
  return {
    instances: [{ prompt }],
    parameters: {
      aspectRatio,
      durationSeconds: String(durationSeconds),
      resolution,
      numberOfVideos: 1,
    },
  };
}

export function mediaGenerationRequestBody(plan: MediaGenerationPlan): MediaGenerationRequestBody {
  const body = requestBodyFromValues(
    plan.request.prompt,
    plan.request.aspectRatio,
    plan.request.durationSeconds,
    plan.request.resolution,
  );
  const digest = mediaSha256(canonical(body));
  if (digest !== plan.requestBodySha256) {
    throw new Error("Media generation plan request body no longer matches its SHA-256 binding.");
  }
  return body;
}

export function planMediaGeneration(root: string, request: MediaGenerationPlanRequest): MediaGenerationPlan {
  const prompt = normalizePrompt(request.prompt);
  const resolution = request.resolution ?? "1080p";
  const durationSeconds = request.durationSeconds ?? (resolution === "720p" ? 6 : 8);
  const aspectRatio = request.aspectRatio ?? "16:9";
  validateDurationResolution(durationSeconds, resolution);

  const selected = selectVideoGenerationModel({
    providerId: "google-ai",
    priority: request.priority ?? "quality",
    resolution,
  });
  if (!selected.model.durationsSeconds.includes(durationSeconds)) {
    throw new Error(`${selected.model.id} does not support ${durationSeconds}-second generation.`);
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${selected.model.id}:predictLongRunning`;
  const requestBody = requestBodyFromValues(prompt, aspectRatio, durationSeconds, resolution);
  const requestBodySha256 = mediaSha256(canonical(requestBody));
  const expectedRateUsdPerSecond = expectedVeoRateUsdPerSecond(selected.model.id, resolution);
  const estimatedMaxUsd = Number((expectedRateUsdPerSecond * durationSeconds).toFixed(4));
  const approvalPayload = {
    schemaVersion: 1,
    providerId: "google-ai",
    actionId: "veo-generate-video",
    projectId: projectIdForRoot(root),
    modelId: selected.model.id,
    endpoint,
    requestBodySha256,
    promptSha256: mediaSha256(prompt),
    aspectRatio,
    resolution,
    durationSeconds,
    numberOfVideos: 1,
    billable: true,
    pricingSourceUrl: VEO_PRICING_URL,
    expectedRateUsdPerSecond,
    estimatedMaxUsd,
  };
  const approvalSha256 = mediaSha256(canonical(approvalPayload));

  return {
    schemaVersion: 1,
    providerId: "google-ai",
    actionId: "veo-generate-video",
    projectId: approvalPayload.projectId,
    modelId: selected.model.id,
    billable: true,
    approvalRequired: true,
    executionEnabled: false,
    endpoint,
    request: {
      prompt,
      promptSha256: approvalPayload.promptSha256,
      promptCharacters: prompt.length,
      aspectRatio,
      resolution,
      durationSeconds,
      numberOfVideos: 1,
    },
    requestBodySha256,
    approvalSha256,
    credential: {
      envVars: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
      header: "x-goog-api-key",
      persistedByDockyardCore: false,
    },
    pricing: {
      status: "live-review-required",
      sourceUrl: VEO_PRICING_URL,
      freeTierAvailable: false,
      billingUnit: "second",
      expectedRateUsdPerSecond,
      estimatedMaxUsd,
      detail: `Veo generation is billable. This plan binds an expected maximum of $${estimatedMaxUsd.toFixed(2)} USD at $${expectedRateUsdPerSecond.toFixed(2)}/second; live official pricing must match immediately before execution.`,
    },
    notes: [
      "Planning performs no provider mutation or media generation.",
      "Live execution must re-create the same plan immediately before the request and require exact approvalSha256 binding plus explicit billable approval.",
      "Provider credentials must come from process memory/environment or host secret storage and must never be written into Dockyard checkpoints, source files, plans, or evidence.",
      "Durable generation evidence stores hashes/status/timing/output metadata, not the raw credential or prompt text.",
    ],
  };
}

// P40.1 compatibility guard: callers using the old plan-only gate continue to fail closed.
export function assertMediaGenerationApproval(
  plan: MediaGenerationPlan,
  approvals: MediaGenerationApprovals,
): void {
  assertLiveMediaExecutionApproval(plan, approvals);
  if (!plan.executionEnabled) {
    throw new Error("Live billable media execution is not enabled through the plan-only P40.1 guard; use the dedicated P40.2 executor.");
  }
}

export function assertLiveMediaExecutionApproval(
  plan: MediaGenerationPlan,
  approvals: MediaGenerationApprovals,
): void {
  if (!approvals.approveBillable) {
    throw new Error("Billable media generation requires explicit --approve-billable.");
  }
  if (!approvals.expectedPlanSha256 || approvals.expectedPlanSha256.toLowerCase() !== plan.approvalSha256.toLowerCase()) {
    throw new Error("Billable media generation requires --expected-plan-sha256 matching the exact current plan.");
  }
}

export function mediaGenerationEvidenceTemplate(plan: MediaGenerationPlan): Record<string, unknown> {
  return {
    schemaVersion: 1,
    providerId: plan.providerId,
    actionId: plan.actionId,
    projectId: plan.projectId,
    modelId: plan.modelId,
    approvalSha256: plan.approvalSha256,
    requestBodySha256: plan.requestBodySha256,
    promptSha256: plan.request.promptSha256,
    aspectRatio: plan.request.aspectRatio,
    resolution: plan.request.resolution,
    durationSeconds: plan.request.durationSeconds,
    numberOfVideos: 1,
    billable: true,
    expectedRateUsdPerSecond: plan.pricing.expectedRateUsdPerSecond,
    estimatedMaxUsd: plan.pricing.estimatedMaxUsd,
    credentialStored: false,
    promptStored: false,
    status: "planned",
  };
}
