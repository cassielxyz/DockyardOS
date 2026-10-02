import { createHash } from "node:crypto";
import type { VideoResolution } from "./media-models.js";

export const VEO_PRICING_URL = "https://ai.google.dev/gemini-api/docs/pricing";
const VEO_PRICING_HOST = "ai.google.dev";
const MAX_PRICING_BYTES = 4 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 10_000;

export interface VeoPricingInput {
  modelId: string;
  resolution: VideoResolution;
  durationSeconds: number;
}

export interface VeoPricingEvidence {
  schemaVersion: 1;
  providerId: "google-ai";
  sourceUrl: string;
  checkedAt: string;
  sourceSha256: string;
  sourceBytes: number;
  freeTierAvailable: false;
  billingUnit: "second";
  rateUsdPerSecond: number;
  estimatedMaxUsd: number;
  modelId: string;
  resolution: VideoResolution;
  durationSeconds: number;
  verified: true;
}

const RATES: Record<string, Partial<Record<VideoResolution, number>>> = {
  "veo-3.1-generate-preview": { "720p": 0.40, "1080p": 0.40, "4k": 0.60 },
  "veo-3.1-fast-generate-preview": { "720p": 0.10, "1080p": 0.12, "4k": 0.30 },
  "veo-3.1-lite-generate-preview": { "720p": 0.05, "1080p": 0.08 },
};

const TIER_MARKERS: Record<string, string[]> = {
  "veo-3.1-generate-preview": ["veo 3.1 standard", "$0.40", "$0.60"],
  "veo-3.1-fast-generate-preview": ["veo 3.1 fast", "$0.10", "$0.12", "$0.30"],
  "veo-3.1-lite-generate-preview": ["veo 3.1 lite", "$0.05", "$0.08"],
};

export function expectedVeoRateUsdPerSecond(modelId: string, resolution: VideoResolution): number {
  const rate = RATES[modelId]?.[resolution];
  if (rate === undefined) throw new Error(`No verified Veo pricing rate is configured for ${modelId} at ${resolution}.`);
  return rate;
}

function cleanText(value: string): string {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#36;|&dollar;/gi, "$")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

async function readBoundedText(response: Response): Promise<{ bytes: Uint8Array; text: string }> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_PRICING_BYTES) {
    throw new Error("Official Google AI pricing response exceeds DockyardOS's 4 MiB limit.");
  }
  if (!response.body) throw new Error("Official Google AI pricing response had no body.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_PRICING_BYTES) {
      await reader.cancel();
      throw new Error("Official Google AI pricing response exceeded DockyardOS's 4 MiB limit.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes, text: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
}

function pricingWindow(text: string): string {
  const normalized = cleanText(text);
  const start = normalized.indexOf("veo 3.1");
  if (start < 0) throw new Error("Official pricing page no longer contains the Veo 3.1 section.");
  const nextCandidates = [
    normalized.indexOf("lyria", start + 32),
    normalized.indexOf("gemini 2.5", start + 32),
    normalized.indexOf("imagen", start + 32),
  ].filter((value) => value > start);
  const end = nextCandidates.length ? Math.min(...nextCandidates) : Math.min(normalized.length, start + 12_000);
  return normalized.slice(start, end);
}

function assertPinnedPricingUrl(): void {
  const url = new URL(VEO_PRICING_URL);
  if (url.protocol !== "https:" || url.hostname !== VEO_PRICING_HOST || url.username || url.password || (url.port && url.port !== "443")) {
    throw new Error("Google AI pricing source is not pinned to the expected HTTPS host.");
  }
}

function expectedRateMarker(rate: number): string {
  return `$${rate.toFixed(2)}`;
}

export async function verifyCurrentVeoPricing(
  input: VeoPricingInput,
  options: { fetchImpl?: typeof fetch; now?: Date; timeoutMs?: number } = {},
): Promise<VeoPricingEvidence> {
  assertPinnedPricingUrl();
  const rate = expectedVeoRateUsdPerSecond(input.modelId, input.resolution);
  const controller = new AbortController();
  const timeoutMs = Math.max(1_000, Math.min(15_000, Math.round(options.timeoutMs ?? DEFAULT_TIMEOUT_MS)));
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await (options.fetchImpl ?? fetch)(VEO_PRICING_URL, {
      method: "GET",
      headers: {
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9",
        "User-Agent": "DockyardOS/0.1 (+https://github.com/cassielxyz/DockyardOS)",
      },
      redirect: "error",
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Official Google AI pricing source returned HTTP ${response.status}.`);
    const { bytes, text } = await readBoundedText(response);
    const window = pricingWindow(text);
    const markers = TIER_MARKERS[input.modelId];
    if (!markers?.length || !markers.every((marker) => window.includes(marker))) {
      throw new Error(`Official pricing page no longer matches DockyardOS's verified markers for ${input.modelId}.`);
    }
    if (!window.includes("free tier") || !window.includes("not available")) {
      throw new Error("Official Veo pricing section no longer confirms that the free tier is unavailable.");
    }
    if (!window.includes(expectedRateMarker(rate))) {
      throw new Error(`Official Veo pricing section no longer confirms the expected ${expectedRateMarker(rate)}/second rate.`);
    }
    const estimatedMaxUsd = Number((rate * input.durationSeconds).toFixed(4));
    return {
      schemaVersion: 1,
      providerId: "google-ai",
      sourceUrl: VEO_PRICING_URL,
      checkedAt: (options.now ?? new Date()).toISOString(),
      sourceSha256: createHash("sha256").update(bytes).digest("hex"),
      sourceBytes: bytes.byteLength,
      freeTierAvailable: false,
      billingUnit: "second",
      rateUsdPerSecond: rate,
      estimatedMaxUsd,
      modelId: input.modelId,
      resolution: input.resolution,
      durationSeconds: input.durationSeconds,
      verified: true,
    };
  } finally {
    clearTimeout(timer);
  }
}
