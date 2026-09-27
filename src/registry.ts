import type { Candidate, ProviderDefinition, UpdateChannel } from "./types.js";
import { catalog, categoryNames } from "./catalog.js";

export { catalog, categoryNames };
export const candidates = catalog;

export const providers: ProviderDefinition[] = [
  { id: "github", displayName: "GitHub", capabilities: ["source", "issues", "pull-requests", "ci", "releases"], connectionKinds: ["mcp", "api", "cli"], tags: ["git", "automation"], requiresLiveAvailabilityCheck: false },
  { id: "vercel", displayName: "Vercel", capabilities: ["web-hosting", "preview-deployments", "serverless", "domains"], connectionKinds: ["mcp", "api", "cli"], tags: ["web", "nextjs"], requiresLiveAvailabilityCheck: true },
  { id: "cloudflare", displayName: "Cloudflare", capabilities: ["dns", "cdn", "waf", "ddos", "edge-functions", "web-hosting", "object-storage"], connectionKinds: ["api", "cli", "mcp"], tags: ["security", "edge"], requiresLiveAvailabilityCheck: true },
  { id: "supabase", displayName: "Supabase", capabilities: ["postgres", "auth", "object-storage", "realtime", "edge-functions"], connectionKinds: ["mcp", "api", "cli", "sdk"], tags: ["baas", "postgres"], requiresLiveAvailabilityCheck: true },
  { id: "neon", displayName: "Neon", capabilities: ["postgres", "serverless-postgres"], connectionKinds: ["api", "cli", "sdk"], tags: ["database", "postgres"], requiresLiveAvailabilityCheck: true },
  { id: "firebase", displayName: "Firebase", capabilities: ["auth", "document-database", "object-storage", "functions", "web-hosting"], connectionKinds: ["api", "cli", "sdk"], tags: ["baas", "google"], requiresLiveAvailabilityCheck: true },
  { id: "appwrite", displayName: "Appwrite", capabilities: ["auth", "database", "object-storage", "functions"], connectionKinds: ["api", "sdk", "cli"], tags: ["baas", "self-hostable"], requiresLiveAvailabilityCheck: true },
  { id: "pocketbase", displayName: "PocketBase", capabilities: ["auth", "database", "object-storage", "realtime"], connectionKinds: ["api", "sdk", "cli"], tags: ["self-hostable", "lightweight"], requiresLiveAvailabilityCheck: true },
  { id: "render", displayName: "Render", capabilities: ["web-hosting", "services", "postgres", "cron"], connectionKinds: ["api", "cli"], tags: ["hosting", "backend"], requiresLiveAvailabilityCheck: true },
  { id: "railway", displayName: "Railway", capabilities: ["web-hosting", "services", "databases"], connectionKinds: ["api", "cli"], tags: ["hosting", "backend"], requiresLiveAvailabilityCheck: true },
  { id: "turso", displayName: "Turso", capabilities: ["sqlite", "edge-database"], connectionKinds: ["api", "cli", "sdk"], tags: ["database", "edge"], requiresLiveAvailabilityCheck: true },
  { id: "sentry", displayName: "Sentry", capabilities: ["errors", "performance", "tracing"], connectionKinds: ["api", "sdk"], tags: ["observability"], requiresLiveAvailabilityCheck: true },
  { id: "flyio", displayName: "Fly.io", capabilities: ["web-hosting", "services", "containers", "edge-deployments"], connectionKinds: ["api", "cli"], tags: ["hosting", "containers"], requiresLiveAvailabilityCheck: true },
  { id: "cloud-run", displayName: "Google Cloud Run", capabilities: ["containers", "services", "serverless"], connectionKinds: ["api", "cli", "sdk"], tags: ["google", "containers"], requiresLiveAvailabilityCheck: true },
  { id: "github-pages", displayName: "GitHub Pages", capabilities: ["static-hosting"], connectionKinds: ["api", "cli"], tags: ["github", "static"], requiresLiveAvailabilityCheck: true }
];

const CHANNEL_RANK: Record<UpdateChannel, number> = { stable: 0, recommended: 1, edge: 2, dev: 3 };

export function getCandidate(id: string): Candidate | undefined {
  return catalog.find((candidate) => candidate.id === id);
}

export function providersFor(capability: string): ProviderDefinition[] {
  return providers.filter((provider) => provider.capabilities.includes(capability));
}

export function catalogSearch(input: {
  query?: string;
  category?: string;
  kind?: Candidate["kind"];
  channel?: UpdateChannel;
  host?: string;
  stack?: string;
}): Candidate[] {
  const query = input.query?.trim().toLowerCase();
  const maxChannel = CHANNEL_RANK[input.channel ?? "recommended"];
  return catalog
    .filter((candidate) => !input.category || candidate.category === input.category)
    .filter((candidate) => !input.kind || candidate.kind === input.kind)
    .filter((candidate) => CHANNEL_RANK[candidate.defaultChannel] <= maxChannel)
    .filter((candidate) => !input.host || candidate.hosts.includes(input.host as Candidate["hosts"][number]) || candidate.hosts.includes("universal"))
    .filter((candidate) => !input.stack || candidate.stacks.length === 0 || candidate.stacks.includes(input.stack.toLowerCase()))
    .filter((candidate) => {
      if (!query) return true;
      const haystack = [candidate.id, candidate.displayName, candidate.category, ...candidate.capabilities, ...candidate.tags, ...candidate.stacks].join(" ").toLowerCase();
      return haystack.includes(query);
    });
}

export function validateCatalog(): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const candidate of catalog) {
    if (seen.has(candidate.id)) errors.push(`duplicate candidate id: ${candidate.id}`);
    seen.add(candidate.id);
    if (!candidate.category) errors.push(`${candidate.id}: missing category`);
    if (!candidate.capabilities.length) errors.push(`${candidate.id}: no capabilities`);
    if (!candidate.source.locator) errors.push(`${candidate.id}: missing source locator`);
    if (candidate.maturity < 0 || candidate.maturity > 100) errors.push(`${candidate.id}: maturity out of range`);
    if (candidate.maintenance < 0 || candidate.maintenance > 100) errors.push(`${candidate.id}: maintenance out of range`);
  }
  if (categoryNames.length < 20) errors.push(`catalog has too few categories: ${categoryNames.length}`);
  return errors;
}
