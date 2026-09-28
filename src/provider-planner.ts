import type {
  ProviderCapabilityPlan,
  ProviderDefinition,
  ProviderPlan,
  ProviderPlanCandidate,
  ProviderPlanRequest,
  ProviderProbeResult,
  ProviderReadiness,
} from "./types.js";
import { providers } from "./registry.js";
import { providerAdapter } from "./provider-adapters.js";
import { probeProviders } from "./provider-detection.js";
import {
  assessProviderPricingForCapability,
  loadCachedProviderPricingEvidence,
  providerPricingDefinitions,
  refreshProviderPricingEvidence,
  type ProviderPricingEvidence,
} from "./provider-pricing.js";

const READINESS_SCORE: Record<ProviderReadiness, number> = {
  linked: 42,
  authenticated: 34,
  configured: 24,
  installed: 12,
  unknown: 0,
  degraded: -8,
  unavailable: -10,
};

const FALLBACK_PRIORITY: Record<string, string[]> = {
  source: ["github"],
  ci: ["github"],
  releases: ["github"],
  "web-hosting": ["vercel", "cloudflare", "firebase", "render", "flyio", "railway"],
  "static-hosting": ["github-pages", "cloudflare", "vercel", "firebase"],
  "preview-deployments": ["vercel", "cloudflare", "render", "railway"],
  serverless: ["vercel", "cloud-run"],
  "edge-functions": ["cloudflare", "supabase"],
  services: ["render", "railway", "flyio", "cloud-run"],
  containers: ["flyio", "cloud-run"],
  postgres: ["supabase", "neon", "render", "railway"],
  "serverless-postgres": ["neon", "supabase"],
  auth: ["supabase", "firebase", "appwrite", "pocketbase"],
  database: ["appwrite", "pocketbase", "firebase"],
  "document-database": ["firebase", "appwrite"],
  sqlite: ["turso", "pocketbase"],
  "edge-database": ["turso", "cloudflare"],
  "object-storage": ["cloudflare", "supabase", "firebase", "appwrite", "pocketbase"],
  realtime: ["supabase", "firebase", "pocketbase"],
  functions: ["firebase", "appwrite", "cloud-run"],
  dns: ["cloudflare"],
  cdn: ["cloudflare"],
  waf: ["cloudflare"],
  ddos: ["cloudflare"],
  domains: ["vercel", "cloudflare"],
  errors: ["sentry"],
  performance: ["sentry"],
  tracing: ["sentry"],
};

const CAPABILITY_NOTES: Record<string, string[]> = {
  auth: ["Authentication providers differ in session, OAuth, MFA, and authorization models; fallback may require application changes."],
  postgres: ["Postgres providers are broadly compatible at SQL level, but extensions, connection pooling, branching, auth integration, and backup features differ."],
  "object-storage": ["Object-storage APIs and signed URL/access-control models differ; use a Dockyard storage abstraction before switching providers."],
  realtime: ["Realtime semantics differ between database-change streams, document listeners, and websocket APIs; this is not a drop-in substitution."],
  "web-hosting": ["Framework/runtime support, serverless limits, edge behavior, domains, and preview workflows differ between hosts."],
  waf: ["DockyardOS does not treat generic hosting as an equivalent WAF fallback. If no compatible security provider is available, leave this requirement unresolved."],
  ddos: ["DDoS/CDN protection is a distinct infrastructure capability; do not silently substitute an application host that lacks equivalent protection."],
  dns: ["DNS is an infrastructure control-plane capability. Provider migration requires explicit approval and a rollback plan."],
};

interface CandidatePricingSummary {
  verification: string;
  freshness: string;
  freeModels: string[];
  sourceUrls: string[];
  scoreAdjustment: number;
}

type PricedProviderPlanCandidate = ProviderPlanCandidate & { pricing?: CandidatePricingSummary };
export type ProviderPlanWithPricing = ProviderPlan & { pricingEvidence: ProviderPricingEvidence[] };

function providerById(id: string): ProviderDefinition | undefined {
  return providers.find((provider) => provider.id === id);
}

function capabilityProviders(capability: string): ProviderDefinition[] {
  const direct = providers.filter((provider) => provider.capabilities.includes(capability));
  const ordered = FALLBACK_PRIORITY[capability] ?? [];
  return [...direct].sort((a, b) => {
    const ai = ordered.indexOf(a.id);
    const bi = ordered.indexOf(b.id);
    if (ai === -1 && bi === -1) return a.id.localeCompare(b.id);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

function probeFor(id: string, probes: ProviderProbeResult[]): ProviderProbeResult | undefined {
  return probes.find((probe) => probe.providerId === id);
}

function rankCandidate(
  provider: ProviderDefinition,
  capability: string,
  request: ProviderPlanRequest,
  probes: ProviderProbeResult[],
  pricingByProvider: Map<string, ProviderPricingEvidence>,
  preferredForRequirement: string[] = [],
): PricedProviderPlanCandidate | undefined {
  if (request.excludedProviders?.includes(provider.id)) return undefined;
  const adapter = providerAdapter(provider.id);
  if (adapter && !adapter.environments.includes(request.environment)) return undefined;

  const probe = probeFor(provider.id, probes);
  const readiness = probe?.readiness ?? "unknown";
  const reasons: string[] = [];
  let score = READINESS_SCORE[readiness];
  reasons.push(`local readiness ${readiness} ${READINESS_SCORE[readiness] >= 0 ? "+" : ""}${READINESS_SCORE[readiness]}`);

  const explicitPreferred = [...(request.preferredProviders ?? []), ...preferredForRequirement];
  if (explicitPreferred.includes(provider.id)) {
    score += 40;
    reasons.push("explicit preference +40");
  }

  const priority = FALLBACK_PRIORITY[capability] ?? [];
  const index = priority.indexOf(provider.id);
  if (index >= 0) {
    const points = Math.max(2, 28 - index * 4);
    score += points;
    reasons.push(`capability fallback priority +${points}`);
  }

  const stackMatches = provider.tags.filter((tag) => request.stack.map((item) => item.toLowerCase()).includes(tag.toLowerCase()));
  if (stackMatches.length) {
    const points = stackMatches.length * 7;
    score += points;
    reasons.push(`stack fit (${stackMatches.join(", ")}) +${points}`);
  }

  let pricing: CandidatePricingSummary | undefined;
  let livePricingCheckRequired = provider.requiresLiveAvailabilityCheck;
  if (request.costPreference === "free-first") {
    const assessment = assessProviderPricingForCapability(pricingByProvider.get(provider.id), capability);
    score += assessment.pricingScore;
    reasons.push(assessment.reason);
    livePricingCheckRequired = assessment.livePricingCheckRequired;
    pricing = {
      verification: assessment.verification,
      freshness: assessment.freshness,
      freeModels: assessment.verifiedModels,
      sourceUrls: assessment.sourceUrls,
      scoreAdjustment: assessment.pricingScore,
    };
  } else if (request.costPreference === "performance") {
    reasons.push("performance preference requested; benchmark/provider-specific evaluation remains required");
  }

  if (probe?.authenticated === false) reasons.push("local account is not authenticated");
  if (probe?.installed === false) reasons.push("local CLI is not installed");

  return {
    provider,
    readiness,
    score,
    reasons,
    capabilities: [capability],
    liveAvailabilityCheckRequired: provider.requiresLiveAvailabilityCheck,
    livePricingCheckRequired,
    ...(pricing ? { pricing } : {}),
  };
}

function pricingProviderIds(request: ProviderPlanRequest): string[] {
  const configured = new Set(providerPricingDefinitions.map((definition) => definition.providerId));
  const ids = new Set<string>();
  for (const requirement of request.requirements) {
    for (const provider of capabilityProviders(requirement.capability)) {
      if (!request.excludedProviders?.includes(provider.id) && configured.has(provider.id)) ids.add(provider.id);
    }
  }
  return [...ids].sort();
}

export async function planProviders(root: string, request: ProviderPlanRequest): Promise<ProviderPlanWithPricing> {
  const probes = await probeProviders(root, { live: request.live });
  const pricingEvidence = request.costPreference === "free-first"
    ? request.live
      ? await refreshProviderPricingEvidence(pricingProviderIds(request))
      : await loadCachedProviderPricingEvidence(pricingProviderIds(request))
    : [];
  const pricingByProvider = new Map(pricingEvidence.map((item) => [item.providerId, item]));
  const capabilityPlans: ProviderCapabilityPlan[] = [];
  const unresolved: string[] = [];

  for (const requirement of request.requirements) {
    const compatible = capabilityProviders(requirement.capability);
    const ranked = compatible
      .map((provider) => rankCandidate(provider, requirement.capability, request, probes, pricingByProvider, requirement.preferredProviders ?? []))
      .filter((candidate): candidate is PricedProviderPlanCandidate => Boolean(candidate))
      .sort((a, b) => b.score - a.score);

    const selected = ranked[0];
    if (!selected && requirement.required) unresolved.push(requirement.capability);
    capabilityPlans.push({
      capability: requirement.capability,
      required: requirement.required,
      ...(selected ? { selected } : {}),
      fallbacks: ranked.slice(selected ? 1 : 0),
      compatibilityNotes: CAPABILITY_NOTES[requirement.capability] ?? [],
    });
  }

  return {
    request,
    probes,
    capabilities: capabilityPlans,
    unresolved,
    requiresApprovalBeforeProductionMutation: request.environment === "production",
    pricingEvidence,
  };
}

export function providerPlanSummary(plan: ProviderPlan): Record<string, unknown> {
  const pricedPlan = plan as ProviderPlanWithPricing;
  return {
    environment: plan.request.environment,
    costPreference: plan.request.costPreference,
    liveChecked: plan.request.live,
    pricingEvidence: pricedPlan.pricingEvidence?.map((item) => ({
      providerId: item.providerId,
      verification: item.verification,
      freshness: item.freshness,
      verifiedModels: item.verifiedModels,
      fetchedAt: item.fetchedAt,
      evidenceSha256: item.evidenceSha256,
      sources: item.sources.map((source) => ({
        sourceId: source.sourceId,
        url: source.url,
        status: source.status,
        sha256: source.sha256,
        bytes: source.bytes,
        verifiedModels: source.verifiedModels,
        error: source.error,
      })),
    })) ?? [],
    choices: plan.capabilities.map((item) => {
      const selected = item.selected as PricedProviderPlanCandidate | undefined;
      return {
        capability: item.capability,
        required: item.required,
        selected: selected ? {
          id: selected.provider.id,
          name: selected.provider.displayName,
          readiness: selected.readiness,
          score: selected.score,
          liveAvailabilityCheckRequired: selected.liveAvailabilityCheckRequired,
          livePricingCheckRequired: selected.livePricingCheckRequired,
          ...(selected.pricing ? { pricing: selected.pricing } : {}),
        } : null,
        fallbacks: item.fallbacks.slice(0, 4).map((candidate) => {
          const priced = candidate as PricedProviderPlanCandidate;
          return {
            id: candidate.provider.id,
            readiness: candidate.readiness,
            score: candidate.score,
            ...(priced.pricing ? { pricing: priced.pricing } : {}),
          };
        }),
        notes: item.compatibilityNotes,
      };
    }),
    unresolved: plan.unresolved,
    approvalRequiredForProductionMutation: plan.requiresApprovalBeforeProductionMutation,
  };
}

export function fallbackChain(capability: string): string[] {
  const ordered = FALLBACK_PRIORITY[capability] ?? [];
  const direct = capabilityProviders(capability).map((provider) => provider.id);
  return [...new Set([...ordered.filter((id) => providerById(id)?.capabilities.includes(capability)), ...direct])];
}
