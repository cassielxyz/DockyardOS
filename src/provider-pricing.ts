import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { readJson, writeJsonAtomic } from "./fs-utils.js";
import { dockyardHome } from "./project.js";

export type ProviderFreeModel = "ongoing-free-plan" | "ongoing-free-allowance" | "free-trial";
export type ProviderPricingSourceStatus = "verified" | "unverified" | "unavailable";
export type ProviderPricingVerification = "verified" | "partial" | "unavailable";
export type ProviderPricingFreshness = "fresh" | "stale" | "unknown";

export interface ProviderPricingSourceDefinition {
  id: string;
  url: string;
  hostname: string;
  capabilities: string[];
  modelMarkers: Partial<Record<ProviderFreeModel, string[][]>>;
}

export interface ProviderPricingDefinition {
  providerId: string;
  displayName: string;
  sources: ProviderPricingSourceDefinition[];
}

export interface ProviderPricingSourceEvidence {
  sourceId: string;
  url: string;
  hostname: string;
  capabilities: string[];
  status: ProviderPricingSourceStatus;
  checkedAt: string;
  sha256?: string;
  bytes?: number;
  contentType?: string;
  etag?: string;
  lastModified?: string;
  verifiedModels: ProviderFreeModel[];
  matchedMarkers: Partial<Record<ProviderFreeModel, string[]>>;
  error?: string;
}

export interface ProviderPricingEvidence {
  schemaVersion: 1;
  providerId: string;
  displayName: string;
  fetchedAt: string;
  freshness: ProviderPricingFreshness;
  verification: ProviderPricingVerification;
  verifiedModels: ProviderFreeModel[];
  evidenceSha256?: string;
  sources: ProviderPricingSourceEvidence[];
}

export interface ProviderPricingCapabilityAssessment {
  providerId: string;
  capability: string;
  pricingScore: number;
  verifiedModels: ProviderFreeModel[];
  sourceUrls: string[];
  freshness: ProviderPricingFreshness;
  verification: ProviderPricingVerification;
  livePricingCheckRequired: boolean;
  reason: string;
}

interface ProviderPricingCache {
  schemaVersion: 1;
  updatedAt: string;
  providers: Record<string, ProviderPricingEvidence>;
}

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 6_000;
const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 15_000;
const DEFAULT_FRESHNESS_MS = 24 * 60 * 60 * 1000;

function markerGroups(...groups: string[][]): string[][] {
  return groups;
}

export const providerPricingDefinitions: ProviderPricingDefinition[] = [
  {
    providerId: "vercel",
    displayName: "Vercel",
    sources: [{
      id: "vercel-pricing",
      url: "https://vercel.com/pricing",
      hostname: "vercel.com",
      capabilities: ["web-hosting", "static-hosting", "preview-deployments", "serverless", "domains"],
      modelMarkers: {
        "ongoing-free-plan": markerGroups(["hobby"], ["$0/mo", "$0 /mo", "$0/month", "$0 / month"]),
      },
    }],
  },
  {
    providerId: "cloudflare",
    displayName: "Cloudflare",
    sources: [
      {
        id: "cloudflare-workers-pricing",
        url: "https://developers.cloudflare.com/workers/platform/pricing/",
        hostname: "developers.cloudflare.com",
        capabilities: ["web-hosting", "static-hosting", "serverless", "edge-functions", "cdn", "waf", "ddos"],
        modelMarkers: {
          "ongoing-free-plan": markerGroups(["workers free", "free plan"], ["100,000 requests", "100k requests", "free plan limits"]),
        },
      },
      {
        id: "cloudflare-r2-pricing",
        url: "https://developers.cloudflare.com/r2/pricing/",
        hostname: "developers.cloudflare.com",
        capabilities: ["object-storage", "edge-database"],
        modelMarkers: {
          "ongoing-free-allowance": markerGroups(["free tier"], ["10 gb-month", "10 gb month"], ["1 million requests", "10 million requests"]),
        },
      },
    ],
  },
  {
    providerId: "supabase",
    displayName: "Supabase",
    sources: [{
      id: "supabase-billing",
      url: "https://supabase.com/docs/guides/platform/billing-on-supabase",
      hostname: "supabase.com",
      capabilities: ["postgres", "serverless-postgres", "auth", "object-storage", "realtime", "edge-functions"],
      modelMarkers: {
        "ongoing-free-plan": markerGroups(["free plan"], ["two free projects", "2 free projects"]),
      },
    }],
  },
  {
    providerId: "neon",
    displayName: "Neon",
    sources: [{
      id: "neon-pricing",
      url: "https://neon.com/pricing",
      hostname: "neon.com",
      capabilities: ["postgres", "serverless-postgres"],
      modelMarkers: {
        "ongoing-free-plan": markerGroups(["free"], ["$0", "free plan"], ["project", "compute"]),
      },
    }],
  },
  {
    providerId: "firebase",
    displayName: "Firebase",
    sources: [{
      id: "firebase-pricing",
      url: "https://firebase.google.com/pricing",
      hostname: "firebase.google.com",
      capabilities: ["web-hosting", "static-hosting", "auth", "document-database", "object-storage", "functions", "realtime"],
      modelMarkers: {
        "ongoing-free-plan": markerGroups(["spark plan"], ["no-cost", "no cost"], ["no payment method", "payment method"]),
      },
    }],
  },
  {
    providerId: "appwrite",
    displayName: "Appwrite",
    sources: [{
      id: "appwrite-free-plan",
      url: "https://appwrite.io/docs/advanced/billing/free",
      hostname: "appwrite.io",
      capabilities: ["auth", "database", "document-database", "object-storage", "functions"],
      modelMarkers: {
        "ongoing-free-plan": markerGroups(["free plan"], ["2 projects", "two projects"], ["appwrite cloud"]),
      },
    }],
  },
  {
    providerId: "render",
    displayName: "Render",
    sources: [{
      id: "render-free",
      url: "https://render.com/docs/free",
      hostname: "render.com",
      capabilities: ["web-hosting", "preview-deployments", "services", "postgres"],
      modelMarkers: {
        "ongoing-free-plan": markerGroups(["deploy for free", "free web services"], ["web services", "static sites"], ["free"]),
      },
    }],
  },
  {
    providerId: "railway",
    displayName: "Railway",
    sources: [{
      id: "railway-free-trial",
      url: "https://docs.railway.com/pricing/free-trial",
      hostname: "docs.railway.com",
      capabilities: ["web-hosting", "preview-deployments", "services", "postgres"],
      modelMarkers: {
        "free-trial": markerGroups(["free trial"], ["30 days", "$5"]),
        "ongoing-free-plan": markerGroups(["free plan"], ["$1 of free credit per month", "$1"]),
      },
    }],
  },
  {
    providerId: "turso",
    displayName: "Turso",
    sources: [{
      id: "turso-pricing",
      url: "https://turso.tech/pricing",
      hostname: "turso.tech",
      capabilities: ["sqlite", "edge-database"],
      modelMarkers: {
        "ongoing-free-plan": markerGroups(["free"], ["$0/month", "$0 / month", "$0"], ["no credit card", "start free"]),
      },
    }],
  },
  {
    providerId: "flyio",
    displayName: "Fly.io",
    sources: [{
      id: "fly-free-trial",
      url: "https://fly.io/docs/about/free-trial/",
      hostname: "fly.io",
      capabilities: ["web-hosting", "services", "containers"],
      modelMarkers: {
        "free-trial": markerGroups(["free trial"], ["7 days", "2 hours"], ["apps will stop", "billing is set up", "add a payment method"]),
      },
    }],
  },
  {
    providerId: "cloud-run",
    displayName: "Google Cloud Run",
    sources: [{
      id: "cloud-run-pricing",
      url: "https://cloud.google.com/run/pricing",
      hostname: "cloud.google.com",
      capabilities: ["serverless", "services", "containers"],
      modelMarkers: {
        "ongoing-free-allowance": markerGroups(["free tier"], ["resets every month", "monthly"], ["after the free tier", "free tier is applied"]),
      },
    }],
  },
];

function cachePath(): string {
  return resolve(dockyardHome(), "provider-pricing", "cache.json");
}

function boundedTimeout(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return DEFAULT_TIMEOUT_MS;
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.round(value)));
}

function cleanText(value: string): string {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#36;|&dollar;/gi, "$")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function modelsForText(definition: ProviderPricingSourceDefinition, text: string): {
  models: ProviderFreeModel[];
  markers: Partial<Record<ProviderFreeModel, string[]>>;
} {
  const normalized = cleanText(text);
  const models: ProviderFreeModel[] = [];
  const markers: Partial<Record<ProviderFreeModel, string[]>> = {};
  for (const model of ["ongoing-free-plan", "ongoing-free-allowance", "free-trial"] as ProviderFreeModel[]) {
    const groups = definition.modelMarkers[model];
    if (!groups?.length) continue;
    const matched: string[] = [];
    let verified = true;
    for (const group of groups) {
      const marker = group.find((candidate) => normalized.includes(candidate.toLowerCase()));
      if (!marker) {
        verified = false;
        break;
      }
      matched.push(marker);
    }
    if (verified) {
      models.push(model);
      markers[model] = matched;
    }
  }
  return { models, markers };
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 300) || "Pricing source unavailable.";
}

async function readBoundedText(response: Response): Promise<{ bytes: Uint8Array; text: string }> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) throw new Error("Official pricing response exceeds DockyardOS's 2 MiB response limit.");
  if (!response.body) throw new Error("Official pricing response had no body.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error("Official pricing response exceeded DockyardOS's 2 MiB response limit.");
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

function validatePinnedSource(definition: ProviderPricingSourceDefinition): void {
  const url = new URL(definition.url);
  if (url.protocol !== "https:" || url.hostname !== definition.hostname || url.username || url.password || (url.port && url.port !== "443")) {
    throw new Error(`Pricing source ${definition.id} is not pinned to its declared HTTPS host.`);
  }
}

export async function fetchProviderPricingSource(
  definition: ProviderPricingSourceDefinition,
  options: { timeoutMs?: number; fetchImpl?: typeof fetch; now?: Date } = {},
): Promise<ProviderPricingSourceEvidence> {
  const checkedAt = (options.now ?? new Date()).toISOString();
  try {
    validatePinnedSource(definition);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), boundedTimeout(options.timeoutMs));
    try {
      const response = await (options.fetchImpl ?? fetch)(definition.url, {
        method: "GET",
        headers: {
          Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,application/json;q=0.8",
          "User-Agent": "DockyardOS/0.1 (+https://github.com/cassielxyz/DockyardOS)",
        },
        redirect: "error",
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Official pricing source returned HTTP ${response.status}.`);
      const { bytes, text } = await readBoundedText(response);
      const classified = modelsForText(definition, text);
      const contentType = response.headers.get("content-type")?.slice(0, 120) || undefined;
      const etag = response.headers.get("etag")?.slice(0, 200) || undefined;
      const lastModified = response.headers.get("last-modified")?.slice(0, 120) || undefined;
      return {
        sourceId: definition.id,
        url: definition.url,
        hostname: definition.hostname,
        capabilities: definition.capabilities,
        status: classified.models.length ? "verified" : "unverified",
        checkedAt,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        bytes: bytes.byteLength,
        ...(contentType ? { contentType } : {}),
        ...(etag ? { etag } : {}),
        ...(lastModified ? { lastModified } : {}),
        verifiedModels: classified.models,
        matchedMarkers: classified.markers,
        ...(classified.models.length ? {} : { error: "Official pricing page was reachable, but current content did not match DockyardOS's free-plan/trial evidence markers." }),
      };
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    return {
      sourceId: definition.id,
      url: definition.url,
      hostname: definition.hostname,
      capabilities: definition.capabilities,
      status: "unavailable",
      checkedAt,
      verifiedModels: [],
      matchedMarkers: {},
      error: safeError(error),
    };
  }
}

function aggregateEvidence(definition: ProviderPricingDefinition, sources: ProviderPricingSourceEvidence[], now: Date): ProviderPricingEvidence {
  const verifiedModels = [...new Set(sources.flatMap((source) => source.status === "verified" ? source.verifiedModels : []))].sort() as ProviderFreeModel[];
  const verifiedCount = sources.filter((source) => source.status === "verified").length;
  const verification: ProviderPricingVerification = verifiedCount === sources.length && sources.length
    ? "verified"
    : verifiedCount > 0
      ? "partial"
      : "unavailable";
  const hashed = sources.filter((source) => source.sha256).map((source) => `${source.sourceId}:${source.sha256}`).sort();
  return {
    schemaVersion: 1,
    providerId: definition.providerId,
    displayName: definition.displayName,
    fetchedAt: now.toISOString(),
    freshness: "fresh",
    verification,
    verifiedModels,
    ...(hashed.length ? { evidenceSha256: createHash("sha256").update(hashed.join("\n")).digest("hex") } : {}),
    sources,
  };
}

function withFreshness(evidence: ProviderPricingEvidence, now: Date, maxAgeMs: number): ProviderPricingEvidence {
  const fetched = Date.parse(evidence.fetchedAt);
  const freshness: ProviderPricingFreshness = Number.isFinite(fetched)
    ? (now.getTime() - fetched <= maxAgeMs && now.getTime() >= fetched ? "fresh" : "stale")
    : "unknown";
  return { ...evidence, freshness };
}

function selectedDefinitions(ids?: string[]): ProviderPricingDefinition[] {
  if (!ids?.length) return providerPricingDefinitions;
  const requested = [...new Set(ids.map((item) => item.trim()).filter(Boolean))];
  const known = new Set(providerPricingDefinitions.map((item) => item.providerId));
  const unknown = requested.filter((item) => !known.has(item));
  if (unknown.length) throw new Error(`Provider pricing evidence is not configured for: ${unknown.join(", ")}`);
  return requested.map((id) => providerPricingDefinitions.find((item) => item.providerId === id)!);
}

export async function refreshProviderPricingEvidence(
  ids?: string[],
  options: { timeoutMs?: number; fetchImpl?: typeof fetch; now?: Date } = {},
): Promise<ProviderPricingEvidence[]> {
  const now = options.now ?? new Date();
  const definitions = selectedDefinitions(ids);
  const evidence = await Promise.all(definitions.map(async (definition) => aggregateEvidence(
    definition,
    await Promise.all(definition.sources.map((source) => fetchProviderPricingSource(source, { ...options, now }))),
    now,
  )));
  const existing = await readJson<ProviderPricingCache>(cachePath());
  const providers: Record<string, ProviderPricingEvidence> = existing?.schemaVersion === 1 ? { ...existing.providers } : {};
  for (const item of evidence) providers[item.providerId] = item;
  await writeJsonAtomic(cachePath(), { schemaVersion: 1, updatedAt: now.toISOString(), providers } satisfies ProviderPricingCache);
  return evidence;
}

export async function loadCachedProviderPricingEvidence(
  ids?: string[],
  options: { now?: Date; maxAgeMs?: number } = {},
): Promise<ProviderPricingEvidence[]> {
  const definitions = selectedDefinitions(ids);
  const cache = await readJson<ProviderPricingCache>(cachePath());
  if (!cache || cache.schemaVersion !== 1) return [];
  const now = options.now ?? new Date();
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_FRESHNESS_MS;
  return definitions
    .map((definition) => cache.providers[definition.providerId])
    .filter((item): item is ProviderPricingEvidence => Boolean(item))
    .map((item) => withFreshness(item, now, maxAgeMs));
}

export function assessProviderPricingForCapability(
  evidence: ProviderPricingEvidence | undefined,
  capability: string,
): ProviderPricingCapabilityAssessment {
  if (!evidence) {
    return {
      providerId: "unknown",
      capability,
      pricingScore: 0,
      verifiedModels: [],
      sourceUrls: [],
      freshness: "unknown",
      verification: "unavailable",
      livePricingCheckRequired: true,
      reason: "no official pricing evidence is cached; live pricing validation is required",
    };
  }
  const relevant = evidence.sources.filter((source) => source.capabilities.includes(capability) && source.status === "verified");
  const models = [...new Set(relevant.flatMap((source) => source.verifiedModels))].sort() as ProviderFreeModel[];
  const fresh = evidence.freshness === "fresh";
  let pricingScore = 0;
  let reason = "official pricing evidence is stale or not verified for this capability; no free-tier ranking advantage applied";
  if (fresh && models.includes("ongoing-free-plan")) {
    pricingScore = 18;
    reason = "fresh official evidence confirms an ongoing free plan +18";
  } else if (fresh && models.includes("ongoing-free-allowance")) {
    pricingScore = 14;
    reason = "fresh official evidence confirms an ongoing recurring free allowance +14";
  } else if (fresh && models.includes("free-trial")) {
    pricingScore = -8;
    reason = "fresh official evidence confirms only a time/credit-limited free trial for this capability -8";
  }
  return {
    providerId: evidence.providerId,
    capability,
    pricingScore,
    verifiedModels: models,
    sourceUrls: relevant.map((source) => source.url),
    freshness: evidence.freshness,
    verification: evidence.verification,
    livePricingCheckRequired: !(fresh && relevant.length > 0),
    reason,
  };
}

export function providerPricingCacheLocation(): string {
  return cachePath();
}
