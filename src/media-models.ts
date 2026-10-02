export type VideoModelPriority = "quality" | "speed" | "lean";
export type VideoResolution = "720p" | "1080p" | "4k";

export interface VideoGenerationModel {
  id: string;
  providerId: "google-ai";
  family: "veo-3.1";
  tier: "standard" | "fast" | "lite";
  status: "preview";
  outputFps: 24;
  durationsSeconds: number[];
  resolutions: VideoResolution[];
  supportsTextToVideo: true;
  supportsImageToVideo: true;
  supportsReferenceImages: boolean;
  maxReferenceImages: number;
  supportsFirstLastFrame: boolean;
  supportsVideoExtension: boolean;
  notes: string[];
}

export interface VideoModelSelectionRequest {
  providerId?: "google-ai";
  priority?: VideoModelPriority;
  requiresReferenceImages?: boolean;
  requiresFirstLastFrame?: boolean;
  requiresVideoExtension?: boolean;
  resolution?: VideoResolution;
}

export interface VideoModelSelectionResult {
  model: VideoGenerationModel;
  reason: string[];
  alternatives: VideoGenerationModel[];
}

export const videoGenerationModels: VideoGenerationModel[] = [
  {
    id: "veo-3.1-generate-preview",
    providerId: "google-ai",
    family: "veo-3.1",
    tier: "standard",
    status: "preview",
    outputFps: 24,
    durationsSeconds: [4, 6, 8],
    resolutions: ["720p", "1080p", "4k"],
    supportsTextToVideo: true,
    supportsImageToVideo: true,
    supportsReferenceImages: true,
    maxReferenceImages: 3,
    supportsFirstLastFrame: true,
    supportsVideoExtension: true,
    notes: ["Use when the shot needs the richest Veo 3.1 feature set, including reference-image guidance, video extension, or 4K capability."],
  },
  {
    id: "veo-3.1-fast-generate-preview",
    providerId: "google-ai",
    family: "veo-3.1",
    tier: "fast",
    status: "preview",
    outputFps: 24,
    durationsSeconds: [4, 6, 8],
    resolutions: ["720p", "1080p", "4k"],
    supportsTextToVideo: true,
    supportsImageToVideo: true,
    supportsReferenceImages: true,
    maxReferenceImages: 3,
    supportsFirstLastFrame: true,
    supportsVideoExtension: true,
    notes: ["Prefer for iteration speed when the same richer Veo 3.1 controls are still required."],
  },
  {
    id: "veo-3.1-lite-generate-preview",
    providerId: "google-ai",
    family: "veo-3.1",
    tier: "lite",
    status: "preview",
    outputFps: 24,
    durationsSeconds: [4, 6, 8],
    resolutions: ["720p", "1080p"],
    supportsTextToVideo: true,
    supportsImageToVideo: true,
    supportsReferenceImages: false,
    maxReferenceImages: 0,
    supportsFirstLastFrame: true,
    supportsVideoExtension: false,
    notes: ["Use only when its smaller feature set is sufficient; it does not provide reference-image guidance, video extension, or 4K output."],
  },
];

function supports(model: VideoGenerationModel, request: VideoModelSelectionRequest): boolean {
  if (request.requiresReferenceImages && !model.supportsReferenceImages) return false;
  if (request.requiresFirstLastFrame && !model.supportsFirstLastFrame) return false;
  if (request.requiresVideoExtension && !model.supportsVideoExtension) return false;
  if (request.resolution && !model.resolutions.includes(request.resolution)) return false;
  return true;
}

function priorityRank(model: VideoGenerationModel, priority: VideoModelPriority): number {
  if (priority === "speed") return model.tier === "fast" ? 30 : model.tier === "lite" ? 20 : 10;
  if (priority === "lean") return model.tier === "lite" ? 30 : model.tier === "fast" ? 20 : 10;
  return model.tier === "standard" ? 30 : model.tier === "fast" ? 20 : 10;
}

export function selectVideoGenerationModel(request: VideoModelSelectionRequest = {}): VideoModelSelectionResult {
  const providerId = request.providerId ?? "google-ai";
  const priority = request.priority ?? "quality";
  const eligible = videoGenerationModels
    .filter((model) => model.providerId === providerId)
    .filter((model) => supports(model, request))
    .sort((a, b) => priorityRank(b, priority) - priorityRank(a, priority));

  const model = eligible[0];
  if (!model) {
    throw new Error("No verified video-generation model satisfies the requested provider/features/resolution.");
  }

  const reason = [
    `Selected ${model.id} for ${priority} priority.`,
    request.requiresReferenceImages ? "Reference-image guidance is required." : "",
    request.requiresFirstLastFrame ? "First/last-frame interpolation is required." : "",
    request.requiresVideoExtension ? "Video extension is required." : "",
    request.resolution ? `${request.resolution} output is required.` : "",
    "Model selection does not authenticate the provider, spend credits, or generate media by itself.",
  ].filter(Boolean);

  return { model, reason, alternatives: eligible.slice(1) };
}
