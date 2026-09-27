export type ProviderHealthId = "github" | "vercel" | "cloudflare" | "supabase";
export type ProviderHealthState = "healthy" | "degraded" | "outage" | "unavailable" | "invalid";
export type ProviderStatusIndicator = "none" | "minor" | "major" | "critical";

export interface ProviderHealthDefinition {
  providerId: ProviderHealthId;
  displayName: string;
  endpoint: string;
  hostname: string;
}

export interface ProviderHealthResult {
  schemaVersion: 1;
  providerId: ProviderHealthId;
  displayName: string;
  health: ProviderHealthState;
  checkedAt: string;
  sourceUrl: string;
  sourceUpdatedAt?: string;
  indicator?: ProviderStatusIndicator;
  description?: string;
  unresolvedIncidentCount: number;
  affectedComponentCount: number;
  error?: string;
  summary: string;
}

interface StatusPageSummary {
  page?: {
    name?: unknown;
    url?: unknown;
    updated_at?: unknown;
  };
  status?: {
    indicator?: unknown;
    description?: unknown;
  };
  components?: Array<{
    status?: unknown;
  }>;
  incidents?: Array<{
    status?: unknown;
    impact?: unknown;
  }>;
}

export const providerHealthDefinitions: ProviderHealthDefinition[] = [
  {
    providerId: "github",
    displayName: "GitHub",
    endpoint: "https://www.githubstatus.com/api/v2/summary.json",
    hostname: "www.githubstatus.com",
  },
  {
    providerId: "vercel",
    displayName: "Vercel",
    endpoint: "https://www.vercel-status.com/api/v2/summary.json",
    hostname: "www.vercel-status.com",
  },
  {
    providerId: "cloudflare",
    displayName: "Cloudflare",
    endpoint: "https://www.cloudflarestatus.com/api/v2/summary.json",
    hostname: "www.cloudflarestatus.com",
  },
  {
    providerId: "supabase",
    displayName: "Supabase",
    endpoint: "https://status.supabase.com/api/v2/summary.json",
    hostname: "status.supabase.com",
  },
];

const MAX_RESPONSE_BYTES = 512 * 1024;
const DEFAULT_TIMEOUT_MS = 5_000;
const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 15_000;
const COMPONENT_PROBLEM_STATES = new Set(["degraded_performance", "partial_outage", "major_outage", "under_maintenance"]);
const INCIDENT_OPEN_STATES = new Set(["investigating", "identified", "monitoring"]);

function boundedTimeout(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return DEFAULT_TIMEOUT_MS;
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.round(value)));
}

function safeDescription(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value.trim().replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ");
  return clean ? clean.slice(0, 300) : undefined;
}

function healthForIndicator(indicator: ProviderStatusIndicator): ProviderHealthState {
  if (indicator === "none") return "healthy";
  if (indicator === "minor") return "degraded";
  return "outage";
}

function indicator(value: unknown): ProviderStatusIndicator | undefined {
  return value === "none" || value === "minor" || value === "major" || value === "critical" ? value : undefined;
}

function validSourceUrl(value: unknown, expectedHostname: string): boolean {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === expectedHostname && url.username === "" && url.password === "";
  } catch {
    return false;
  }
}

function validTimestamp(value: unknown): string | undefined {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return undefined;
  return new Date(value).toISOString();
}

export function providerHealthFromSummary(
  definition: ProviderHealthDefinition,
  payload: unknown,
  checkedAt = new Date(),
): ProviderHealthResult {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {
      schemaVersion: 1,
      providerId: definition.providerId,
      displayName: definition.displayName,
      health: "invalid",
      checkedAt: checkedAt.toISOString(),
      sourceUrl: definition.endpoint,
      unresolvedIncidentCount: 0,
      affectedComponentCount: 0,
      error: "Official status endpoint returned a non-object payload.",
      summary: `${definition.displayName}: invalid status payload`,
    };
  }

  const summary = payload as StatusPageSummary;
  const statusIndicator = indicator(summary.status?.indicator);
  const sourceUrlOk = validSourceUrl(summary.page?.url, definition.hostname);
  if (!statusIndicator || !sourceUrlOk) {
    return {
      schemaVersion: 1,
      providerId: definition.providerId,
      displayName: definition.displayName,
      health: "invalid",
      checkedAt: checkedAt.toISOString(),
      sourceUrl: definition.endpoint,
      unresolvedIncidentCount: 0,
      affectedComponentCount: 0,
      error: !statusIndicator
        ? "Official status payload omitted a recognized none/minor/major/critical indicator."
        : "Official status payload page URL did not match the pinned provider status host.",
      summary: `${definition.displayName}: invalid status payload`,
    };
  }

  const unresolvedIncidentCount = Array.isArray(summary.incidents)
    ? summary.incidents.filter((item) => INCIDENT_OPEN_STATES.has(String(item?.status ?? ""))).length
    : 0;
  const affectedComponentCount = Array.isArray(summary.components)
    ? summary.components.filter((item) => COMPONENT_PROBLEM_STATES.has(String(item?.status ?? ""))).length
    : 0;
  const health = healthForIndicator(statusIndicator);
  const description = safeDescription(summary.status?.description);
  const sourceUpdatedAt = validTimestamp(summary.page?.updated_at);
  const detail = description ? ` — ${description}` : "";
  return {
    schemaVersion: 1,
    providerId: definition.providerId,
    displayName: definition.displayName,
    health,
    checkedAt: checkedAt.toISOString(),
    sourceUrl: definition.endpoint,
    ...(sourceUpdatedAt ? { sourceUpdatedAt } : {}),
    indicator: statusIndicator,
    ...(description ? { description } : {}),
    unresolvedIncidentCount,
    affectedComponentCount,
    summary: `${definition.displayName}: ${health}${detail}`,
  };
}

async function readBoundedResponse(response: Response): Promise<unknown> {
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new Error("Official status response exceeds DockyardOS's 512 KiB response limit.");
  }
  if (!response.body) throw new Error("Official status response had no body.");
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
      throw new Error("Official status response exceeded DockyardOS's 512 KiB response limit.");
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
    throw new Error("Official status response was not valid JSON.");
  }
}

export async function checkProviderHealth(
  definition: ProviderHealthDefinition,
  options: { timeoutMs?: number; fetchImpl?: typeof fetch; now?: Date } = {},
): Promise<ProviderHealthResult> {
  const checkedAt = options.now ?? new Date();
  const timeoutMs = boundedTimeout(options.timeoutMs);
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(definition.endpoint, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "DockyardOS/0.1 (+https://github.com/cassielxyz/DockyardOS)",
      },
      redirect: "error",
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Official status endpoint returned HTTP ${response.status}.`);
    const payload = await readBoundedResponse(response);
    return providerHealthFromSummary(definition, payload, checkedAt);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      schemaVersion: 1,
      providerId: definition.providerId,
      displayName: definition.displayName,
      health: "unavailable",
      checkedAt: checkedAt.toISOString(),
      sourceUrl: definition.endpoint,
      unresolvedIncidentCount: 0,
      affectedComponentCount: 0,
      error: safeDescription(message) ?? "Official status endpoint was unavailable.",
      summary: `${definition.displayName}: status unavailable`,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function checkProviderHealthSet(
  options: { ids?: string[]; timeoutMs?: number; fetchImpl?: typeof fetch; now?: Date } = {},
): Promise<ProviderHealthResult[]> {
  let selected = providerHealthDefinitions;
  if (options.ids?.length) {
    const requested = [...new Set(options.ids.map((item) => item.trim()).filter(Boolean))];
    const known = new Set(providerHealthDefinitions.map((item) => item.providerId));
    const unknown = requested.filter((item) => !known.has(item as ProviderHealthId));
    if (unknown.length) throw new Error(`Provider health is not configured for: ${unknown.join(", ")}`);
    selected = requested.map((id) => providerHealthDefinitions.find((item) => item.providerId === id)!);
  }
  return Promise.all(selected.map((definition) => checkProviderHealth(definition, options)));
}

export function providerHealthExitCode(results: ProviderHealthResult[]): 0 | 1 | 2 {
  if (results.some((item) => item.health === "unavailable" || item.health === "invalid")) return 2;
  if (results.some((item) => item.health === "degraded" || item.health === "outage")) return 1;
  return 0;
}
