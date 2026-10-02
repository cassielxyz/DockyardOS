import { createHash } from "node:crypto";
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
    detail: string;
  };
  notes: string[];
}

export interface MediaGenerationApprovals {
  approveBillable?: boolean;
  expectedPlanSha256?: string;
}

function sha256(value: string): string {
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
  const requestBody = {
    instances: [{ prompt }],
    parameters: {
      aspectRatio,
      durationSeconds: String(durationSeconds),
      resolution,
      numberOfVideos: 1,
    },
  };
  const requestBodySha256 = sha256(canonical(requestBody));
  const approvalPayload = {
    schemaVersion: 1,
    providerId: "google-ai",
    actionId: "veo-generate-video",
    projectId: projectIdForRoot(root),
    modelId: selected.model.id,
    endpoint,
    requestBodySha256,
    promptSha256: sha256(prompt),
    aspectRatio,
    resolution,
    durationSeconds,
    numberOfVideos: 1,
    billable: true,
  };
  const approvalSha256 = sha256(canonical(approvalPayload));

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
      detail: "Veo generation is billable. Review current official provider pricing immediately before execution; planning never authorizes spend.",
    },
    notes: [
      "This command is plan-only and performs no provider mutation or media generation.",
      "Future execution must re-create the same plan immediately before the request and require exact approvalSha256 binding plus explicit billable approval.",
      "Provider credentials must come from process memory/environment or host secret storage and must never be written into Dockyard checkpoints, source files, plans, or evidence.",
      "Durable generation evidence must store hashes/status/timing/output metadata, not the raw credential.",
    ],
  };
}

export function assertMediaGenerationApproval(
  plan: MediaGenerationPlan,
  approvals: MediaGenerationApprovals,
): void {
  if (!approvals.approveBillable) {
    throw new Error("Billable media generation requires explicit --approve-billable.");
  }
  if (!approvals.expectedPlanSha256 || approvals.expectedPlanSha256.toLowerCase() !== plan.approvalSha256.toLowerCase()) {
    throw new Error("Billable media generation requires --expected-plan-sha256 matching the exact current plan.");
  }
  if (!plan.executionEnabled) {
    throw new Error("Live billable media execution is not enabled in this build; approval validation passed but no provider request was sent.");
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
    credentialStored: false,
    status: "planned",
  };
}
