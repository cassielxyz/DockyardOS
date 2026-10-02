import type { Candidate, ProviderDefinition, UpdateChannel } from "./types.js";
import { catalog as baseCatalog } from "./catalog.js";
import { expandedCatalog } from "./catalog-expanded.js";
import { connectorCatalog } from "./catalog-connectors.js";
import { creativeCatalog } from "./catalog-creative.js";
import { cinematicCatalog } from "./catalog-cinematic.js";
import { expandedProviders } from "./providers-expanded.js";
import { validateRecipes } from "./recipes.js";
import { validateAgentRouting } from "./team-agent-routing.js";

const RISK_RANK: Record<Candidate["risk"], number> = { low: 0, medium: 1, high: 2 };
const CONTEXT_RANK: Record<Candidate["contextCost"], number> = { tiny: 0, small: 1, medium: 2, large: 3 };
const CHANNEL_RANK: Record<UpdateChannel, number> = { stable: 0, recommended: 1, edge: 2, dev: 3 };

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function normalizeCandidate(candidate: Candidate): Candidate {
  if (candidate.source.type === "website" && candidate.source.revisionStrategy === "pin-on-install") {
    return {
      ...candidate,
      source: { ...candidate.source, revisionStrategy: "live-metadata-only" },
    };
  }
  return candidate;
}

function higherRisk(a: Candidate["risk"], b: Candidate["risk"]): Candidate["risk"] {
  return RISK_RANK[a] >= RISK_RANK[b] ? a : b;
}

function higherContextCost(a: Candidate["contextCost"], b: Candidate["contextCost"]): Candidate["contextCost"] {
  return CONTEXT_RANK[a] >= CONTEXT_RANK[b] ? a : b;
}

function moreRestrictiveChannel(a: UpdateChannel, b: UpdateChannel): UpdateChannel {
  return CHANNEL_RANK[a] >= CHANNEL_RANK[b] ? a : b;
}

function mergeCompatibleCandidate(existingInput: Candidate, incomingInput: Candidate, priorLayer: string, incomingLayer: string): Candidate {
  const existing = normalizeCandidate(existingInput);
  const incoming = normalizeCandidate(incomingInput);
  const sameIdentity = existing.kind === incoming.kind
    && existing.trust === incoming.trust
    && existing.source.type === incoming.source.type
    && existing.source.locator === incoming.source.locator
    && existing.source.revisionStrategy === incoming.source.revisionStrategy;
  if (!sameIdentity) {
    throw new Error(`DockyardOS mega-registry candidate id collision: ${incoming.id} (${priorLayer} vs ${incomingLayer})`);
  }

  const conflictsWith = unique([...(existing.conflictsWith ?? []), ...(incoming.conflictsWith ?? [])]);
  const requires = unique([...(existing.requires ?? []), ...(incoming.requires ?? [])]);
  return {
    ...existing,
    ...incoming,
    capabilities: unique([...existing.capabilities, ...incoming.capabilities]),
    tags: unique([...existing.tags, ...incoming.tags]),
    stacks: unique([...existing.stacks, ...incoming.stacks]),
    hosts: unique([...existing.hosts, ...incoming.hosts]),
    permissions: unique([...existing.permissions, ...incoming.permissions]),
    risk: higherRisk(existing.risk, incoming.risk),
    contextCost: higherContextCost(existing.contextCost, incoming.contextCost),
    maturity: Math.max(existing.maturity, incoming.maturity),
    maintenance: Math.max(existing.maintenance, incoming.maintenance),
    defaultChannel: moreRestrictiveChannel(existing.defaultChannel, incoming.defaultChannel),
    source: {
      ...existing.source,
      ...incoming.source,
      ...(incoming.source.license ?? existing.source.license ? { license: incoming.source.license ?? existing.source.license } : {}),
    },
    ...(conflictsWith.length ? { conflictsWith } : {}),
    ...(requires.length ? { requires } : {}),
  };
}

function mergeCandidates(layers: Array<{ name: string; candidates: Candidate[] }>): Candidate[] {
  const merged: Candidate[] = [];
  const locations = new Map<string, { index: number; layer: string }>();
  for (const layer of layers) {
    for (const rawCandidate of layer.candidates) {
      const candidate = normalizeCandidate(rawCandidate);
      const prior = locations.get(candidate.id);
      if (!prior) {
        locations.set(candidate.id, { index: merged.length, layer: layer.name });
        merged.push(candidate);
        continue;
      }
      merged[prior.index] = mergeCompatibleCandidate(merged[prior.index]!, candidate, prior.layer, layer.name);
      locations.set(candidate.id, { index: prior.index, layer: `${prior.layer}+${layer.name}` });
    }
  }
  return merged;
}

function mergeProviders(base: ProviderDefinition[], extra: ProviderDefinition[]): ProviderDefinition[] {
  const merged: ProviderDefinition[] = [];
  const seen = new Set<string>();
  for (const provider of [...base, ...extra]) {
    if (seen.has(provider.id)) throw new Error(`DockyardOS provider id collision: ${provider.id}`);
    seen.add(provider.id);
    merged.push(provider);
  }
  return merged;
}

export const catalog: Candidate[] = mergeCandidates([
  { name: "base", candidates: baseCatalog },
  { name: "expanded-official-and-agents", candidates: expandedCatalog },
  { name: "connectors-and-tools", candidates: connectorCatalog },
  { name: "creative-ui", candidates: creativeCatalog },
  { name: "cinematic-web", candidates: cinematicCatalog },
]);

export const categoryNames = [...new Set(catalog.map((candidate) => candidate.category))].sort();
export const candidates = catalog;

const baseProviders: ProviderDefinition[] = [
  { id: "github", displayName: "GitHub", capabilities: ["source", "issues", "pull-requests", "ci", "releases"], connectionKinds: ["mcp", "api", "cli"], tags: ["git", "automation"], requiresLiveAvailabilityCheck: false },
  { id: "vercel", displayName: "Vercel", capabilities: ["web-hosting", "preview-deployments", "serverless", "domains"], connectionKinds: ["mcp", "api", "cli"], tags: ["web", "nextjs"], requiresLiveAvailabilityCheck: true },
  { id: "cloudflare", displayName: "Cloudflare", capabilities: ["dns", "cdn", "waf", "ddos", "edge-functions", "web-hosting", "object-storage", "edge-database", "database"], connectionKinds: ["api", "cli", "mcp"], tags: ["security", "edge", "web"], requiresLiveAvailabilityCheck: true },
  { id: "supabase", displayName: "Supabase", capabilities: ["postgres", "auth", "object-storage", "realtime", "edge-functions", "database"], connectionKinds: ["mcp", "api", "cli", "sdk"], tags: ["baas", "postgres"], requiresLiveAvailabilityCheck: true },
  { id: "neon", displayName: "Neon", capabilities: ["postgres", "serverless-postgres", "database"], connectionKinds: ["mcp", "api", "cli", "sdk"], tags: ["database", "postgres"], requiresLiveAvailabilityCheck: true },
  { id: "firebase", displayName: "Firebase", capabilities: ["auth", "document-database", "database", "object-storage", "functions", "web-hosting", "realtime"], connectionKinds: ["api", "cli", "sdk"], tags: ["baas", "google", "web"], requiresLiveAvailabilityCheck: true },
  { id: "appwrite", displayName: "Appwrite", capabilities: ["auth", "database", "object-storage", "functions", "realtime"], connectionKinds: ["api", "sdk", "cli"], tags: ["baas", "self-hostable"], requiresLiveAvailabilityCheck: true },
  { id: "pocketbase", displayName: "PocketBase", capabilities: ["auth", "database", "object-storage", "realtime", "sqlite"], connectionKinds: ["api", "sdk", "cli"], tags: ["self-hostable", "lightweight"], requiresLiveAvailabilityCheck: true },
  { id: "render", displayName: "Render", capabilities: ["web-hosting", "services", "postgres", "database", "cron"], connectionKinds: ["api", "cli"], tags: ["hosting", "backend"], requiresLiveAvailabilityCheck: true },
  { id: "railway", displayName: "Railway", capabilities: ["web-hosting", "services", "databases", "database", "postgres"], connectionKinds: ["api", "cli"], tags: ["hosting", "backend"], requiresLiveAvailabilityCheck: true },
  { id: "turso", displayName: "Turso", capabilities: ["sqlite", "edge-database", "database"], connectionKinds: ["api", "cli", "sdk"], tags: ["database", "edge"], requiresLiveAvailabilityCheck: true },
  { id: "sentry", displayName: "Sentry", capabilities: ["errors", "performance", "tracing", "observability"], connectionKinds: ["api", "sdk"], tags: ["observability"], requiresLiveAvailabilityCheck: true },
  { id: "flyio", displayName: "Fly.io", capabilities: ["web-hosting", "services", "containers", "edge-deployments"], connectionKinds: ["api", "cli"], tags: ["hosting", "containers"], requiresLiveAvailabilityCheck: true },
  { id: "cloud-run", displayName: "Google Cloud Run", capabilities: ["containers", "services", "serverless", "functions"], connectionKinds: ["api", "cli", "sdk"], tags: ["google", "containers"], requiresLiveAvailabilityCheck: true },
  { id: "github-pages", displayName: "GitHub Pages", capabilities: ["static-hosting"], connectionKinds: ["api", "cli"], tags: ["github", "static"], requiresLiveAvailabilityCheck: true },
];

export const providers: ProviderDefinition[] = mergeProviders(baseProviders, expandedProviders);

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
    if (!candidate.hosts.length) errors.push(`${candidate.id}: no supported hosts`);
    if (candidate.maturity < 0 || candidate.maturity > 100) errors.push(`${candidate.id}: maturity out of range`);
    if (candidate.maintenance < 0 || candidate.maintenance > 100) errors.push(`${candidate.id}: maintenance out of range`);
    if (candidate.source.revisionStrategy === "pin-on-install" && candidate.source.type === "website") errors.push(`${candidate.id}: website source cannot use pin-on-install`);
  }

  const providerIds = new Set<string>();
  for (const provider of providers) {
    if (providerIds.has(provider.id)) errors.push(`duplicate provider id: ${provider.id}`);
    providerIds.add(provider.id);
    if (!provider.capabilities.length) errors.push(`${provider.id}: provider has no capabilities`);
    if (!provider.connectionKinds.length) errors.push(`${provider.id}: provider has no connection kinds`);
  }

  errors.push(...validateRecipes());
  errors.push(...validateAgentRouting(catalog.filter((candidate) => candidate.kind === "agent").map((candidate) => candidate.id)));

  if (catalog.length < 140) errors.push(`mega-registry has too few candidates: ${catalog.length}`);
  if (categoryNames.length < 35) errors.push(`mega-registry has too few categories: ${categoryNames.length}`);
  if (providers.length < 40) errors.push(`provider registry has too few providers: ${providers.length}`);
  return errors;
}
