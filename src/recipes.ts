import type { TeamRecipe } from "./types.js";
import { getCandidate } from "./registry.js";
import { expandedRecipes } from "./recipes-expanded.js";

const baseRecipes: TeamRecipe[] = [
  {
    id: "saas-web",
    displayName: "Production SaaS Web App",
    taskTypes: ["new-project", "feature", "saas"],
    stacks: ["web", "nextjs", "react", "supabase", "postgres"],
    capabilities: ["requirements", "architecture", "ui-design", "database", "auth", "e2e", "security", "deployment"],
    required: ["owasp", "gitleaks", "osv-scanner", "playwright"],
    preferred: ["superpowers", "ui-ux-pro-max", "shadcn", "vercel-react-best-practices", "supabase-postgres-best-practices", "github-mcp"],
    agents: ["requirements-agent", "architect-agent", "planner-agent", "frontend-agent", "backend-agent", "database-agent", "security-reviewer-agent", "qa-reviewer-agent", "release-verifier-agent"],
    securityLevel: "high",
    workflowProfile: "full",
  },
  {
    id: "landing-page",
    displayName: "Premium Marketing / Landing Page",
    taskTypes: ["new-project", "landing-page", "ui"],
    stacks: ["web", "nextjs", "react"],
    capabilities: ["ui-design", "design-system", "responsive", "accessibility", "web-performance", "deployment"],
    required: ["playwright", "axe-core", "lighthouse"],
    preferred: ["ui-ux-pro-max", "shadcn", "vercel-web-design-guidelines", "vercel-react-best-practices", "deploy-to-vercel"],
    agents: ["frontend-agent", "browser-qa-agent", "accessibility-agent", "performance-agent"],
    securityLevel: "standard",
    workflowProfile: "standard",
  },
  {
    id: "ecommerce-web",
    displayName: "E-commerce Web App",
    taskTypes: ["new-project", "feature", "ecommerce"],
    stacks: ["web", "nextjs", "react", "postgres"],
    capabilities: ["architecture", "ui-design", "database", "api", "payments", "security", "e2e", "deployment"],
    required: ["owasp", "gitleaks", "osv-scanner", "playwright", "strix-pentest"],
    preferred: ["superpowers", "ui-ux-pro-max", "shadcn", "vercel-react-best-practices", "supabase-postgres-best-practices"],
    agents: ["requirements-agent", "architect-agent", "frontend-agent", "backend-agent", "database-agent", "security-architect-agent", "security-reviewer-agent", "qa-reviewer-agent", "release-verifier-agent"],
    securityLevel: "high",
    workflowProfile: "full",
  },
  {
    id: "api-service",
    displayName: "Production API / Backend Service",
    taskTypes: ["new-project", "feature", "api", "backend"],
    stacks: ["node", "typescript", "python", "postgres"],
    capabilities: ["architecture", "api", "database", "contract-testing", "security", "observability"],
    required: ["owasp", "gitleaks", "osv-scanner"],
    preferred: ["superpowers", "supabase-postgres-best-practices", "semgrep", "trivy"],
    agents: ["architect-agent", "planner-agent", "backend-agent", "database-agent", "api-reviewer-agent", "security-reviewer-agent", "qa-reviewer-agent", "observability-agent"],
    securityLevel: "high",
    workflowProfile: "full",
  },
  {
    id: "ai-agent-app",
    displayName: "AI Agent Application",
    taskTypes: ["new-project", "feature", "ai", "agent"],
    stacks: ["web", "typescript", "python", "workers"],
    capabilities: ["agents", "tool-use", "mcp", "state", "security", "observability", "e2e"],
    required: ["owasp", "gitleaks", "osv-scanner", "playwright"],
    preferred: ["superpowers", "cloudflare-agents-sdk", "mcp-registry", "github-mcp", "agent-reach"],
    agents: ["requirements-agent", "architect-agent", "research-agent", "backend-agent", "security-architect-agent", "security-reviewer-agent", "qa-reviewer-agent", "observability-agent"],
    securityLevel: "high",
    workflowProfile: "full",
  },
  {
    id: "mobile-app",
    displayName: "Production Mobile App",
    taskTypes: ["new-project", "feature", "mobile"],
    stacks: ["android", "kotlin", "flutter", "react-native", "expo"],
    capabilities: ["mobile-ui", "architecture", "api", "security", "testing", "release"],
    required: ["owasp", "gitleaks", "osv-scanner"],
    preferred: ["ui-ux-pro-max", "vercel-react-native", "superpowers"],
    agents: ["requirements-agent", "architect-agent", "mobile-agent", "backend-agent", "security-reviewer-agent", "qa-reviewer-agent", "release-verifier-agent"],
    securityLevel: "high",
    workflowProfile: "full",
  },
  {
    id: "cloudflare-edge-app",
    displayName: "Cloudflare Edge Application",
    taskTypes: ["new-project", "feature", "edge"],
    stacks: ["workers", "cloudflare", "typescript", "nextjs"],
    capabilities: ["workers", "edge-functions", "state", "security", "deployment"],
    required: ["owasp", "gitleaks", "osv-scanner"],
    preferred: ["cloudflare-skill", "cloudflare-durable-objects", "cloudflare-nextjs", "cloudflare-mcp"],
    agents: ["architect-agent", "backend-agent", "security-reviewer-agent", "devops-agent", "release-verifier-agent"],
    securityLevel: "high",
    workflowProfile: "full",
  },
  {
    id: "threejs-experience",
    displayName: "Interactive 3D Web Experience",
    taskTypes: ["new-project", "feature", "3d", "animation"],
    stacks: ["web", "react", "nextjs", "threejs", "r3f"],
    capabilities: ["ui-design", "animation", "browser-test", "web-performance", "accessibility"],
    required: ["playwright", "lighthouse"],
    preferred: ["ui-ux-pro-max", "vercel-web-design-guidelines", "vercel-react-best-practices"],
    agents: ["architect-agent", "frontend-agent", "browser-qa-agent", "performance-agent", "accessibility-agent"],
    securityLevel: "standard",
    workflowProfile: "standard",
  },
  {
    id: "security-tool",
    displayName: "Cybersecurity / Security Tool",
    taskTypes: ["new-project", "feature", "security-tool", "cybersecurity"],
    stacks: ["python", "go", "typescript", "cli"],
    capabilities: ["security-architecture", "appsec", "testing", "cli", "safe-execution"],
    required: ["owasp", "gitleaks", "osv-scanner", "semgrep", "strix-pentest"],
    preferred: ["superpowers", "trivy", "codeql"],
    agents: ["requirements-agent", "architect-agent", "security-architect-agent", "backend-agent", "security-reviewer-agent", "qa-reviewer-agent"],
    securityLevel: "high",
    workflowProfile: "full",
  },
  {
    id: "bug-fix",
    displayName: "Root-cause Bug Fix",
    taskTypes: ["bug", "bug-fix", "debug"],
    stacks: [],
    capabilities: ["root-cause-analysis", "regression", "verification"],
    required: [],
    preferred: ["superpowers"],
    agents: ["debugger-agent", "qa-reviewer-agent"],
    securityLevel: "standard",
    workflowProfile: "standard",
  },
  {
    id: "safe-refactor",
    displayName: "Safe Refactor / Cleanup",
    taskTypes: ["refactor", "cleanup", "tech-debt"],
    stacks: [],
    capabilities: ["refactor", "behavior-preservation", "regression", "code-review"],
    required: [],
    preferred: ["shadcn-improve", "superpowers"],
    agents: ["architect-agent", "refactor-agent", "qa-reviewer-agent"],
    securityLevel: "standard",
    workflowProfile: "standard",
  },
  {
    id: "security-hardening",
    displayName: "Security Hardening and Verification",
    taskTypes: ["security", "audit", "hardening", "vulnerability-fix"],
    stacks: [],
    capabilities: ["threat-model", "appsec", "sast", "pentest", "security-fix", "security-rerun"],
    required: ["owasp", "gitleaks", "osv-scanner", "semgrep", "strix-pentest", "strix-fix"],
    preferred: ["trivy", "codeql"],
    agents: ["security-architect-agent", "security-reviewer-agent", "qa-reviewer-agent"],
    securityLevel: "high",
    workflowProfile: "full",
  },
  {
    id: "performance-pass",
    displayName: "Performance Investigation and Optimization",
    taskTypes: ["performance", "optimize", "slow"],
    stacks: ["web", "react", "nextjs"],
    capabilities: ["profiling", "web-performance", "regression"],
    required: ["lighthouse"],
    preferred: ["vercel-react-best-practices", "vercel-optimize", "playwright"],
    agents: ["performance-agent", "debugger-agent", "qa-reviewer-agent"],
    securityLevel: "standard",
    workflowProfile: "standard",
  },
  {
    id: "database-migration",
    displayName: "Database Schema / Provider Migration",
    taskTypes: ["migration", "database", "provider-migration"],
    stacks: ["postgres", "supabase", "neon"],
    capabilities: ["migration-plan", "schema", "rollback", "data-integrity", "security"],
    required: ["owasp", "gitleaks"],
    preferred: ["supabase-postgres-best-practices"],
    agents: ["architect-agent", "database-agent", "migration-agent", "security-reviewer-agent", "qa-reviewer-agent"],
    securityLevel: "high",
    workflowProfile: "full",
  },
  {
    id: "production-release",
    displayName: "Production Release",
    taskTypes: ["release", "deploy", "production"],
    stacks: [],
    capabilities: ["release", "preview", "security", "smoke-test", "rollback-plan", "observability"],
    required: ["gitleaks", "osv-scanner"],
    preferred: ["github-mcp", "playwright"],
    agents: ["devops-agent", "security-reviewer-agent", "qa-reviewer-agent", "release-verifier-agent", "observability-agent"],
    securityLevel: "high",
    workflowProfile: "full",
  },
];

export const recipes: TeamRecipe[] = [...baseRecipes, ...expandedRecipes];

export function recipeById(id: string): TeamRecipe | undefined {
  return recipes.find((recipe) => recipe.id === id);
}

export function validateRecipes(): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const recipe of recipes) {
    if (ids.has(recipe.id)) errors.push(`duplicate recipe id: ${recipe.id}`);
    ids.add(recipe.id);
    if (!recipe.displayName.trim()) errors.push(`${recipe.id}: missing display name`);
    if (!recipe.taskTypes.length) errors.push(`${recipe.id}: no task types`);
    if (!recipe.capabilities.length) errors.push(`${recipe.id}: no capabilities`);
    if (recipe.agents.length > 12) errors.push(`${recipe.id}: too many specialist agents`);

    for (const id of recipe.required) {
      const candidate = getCandidate(id);
      if (!candidate) errors.push(`${recipe.id}: required capability does not exist: ${id}`);
    }
    for (const id of recipe.preferred) {
      const candidate = getCandidate(id);
      if (!candidate) errors.push(`${recipe.id}: preferred capability does not exist: ${id}`);
    }
    for (const id of recipe.agents) {
      const candidate = getCandidate(id);
      if (!candidate) errors.push(`${recipe.id}: agent does not exist: ${id}`);
      else if (candidate.kind !== "agent") errors.push(`${recipe.id}: recipe agent is not an agent candidate: ${id}`);
    }
  }
  return errors;
}
