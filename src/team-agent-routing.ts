import type { TeamPhaseId } from "./team-types.js";

export interface AgentRoutingRule {
  phases: TeamPhaseId[];
  role: "specialist" | "implementer" | "reviewer";
  leadPhases?: TeamPhaseId[];
}

const specialist = (phases: TeamPhaseId[], leadPhases?: TeamPhaseId[]): AgentRoutingRule => ({ phases, role: "specialist", ...(leadPhases ? { leadPhases } : {}) });
const implementer = (phases: TeamPhaseId[]): AgentRoutingRule => ({ phases, role: "implementer" });
const reviewer = (phases: TeamPhaseId[], leadPhases?: TeamPhaseId[]): AgentRoutingRule => ({ phases, role: "reviewer", ...(leadPhases ? { leadPhases } : {}) });

export const agentRouting: Record<string, AgentRoutingRule> = {
  // Original core roster.
  "requirements-agent": specialist(["discovery"], ["discovery"]),
  "research-agent": specialist(["discovery"]),
  "provider-selector-agent": specialist(["discovery", "architecture"]),
  "memory-agent": specialist(["discovery", "planning"]),
  "architect-agent": specialist(["architecture", "planning"], ["architecture"]),
  "security-architect-agent": specialist(["architecture", "security"]),
  "planner-agent": specialist(["planning"], ["planning"]),
  "frontend-agent": implementer(["implementation"]),
  "backend-agent": implementer(["implementation"]),
  "database-agent": implementer(["architecture", "implementation"]),
  "mobile-agent": implementer(["implementation"]),
  "debugger-agent": implementer(["implementation"]),
  "refactor-agent": implementer(["implementation"]),
  "migration-agent": implementer(["planning", "implementation"]),
  "devops-agent": implementer(["implementation", "release"]),
  "qa-reviewer-agent": reviewer(["verification"]),
  "browser-qa-agent": reviewer(["verification"]),
  "accessibility-agent": reviewer(["verification"]),
  "performance-agent": reviewer(["verification"]),
  "api-reviewer-agent": reviewer(["verification"]),
  "security-reviewer-agent": reviewer(["security"], ["security"]),
  "release-verifier-agent": reviewer(["release"], ["release"]),
  "observability-agent": specialist(["verification", "release"]),
  "docs-agent": specialist(["release"]),

  // Product, discovery and architecture.
  "product-manager-agent": specialist(["discovery", "planning"], ["discovery"]),
  "domain-analyst-agent": specialist(["discovery"]),
  "solution-architect-agent": specialist(["architecture", "planning"], ["architecture"]),
  "cloud-architect-agent": specialist(["architecture", "planning"], ["architecture"]),
  "data-architect-agent": specialist(["architecture", "planning"], ["architecture"]),
  "ai-architect-agent": specialist(["architecture", "planning"], ["architecture"]),
  "mcp-architect-agent": specialist(["architecture", "planning"], ["architecture"]),
  "threat-model-agent": specialist(["architecture", "security"]),
  "migration-planner-agent": specialist(["planning"], ["planning"]),

  // Implementation specialists.
  "sdk-agent": implementer(["implementation"]),
  "cli-agent": implementer(["implementation"]),
  "payments-agent": implementer(["implementation"]),
  "auth-agent": implementer(["architecture", "implementation", "security"]),
  "data-engineer-agent": implementer(["implementation"]),
  "ml-engineer-agent": implementer(["implementation"]),
  "rag-agent": implementer(["implementation"]),
  "infra-agent": implementer(["architecture", "implementation", "release"]),
  "kubernetes-agent": implementer(["architecture", "implementation", "release"]),
  "terraform-agent": implementer(["planning", "implementation", "release"]),
  "cloudflare-agent": implementer(["architecture", "implementation", "release"]),
  "aws-agent": implementer(["architecture", "implementation", "release"]),
  "azure-agent": implementer(["architecture", "implementation", "release"]),
  "gcp-agent": implementer(["architecture", "implementation", "release"]),
  "desktop-agent": implementer(["implementation"]),
  "extension-agent": implementer(["implementation"]),
  "browser-extension-agent": implementer(["implementation"]),
  "game-agent": implementer(["implementation"]),
  "three-d-agent": implementer(["implementation"]),
  "monorepo-agent": implementer(["architecture", "implementation"]),
  "dependency-upgrade-agent": implementer(["planning", "implementation"]),
  "websocket-agent": implementer(["architecture", "implementation"]),
  "search-agent": implementer(["architecture", "implementation"]),
  "vector-search-agent": implementer(["architecture", "implementation"]),
  "device-automation-agent": specialist(["verification"]),

  // Independent verification/security reviewers.
  "mcp-reviewer-agent": reviewer(["verification", "security"]),
  "privacy-agent": reviewer(["architecture", "security"]),
  "supply-chain-security-agent": reviewer(["security"]),
  "secrets-reviewer-agent": reviewer(["security"]),
  "dependency-security-agent": reviewer(["security"]),
  "frontend-reviewer-agent": reviewer(["verification"]),
  "backend-reviewer-agent": reviewer(["verification"]),
  "database-rls-reviewer-agent": reviewer(["verification", "security"]),
  "api-contract-agent": reviewer(["verification"]),
  "evals-agent": reviewer(["verification"]),
  "prompt-safety-agent": reviewer(["security"]),
  "red-team-agent": reviewer(["security"]),
  "cost-agent": reviewer(["architecture", "verification"]),
  "migration-verifier-agent": reviewer(["verification"]),
  "i18n-agent": reviewer(["verification"]),
  "seo-agent": reviewer(["verification"]),
  "dx-agent": reviewer(["verification", "release"]),
  "accessibility-reviewer-agent": reviewer(["verification"]),
  "performance-reviewer-agent": reviewer(["verification"]),
  "mobile-qa-agent": reviewer(["verification"]),
  "compliance-agent": reviewer(["security", "release"]),
  "data-privacy-agent": reviewer(["architecture", "security"]),
  "data-quality-agent": reviewer(["verification"]),

  // Operations and release specialists.
  "incident-agent": specialist(["discovery", "implementation", "verification"]),
  "sre-agent": specialist(["architecture", "verification", "release"]),
  "release-manager-agent": specialist(["release"], ["release"]),
  "technical-writer-agent": specialist(["release"]),
};

export function routingForAgent(agentId: string): AgentRoutingRule {
  const routing = agentRouting[agentId];
  if (!routing) throw new Error(`Agent has no explicit phase routing: ${agentId}`);
  return routing;
}

export function validateAgentRouting(agentIds: string[]): string[] {
  const errors: string[] = [];
  const known = new Set(agentIds);
  for (const [id, routing] of Object.entries(agentRouting)) {
    if (!known.has(id)) errors.push(`agent routing references missing candidate: ${id}`);
    if (!routing.phases.length) errors.push(`agent routing has no phases: ${id}`);
    if (new Set(routing.phases).size !== routing.phases.length) errors.push(`agent routing has duplicate phases: ${id}`);
    for (const leadPhase of routing.leadPhases ?? []) {
      if (!routing.phases.includes(leadPhase)) errors.push(`agent lead phase is not an assigned phase: ${id}/${leadPhase}`);
    }
  }
  for (const id of agentIds) if (!agentRouting[id]) errors.push(`agent candidate has no explicit phase routing: ${id}`);
  return errors;
}
