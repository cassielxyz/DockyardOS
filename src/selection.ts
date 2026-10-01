import type { Candidate, HostId, ScoredCandidate, SecurityLevel, SelectionRequest, SelectionResult, TeamRecipe, UpdateChannel } from "./types.js";
import { inferSelectionSignals } from "./capability-inference.js";
import { catalog, getCandidate, providers } from "./registry.js";
import { recipes } from "./recipes.js";

const CHANNEL_RANK: Record<UpdateChannel, number> = { stable: 0, recommended: 1, edge: 2, dev: 3 };
const TRUST_SCORE: Record<Candidate["trust"], number> = { official: 18, dockyard: 17, maintainer: 14, community: 8 };
const CONTEXT_PENALTY: Record<Candidate["contextCost"], number> = { tiny: 0, small: 1, medium: 4, large: 9 };

function normalized(values: string[]): string[] {
  return values.map((value) => value.trim().toLowerCase()).filter(Boolean);
}

function uniqueNormalized(values: string[]): string[] {
  return [...new Set(normalized(values))];
}

function intersection(a: string[], b: string[]): string[] {
  const right = new Set(normalized(b));
  return normalized(a).filter((value) => right.has(value));
}

export function inferTaskType(text: string): string {
  const prompt = text.toLowerCase();

  // Explicit operational/failure intent wins over domain words such as login, server, or storage.
  if (/production incident|service incident|production outage|\boutage\b|incident response|root cause/.test(prompt)) return "incident";
  if (/bug|error|crash|broken|fix issue|debug/.test(prompt)) return "bug-fix";

  // Specific practical archetypes must win before broad words such as server, feature, cleanup, or deploy.
  if (/\brag\b|retrieval[- ]augmented|knowledge assistant|knowledge base assistant/.test(prompt)) return "rag";
  if (/\bmcp\b.*(?:server|connector|tool)|model context protocol/.test(prompt)) return "mcp";
  if (/vs ?code extension|visual studio code extension|ide extension|editor extension/.test(prompt)) return "ide-extension";
  if (/browser extension|chrome extension|firefox extension|manifest v3/.test(prompt)) return "browser-extension";
  if (/monorepo|workspace graph|turborepo|nx workspace/.test(prompt)) return "monorepo";
  if (/dependency upgrade|framework upgrade|upgrade dependencies|major version upgrade/.test(prompt)) return "dependency-upgrade";
  if (/kubernetes|\bk8s\b|helm chart|cluster platform/.test(prompt)) return "kubernetes";
  if (/terraform|opentofu|infrastructure as code|\biac\b|cloud infrastructure/.test(prompt)) return "infrastructure";
  if (/stripe|payment|billing|subscription|invoice|checkout session/.test(prompt)) return "payments";
  if (/enterprise.*(?:sso|saas|tenant|organization)|b2b saas|multi[- ]tenant.*sso/.test(prompt)) return "enterprise-saas";
  if (/authentication|authorization|\bauth\b|oauth|openid|\bsso\b|mfa|login|sign[- ]?in/.test(prompt)) return "auth";
  if (/websocket|real[- ]?time|realtime|presence|collaborative editor|live collaboration/.test(prompt)) return "realtime";
  if (/data pipeline|\betl\b|\belt\b|analytics pipeline|data ingestion/.test(prompt)) return "data-pipeline";
  if (/machine learning|\bml\b|model training|model inference|inference service/.test(prompt)) return "machine-learning";
  if (/background job|worker queue|job queue|task queue|scheduled job|cron worker/.test(prompt)) return "background-jobs";
  if (/file upload|media platform|object storage|blob storage|storage service/.test(prompt)) return "storage";
  if (/full[- ]text search|search platform|search engine|search indexing|ranking service/.test(prompt)) return "search";
  if (/command[- ]line|\bcli\b|developer cli/.test(prompt)) return "cli";
  if (/\bsdk\b|client librar|software development kit/.test(prompt)) return "sdk";
  if (/pdf|docx|word document|spreadsheet|xlsx|powerpoint|pptx|document automation|office artifact/.test(prompt)) return "document";
  if (/desktop app|electron app|tauri app/.test(prompt)) return "desktop";
  if (/multiplayer game|game backend|game server/.test(prompt)) return "game";

  if (/vulnerab|security|pentest|hardening|owasp|exploit/.test(prompt)) return "security";
  if (/refactor|cleanup|clean up|tech debt|dead code/.test(prompt)) return "refactor";
  if (/release|production deploy|ship to prod|publish/.test(prompt)) return "release";
  if (/migration|migrate|move database|move provider/.test(prompt)) return "migration";
  if (/performance|slow|optimi[sz]e|lighthouse/.test(prompt)) return "performance";
  if (/landing page|marketing page|portfolio/.test(prompt)) return "landing-page";
  if (/e-?commerce|storefront|shopping/.test(prompt)) return "ecommerce";
  if (/mobile|android|ios|flutter|react native|expo/.test(prompt)) return "mobile";
  if (/ai agent|agentic|chatbot/.test(prompt)) return "agent";
  if (/api|backend|microservice|server/.test(prompt)) return "api";
  if (/build|create|start|new project|from scratch/.test(prompt)) return "new-project";
  return "feature";
}

export function defaultSelectionRequest(input: {
  task?: string;
  taskType?: string;
  stack?: string[];
  capabilities?: string[];
  security?: SecurityLevel;
  host?: HostId;
  channel?: UpdateChannel;
  allowCommunity?: boolean;
  preferred?: string[];
  excluded?: string[];
}): SelectionRequest {
  const task = input.task ?? "feature";
  const inferred = inferSelectionSignals(task);
  return {
    taskType: input.taskType ?? inferTaskType(task),
    stack: uniqueNormalized([...(input.stack ?? []), ...inferred.stacks]),
    capabilities: uniqueNormalized([...(input.capabilities ?? []), ...inferred.capabilities]),
    security: input.security ?? "standard",
    host: input.host ?? "antigravity",
    channel: input.channel ?? "recommended",
    allowCommunity: input.allowCommunity ?? true,
    maxSkills: 8,
    maxAgents: 7,
    maxTools: 6,
    maxMcps: 4,
    ...(input.preferred ? { preferred: input.preferred } : {}),
    ...(input.excluded ? { excluded: input.excluded } : {}),
  };
}

export function chooseRecipe(request: SelectionRequest): TeamRecipe | undefined {
  const stack = new Set(normalized(request.stack));
  return recipes
    .map((recipe) => {
      let score = 0;
      if (recipe.taskTypes.includes(request.taskType)) score += 30;
      const stackMatches = recipe.stacks.filter((item) => stack.has(item.toLowerCase())).length;
      score += stackMatches * 6;
      score += intersection(recipe.capabilities, request.capabilities).length * 5;
      if (request.security === "high" && recipe.securityLevel === "high") score += 8;
      return { recipe, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)[0]?.recipe;
}

function eligible(candidate: Candidate, request: SelectionRequest): boolean {
  if (request.excluded?.includes(candidate.id)) return false;
  if (!request.allowCommunity && candidate.trust === "community") return false;
  if (CHANNEL_RANK[candidate.defaultChannel] > CHANNEL_RANK[request.channel]) return false;
  if (!candidate.hosts.includes(request.host) && !candidate.hosts.includes("universal")) return false;
  return true;
}

export function scoreCandidate(candidate: Candidate, request: SelectionRequest, recipe?: TeamRecipe): ScoredCandidate | undefined {
  if (!eligible(candidate, request)) return undefined;
  const reasons: string[] = [];
  let score = TRUST_SCORE[candidate.trust];
  reasons.push(`${candidate.trust} trust +${TRUST_SCORE[candidate.trust]}`);

  const capabilityMatches = intersection(candidate.capabilities, [...request.capabilities, ...(recipe?.capabilities ?? [])]);
  if (capabilityMatches.length) {
    const points = Math.min(32, capabilityMatches.length * 8);
    score += points;
    reasons.push(`capabilities ${capabilityMatches.join(", ")} +${points}`);
  }

  const stackMatches = intersection(candidate.stacks, request.stack);
  if (stackMatches.length) {
    const points = Math.min(18, stackMatches.length * 6);
    score += points;
    reasons.push(`stack ${stackMatches.join(", ")} +${points}`);
  } else if (candidate.stacks.length === 0) {
    score += 2;
  }

  const taskTerms = new Set([candidate.category, ...candidate.tags, ...candidate.capabilities].map((value) => value.toLowerCase()));
  if (taskTerms.has(request.taskType.toLowerCase())) {
    score += 12;
    reasons.push("task match +12");
  }

  if (request.preferred?.includes(candidate.id)) {
    score += 25;
    reasons.push("user/project preference +25");
  }
  if (recipe?.required.includes(candidate.id)) {
    score += 120;
    reasons.push("recipe required +120");
  } else if (recipe?.preferred.includes(candidate.id)) {
    score += 28;
    reasons.push("recipe preferred +28");
  }

  const specialistIndex = recipe?.agents.indexOf(candidate.id) ?? -1;
  if (specialistIndex >= 0) {
    const points = 72 + Math.max(0, 18 - specialistIndex * 2);
    score += points;
    reasons.push(`recipe specialist +${points}`);
    if (request.security === "high" && candidate.id.includes("security")) {
      score += 22;
      reasons.push("high-security specialist +22");
    }
    if (candidate.id === "qa-reviewer-agent") {
      score += 16;
      reasons.push("independent QA +16");
    }
    if (request.taskType === "release" && candidate.id === "release-verifier-agent") {
      score += 20;
      reasons.push("release verifier +20");
    }
  }

  const quality = Math.round(candidate.maturity * 0.08 + candidate.maintenance * 0.08);
  score += quality;
  reasons.push(`quality +${quality}`);

  const contextPenalty = CONTEXT_PENALTY[candidate.contextCost];
  score -= contextPenalty;
  if (contextPenalty) reasons.push(`context -${contextPenalty}`);

  if (candidate.risk === "high" && request.security === "standard") {
    score -= 12;
    reasons.push("high permission risk -12");
  } else if (candidate.risk === "high") {
    score -= 3;
    reasons.push("high permission risk -3");
  }

  return { candidate, score, reasons };
}

function pickKind(scored: ScoredCandidate[], kind: Candidate["kind"], limit: number, requiredIds: Set<string>): ScoredCandidate[] {
  const pool = scored.filter((entry) => entry.candidate.kind === kind).sort((a, b) => b.score - a.score);
  const picked: ScoredCandidate[] = [];
  const pickedIds = new Set<string>();

  for (const entry of pool.filter((item) => requiredIds.has(item.candidate.id))) {
    if (!pickedIds.has(entry.candidate.id)) {
      picked.push(entry);
      pickedIds.add(entry.candidate.id);
    }
  }

  for (const entry of pool) {
    if (picked.length >= limit) break;
    if (pickedIds.has(entry.candidate.id)) continue;
    const conflict = entry.candidate.conflictsWith?.some((id) => pickedIds.has(id));
    if (conflict) continue;
    picked.push(entry);
    pickedIds.add(entry.candidate.id);
  }
  return picked;
}

function providerScore(id: string, request: SelectionRequest, recipe?: TeamRecipe): number {
  const provider = providers.find((item) => item.id === id);
  if (!provider) return -1;
  let score = 0;
  const desired = new Set([...request.capabilities, ...(recipe?.capabilities ?? [])]);
  score += provider.capabilities.filter((capability) => desired.has(capability)).length * 10;
  score += provider.tags.filter((tag) => request.stack.includes(tag)).length * 8;
  if (request.stack.includes(id)) score += 30;
  if (id === "github") score += 5;
  if (id === "cloudflare" && request.stack.includes("web")) score += 4;
  return score;
}

export function selectCapabilities(request: SelectionRequest): SelectionResult {
  const recipe = chooseRecipe(request);
  const effectiveRequest: SelectionRequest = recipe?.securityLevel === "high" && request.security !== "high"
    ? { ...request, security: "high" }
    : request;
  const scored = catalog
    .map((candidate) => scoreCandidate(candidate, effectiveRequest, recipe))
    .filter((entry): entry is ScoredCandidate => Boolean(entry));

  const requiredIds = new Set<string>([
    ...(recipe?.required ?? []),
    ...(effectiveRequest.security === "high" ? ["owasp", "gitleaks", "osv-scanner", "strix-pentest"] : []),
  ]);

  const providerList = [...providers]
    .map((provider) => ({ provider, score: providerScore(provider.id, effectiveRequest, recipe) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ provider }) => provider);

  return {
    request: effectiveRequest,
    ...(recipe ? { recipe } : {}),
    skills: pickKind(scored, "skill", effectiveRequest.maxSkills, requiredIds),
    agents: pickKind(scored, "agent", effectiveRequest.maxAgents, requiredIds),
    tools: pickKind(scored, "tool", effectiveRequest.maxTools, requiredIds),
    mcps: pickKind(scored, "mcp", effectiveRequest.maxMcps, requiredIds),
    providers: providerList,
    securityGates: effectiveRequest.security === "high"
      ? ["threat-model", "owasp-review", "secret-scan", "dependency-scan", "strix-verification", "post-fix-regression"]
      : ["owasp-review", "secret-scan", "dependency-scan"],
  };
}

export function selectedIds(result: SelectionResult): string[] {
  return [...result.skills, ...result.agents, ...result.tools, ...result.mcps].map((entry) => entry.candidate.id);
}

export function selectionSummary(result: SelectionResult): Record<string, unknown> {
  const summarize = (items: ScoredCandidate[]) => items.map(({ candidate, score }) => ({ id: candidate.id, name: candidate.displayName, category: candidate.category, score }));
  return {
    taskType: result.request.taskType,
    recipe: result.recipe?.id ?? null,
    security: result.request.security,
    skills: summarize(result.skills),
    agents: summarize(result.agents),
    tools: summarize(result.tools),
    mcps: summarize(result.mcps),
    providers: result.providers.map((provider) => ({ id: provider.id, capabilities: provider.capabilities, liveCheckRequired: provider.requiresLiveAvailabilityCheck })),
    securityGates: result.securityGates,
  };
}

export function requireCandidate(id: string): Candidate {
  const candidate = getCandidate(id);
  if (!candidate) throw new Error(`Unknown DockyardOS capability: ${id}`);
  return candidate;
}
