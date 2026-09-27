import type { Candidate, CapabilityKind, ContextCost, HostId, PermissionId, RiskLevel, TrustLevel, UpdateChannel } from "./types.js";

const ALL_HOSTS: HostId[] = ["antigravity", "gemini-cli", "codex", "claude-code", "cursor", "opencode", "universal"];
const AGENT_HOSTS: HostId[] = ["antigravity", "gemini-cli", "codex", "claude-code", "cursor", "opencode"];

type Seed = {
  id: string;
  name: string;
  category: string;
  kind: CapabilityKind;
  trust?: TrustLevel;
  caps: string[];
  tags?: string[];
  stacks?: string[];
  hosts?: HostId[];
  perms?: PermissionId[];
  risk?: RiskLevel;
  cost?: ContextCost;
  maturity?: number;
  maintenance?: number;
  channel?: UpdateChannel;
  source: string;
  sourceType?: "github" | "package" | "official-registry" | "dockyard" | "website";
  license?: string;
  conflictsWith?: string[];
  requires?: string[];
};

function c(seed: Seed): Candidate {
  return {
    id: seed.id,
    displayName: seed.name,
    category: seed.category,
    kind: seed.kind,
    trust: seed.trust ?? (seed.sourceType === "dockyard" ? "dockyard" : "community"),
    capabilities: seed.caps,
    tags: seed.tags ?? [],
    stacks: seed.stacks ?? [],
    hosts: seed.hosts ?? ALL_HOSTS,
    permissions: seed.perms ?? [],
    risk: seed.risk ?? "low",
    contextCost: seed.cost ?? "small",
    maturity: seed.maturity ?? 75,
    maintenance: seed.maintenance ?? 75,
    defaultChannel: seed.channel ?? "recommended",
    source: {
      type: seed.sourceType ?? "github",
      locator: seed.source,
      revisionStrategy: seed.sourceType === "dockyard" ? "bundled" : "pin-on-install",
      ...(seed.license ? { license: seed.license } : {}),
    },
    ...(seed.conflictsWith ? { conflictsWith: seed.conflictsWith } : {}),
    ...(seed.requires ? { requires: seed.requires } : {}),
  };
}

const dockAgent = (id: string, name: string, category: string, caps: string[], tags: string[] = [], cost: ContextCost = "small") => c({
  id,
  name,
  category,
  kind: "agent",
  trust: "dockyard",
  caps,
  tags,
  hosts: AGENT_HOSTS,
  source: `agents/${id}`,
  sourceType: "dockyard",
  maturity: 85,
  maintenance: 100,
  cost,
});

export const catalog: Candidate[] = [
  // Planning, specification, coordination
  c({ id: "superpowers", name: "Superpowers", category: "planning", kind: "skill", caps: ["requirements", "planning", "tdd", "subagent-development", "review"], tags: ["spec", "implementation-plan", "tdd"], source: "obra/superpowers", license: "MIT", maturity: 95, maintenance: 95, cost: "medium" }),
  c({ id: "shadcn-improve", name: "shadcn Improve", category: "codebase-audit", kind: "skill", trust: "maintainer", caps: ["audit", "roadmap", "implementation-plan", "codebase-review"], tags: ["read-only", "advisor", "planning"], source: "shadcn/improve", license: "MIT", maturity: 85, maintenance: 90, cost: "medium" }),
  c({ id: "gstack", name: "gstack", category: "engineering-workflow", kind: "skill", caps: ["product-review", "engineering-review", "design-review", "qa", "debugging", "release"], tags: ["specialists", "review", "release"], source: "garrytan/gstack", maturity: 85, maintenance: 90, cost: "large" }),
  c({ id: "ruflo-orchestration", name: "Ruflo Orchestration", category: "multi-agent", kind: "skill", caps: ["agent-routing", "swarm-coordination", "memory", "github-automation"], tags: ["multi-agent", "routing", "coordination"], source: "ruvnet/ruflo", maturity: 90, maintenance: 95, cost: "large" }),

  // UI, UX, React and design systems
  c({ id: "ui-ux-pro-max", name: "UI UX Pro Max", category: "ui-ux", kind: "skill", caps: ["ui-design", "ux", "design-system", "accessibility", "typography", "color", "animation"], tags: ["frontend", "design", "responsive"], stacks: ["web", "react", "nextjs", "vue", "svelte", "flutter", "react-native"], source: "nextlevelbuilder/ui-ux-pro-max-skill", license: "MIT", maturity: 95, maintenance: 98, cost: "medium" }),
  c({ id: "shadcn", name: "shadcn/ui Skill", category: "components", kind: "skill", trust: "official", caps: ["component-discovery", "component-composition", "ui-debugging", "design-system"], tags: ["react", "tailwind", "components"], stacks: ["react", "nextjs", "vite"], perms: ["shell", "network", "filesystem-write"], risk: "medium", source: "shadcn-ui/ui", maturity: 98, maintenance: 98, cost: "small" }),
  c({ id: "vercel-web-design-guidelines", name: "Vercel Web Design Guidelines", category: "ui-review", kind: "skill", trust: "official", caps: ["ui-review", "ux", "accessibility", "interface-quality"], tags: ["web", "review", "a11y"], stacks: ["web", "react", "nextjs"], source: "vercel-labs/agent-skills", license: "MIT", maturity: 92, maintenance: 95, cost: "small" }),
  c({ id: "vercel-react-best-practices", name: "Vercel React Best Practices", category: "react", kind: "skill", trust: "official", caps: ["react", "nextjs", "performance", "code-review"], tags: ["waterfalls", "bundle", "rendering"], stacks: ["react", "nextjs"], source: "vercel-labs/agent-skills", license: "MIT", maturity: 95, maintenance: 95, cost: "medium" }),
  c({ id: "vercel-composition-patterns", name: "Vercel Composition Patterns", category: "react", kind: "skill", trust: "official", caps: ["component-architecture", "composition", "react"], tags: ["components", "api-design"], stacks: ["react", "nextjs"], source: "vercel-labs/agent-skills", license: "MIT", maturity: 90, maintenance: 95 }),
  c({ id: "vercel-react-view-transitions", name: "Vercel React View Transitions", category: "animation", kind: "skill", trust: "official", caps: ["view-transitions", "animation", "react"], tags: ["motion", "navigation"], stacks: ["react", "nextjs"], source: "vercel-labs/agent-skills", license: "MIT", maturity: 82, maintenance: 92 }),
  c({ id: "vercel-react-native", name: "Vercel React Native Skills", category: "mobile", kind: "skill", trust: "official", caps: ["react-native", "mobile-ui", "performance"], tags: ["mobile", "expo"], stacks: ["react-native", "expo"], source: "vercel-labs/agent-skills", license: "MIT", maturity: 86, maintenance: 92 }),

  // Research and discovery
  c({ id: "agent-reach", name: "Agent Reach", category: "research", kind: "skill", caps: ["web-research", "social-research", "github-research", "video-research", "rss"], tags: ["research", "reddit", "youtube", "github", "social"], perms: ["network", "shell"], risk: "medium", source: "Panniantong/Agent-Reach", license: "MIT", maturity: 90, maintenance: 95, cost: "small" }),
  c({ id: "mcp-registry", name: "Official MCP Registry", category: "tool-discovery", kind: "mcp", trust: "official", caps: ["mcp-discovery", "tool-discovery"], tags: ["registry", "mcp"], perms: ["network"], source: "registry.modelcontextprotocol.io", sourceType: "official-registry", maturity: 92, maintenance: 98, cost: "tiny" }),

  // Vercel and deployment skills
  c({ id: "deploy-to-vercel", name: "Deploy to Vercel", category: "deployment", kind: "skill", trust: "official", caps: ["preview-deployment", "web-hosting", "deployment"], tags: ["vercel", "preview"], stacks: ["web", "nextjs", "react"], perms: ["network", "shell", "deployment"], risk: "medium", source: "vercel-labs/agent-skills", license: "MIT", maturity: 92, maintenance: 95 }),
  c({ id: "vercel-cli-with-tokens", name: "Vercel CLI with Tokens", category: "deployment", kind: "skill", trust: "official", caps: ["vercel-cli", "deployment-auth"], tags: ["vercel", "tokens"], stacks: ["web"], perms: ["network", "shell", "secrets", "deployment"], risk: "high", source: "vercel-labs/agent-skills", license: "MIT", maturity: 85, maintenance: 95 }),
  c({ id: "vercel-optimize", name: "Vercel Optimize", category: "performance", kind: "skill", trust: "official", caps: ["web-performance", "deployment-optimization"], tags: ["vercel", "performance"], stacks: ["web", "nextjs"], source: "vercel-labs/agent-skills", license: "MIT", maturity: 88, maintenance: 94 }),

  // Cloudflare official skills
  c({ id: "cloudflare-skill", name: "Cloudflare Platform", category: "edge", kind: "skill", trust: "official", caps: ["cloudflare", "provider-selection", "workers", "r2", "d1", "dns"], tags: ["edge", "security", "hosting"], stacks: ["web", "workers"], source: "cloudflare/skills", maturity: 95, maintenance: 98, cost: "small" }),
  c({ id: "cloudflare-nextjs", name: "Next.js on Cloudflare", category: "deployment", kind: "skill", trust: "official", caps: ["nextjs", "cloudflare-workers", "deployment"], tags: ["cloudflare", "nextjs"], stacks: ["nextjs"], perms: ["network", "shell", "deployment"], risk: "medium", source: "cloudflare/skills", maturity: 88, maintenance: 98 }),
  c({ id: "cloudflare-agents-sdk", name: "Cloudflare Agents SDK", category: "ai-agents", kind: "skill", trust: "official", caps: ["agents", "state", "scheduling", "rpc", "mcp", "streaming"], tags: ["cloudflare", "agents"], stacks: ["workers", "typescript"], source: "cloudflare/skills", maturity: 88, maintenance: 98 }),
  c({ id: "cloudflare-durable-objects", name: "Cloudflare Durable Objects", category: "distributed-state", kind: "skill", trust: "official", caps: ["durable-objects", "state", "websockets", "coordination"], tags: ["cloudflare", "realtime"], stacks: ["workers", "typescript"], source: "cloudflare/skills", maturity: 92, maintenance: 98 }),
  c({ id: "cloudflare-sandbox", name: "Cloudflare Sandbox", category: "sandbox", kind: "skill", trust: "official", caps: ["sandbox", "isolated-execution"], tags: ["cloudflare", "execution"], stacks: ["workers", "typescript"], perms: ["network", "shell"], risk: "medium", source: "cloudflare/skills", maturity: 80, maintenance: 98 }),

  // Supabase / Postgres
  c({ id: "supabase-skill", name: "Supabase Agent Skill", category: "backend", kind: "skill", trust: "official", caps: ["supabase", "auth", "database", "storage", "edge-functions", "debugging"], tags: ["baas", "postgres"], stacks: ["supabase", "postgres"], perms: ["network", "database-read"], risk: "medium", source: "supabase/agent-skills", license: "MIT", maturity: 94, maintenance: 98, cost: "medium" }),
  c({ id: "supabase-postgres-best-practices", name: "Supabase Postgres Best Practices", category: "database", kind: "skill", trust: "official", caps: ["postgres", "schema", "query-performance", "rls", "migrations", "security"], tags: ["database", "postgres", "rls"], stacks: ["postgres", "supabase"], source: "supabase/agent-skills", license: "MIT", maturity: 92, maintenance: 97, cost: "medium" }),

  // Security
  c({ id: "owasp", name: "OWASP Secure Development", category: "security", kind: "skill", trust: "dockyard", caps: ["appsec", "owasp", "threat-model", "secure-coding"], tags: ["web", "api", "mobile", "security"], source: "security/owasp", sourceType: "dockyard", maturity: 95, maintenance: 100, cost: "medium" }),
  c({ id: "strix-pentest", name: "Strix Penetration Testing", category: "security-testing", kind: "skill", caps: ["pentest", "appsec", "exploit-validation", "security-report"], tags: ["security", "dynamic-testing"], perms: ["network", "shell", "browser"], risk: "high", source: "usestrix/strix", maturity: 92, maintenance: 96, cost: "medium" }),
  c({ id: "strix-fix", name: "Strix Vulnerability Remediation", category: "security-remediation", kind: "skill", caps: ["security-fix", "remediation", "security-rerun"], tags: ["security", "fix", "verify"], perms: ["filesystem-write", "shell", "network"], risk: "high", source: "usestrix/strix", maturity: 90, maintenance: 96, cost: "medium", requires: ["strix-pentest"] }),
  c({ id: "strix-ci", name: "Strix CI Security Scanning", category: "security-ci", kind: "skill", caps: ["security-ci", "pr-security", "pentest"], tags: ["ci", "security"], perms: ["filesystem-write", "network", "shell"], risk: "high", source: "usestrix/strix", maturity: 88, maintenance: 96 }),
  c({ id: "gitleaks", name: "Gitleaks", category: "secrets", kind: "tool", trust: "maintainer", caps: ["secret-scan", "git-secrets"], tags: ["security", "git"], perms: ["filesystem-read", "shell"], source: "gitleaks/gitleaks", maturity: 98, maintenance: 95, cost: "tiny" }),
  c({ id: "osv-scanner", name: "OSV-Scanner", category: "dependencies", kind: "tool", trust: "official", caps: ["dependency-scan", "vulnerability-database", "sbom"], tags: ["security", "dependencies"], perms: ["filesystem-read", "network", "shell"], source: "google/osv-scanner", maturity: 98, maintenance: 98, cost: "tiny" }),
  c({ id: "semgrep", name: "Semgrep", category: "static-analysis", kind: "tool", trust: "maintainer", caps: ["sast", "code-pattern-scan", "security-lint"], tags: ["security", "static-analysis"], perms: ["filesystem-read", "shell"], source: "semgrep/semgrep", maturity: 98, maintenance: 95, cost: "small" }),
  c({ id: "trivy", name: "Trivy", category: "supply-chain", kind: "tool", trust: "maintainer", caps: ["container-scan", "dependency-scan", "iac-scan", "secret-scan"], tags: ["security", "containers", "iac"], perms: ["filesystem-read", "network", "shell"], source: "aquasecurity/trivy", maturity: 98, maintenance: 96, cost: "small" }),
  c({ id: "codeql", name: "CodeQL", category: "static-analysis", kind: "tool", trust: "official", caps: ["sast", "code-query", "security-analysis"], tags: ["github", "security"], perms: ["filesystem-read", "shell"], source: "github/codeql", maturity: 98, maintenance: 98, cost: "medium" }),

  // Test, QA, accessibility, performance
  c({ id: "playwright", name: "Playwright", category: "e2e-testing", kind: "tool", trust: "official", caps: ["browser-test", "e2e", "screenshots", "cross-browser"], tags: ["browser", "testing"], stacks: ["web"], perms: ["browser", "shell", "network"], source: "microsoft/playwright", maturity: 99, maintenance: 99, cost: "small" }),
  c({ id: "vitest", name: "Vitest", category: "unit-testing", kind: "tool", trust: "maintainer", caps: ["unit-test", "component-test"], tags: ["javascript", "typescript"], stacks: ["typescript", "javascript", "vite", "react"], perms: ["shell", "filesystem-read"], source: "vitest-dev/vitest", maturity: 96, maintenance: 97, cost: "tiny" }),
  c({ id: "pytest", name: "pytest", category: "unit-testing", kind: "tool", trust: "maintainer", caps: ["unit-test", "integration-test"], tags: ["python"], stacks: ["python"], perms: ["shell", "filesystem-read"], source: "pytest-dev/pytest", maturity: 99, maintenance: 96, cost: "tiny" }),
  c({ id: "axe-core", name: "axe-core", category: "accessibility", kind: "tool", trust: "maintainer", caps: ["accessibility-test", "wcag"], tags: ["a11y", "web"], stacks: ["web"], perms: ["browser"], source: "dequelabs/axe-core", maturity: 98, maintenance: 95, cost: "tiny" }),
  c({ id: "lighthouse", name: "Lighthouse", category: "performance", kind: "tool", trust: "official", caps: ["web-performance", "accessibility-audit", "seo-audit", "best-practices-audit"], tags: ["web", "performance"], stacks: ["web"], perms: ["browser", "network", "shell"], source: "GoogleChrome/lighthouse", maturity: 99, maintenance: 96, cost: "small" }),

  // DevOps / platform tools
  c({ id: "docker", name: "Docker", category: "containers", kind: "tool", trust: "official", caps: ["containers", "local-services", "build-isolation"], tags: ["devops", "container"], perms: ["shell", "filesystem-read", "filesystem-write", "network"], risk: "medium", source: "docker/cli", maturity: 99, maintenance: 98 }),
  c({ id: "github-mcp", name: "GitHub MCP Server", category: "source-control", kind: "mcp", trust: "official", caps: ["repository", "issues", "pull-requests", "actions", "releases"], tags: ["github", "git"], perms: ["network", "git-write"], risk: "medium", source: "github/github-mcp-server", maturity: 98, maintenance: 99, cost: "small" }),
  c({ id: "vercel-mcp", name: "Vercel MCP", category: "deployment", kind: "mcp", trust: "official", caps: ["deployment", "logs", "projects", "domains"], tags: ["vercel", "hosting"], perms: ["network", "deployment"], risk: "medium", source: "https://mcp.vercel.com", sourceType: "website", maturity: 92, maintenance: 98 }),
  c({ id: "supabase-mcp", name: "Supabase MCP", category: "backend", kind: "mcp", trust: "official", caps: ["database", "sql", "migrations", "logs", "edge-functions"], tags: ["supabase", "postgres"], perms: ["network", "database-read", "database-write"], risk: "high", source: "https://mcp.supabase.com", sourceType: "website", maturity: 94, maintenance: 98 }),
  c({ id: "cloudflare-mcp", name: "Cloudflare MCP", category: "edge", kind: "mcp", trust: "official", caps: ["cloudflare", "workers", "observability", "dns"], tags: ["cloudflare", "edge"], perms: ["network", "deployment", "dns"], risk: "high", source: "cloudflare/skills", maturity: 90, maintenance: 98 }),

  // Artifact/document skills useful in engineering workflows
  c({ id: "anthropic-pdf", name: "PDF Skill", category: "documents", kind: "skill", trust: "official", caps: ["pdf", "document-generation", "document-analysis"], tags: ["artifact", "pdf"], source: "anthropics/skills", maturity: 90, maintenance: 94 }),
  c({ id: "anthropic-docx", name: "DOCX Skill", category: "documents", kind: "skill", trust: "official", caps: ["docx", "document-generation", "document-editing"], tags: ["artifact", "word"], source: "anthropics/skills", maturity: 90, maintenance: 94 }),
  c({ id: "anthropic-xlsx", name: "XLSX Skill", category: "spreadsheets", kind: "skill", trust: "official", caps: ["xlsx", "spreadsheet-generation", "spreadsheet-analysis"], tags: ["artifact", "spreadsheet"], source: "anthropics/skills", maturity: 90, maintenance: 94 }),

  // Dockyard specialist agents
  dockAgent("requirements-agent", "Requirements Agent", "requirements", ["requirements", "acceptance-criteria", "scope"], ["product"]),
  dockAgent("architect-agent", "Architecture Agent", "architecture", ["architecture", "system-design", "provider-selection"], ["design"]),
  dockAgent("planner-agent", "Planner Agent", "planning", ["task-breakdown", "dependency-graph", "implementation-plan"], ["planning"]),
  dockAgent("research-agent", "Research Agent", "research", ["research", "source-evaluation", "technology-selection"], ["research"]),
  dockAgent("frontend-agent", "Frontend Agent", "frontend", ["frontend", "ui-implementation", "state-management"], ["web", "ui"]),
  dockAgent("backend-agent", "Backend Agent", "backend", ["backend", "api", "business-logic"], ["server"]),
  dockAgent("database-agent", "Database Agent", "database", ["schema", "migrations", "queries", "rls"], ["data"]),
  dockAgent("mobile-agent", "Mobile Agent", "mobile", ["android", "ios", "flutter", "react-native"], ["mobile"]),
  dockAgent("security-architect-agent", "Security Architect", "security", ["threat-model", "security-architecture", "trust-boundaries"], ["security"], "medium"),
  dockAgent("security-reviewer-agent", "Security Reviewer", "security", ["appsec-review", "owasp", "security-verification"], ["security"], "medium"),
  dockAgent("qa-reviewer-agent", "QA Reviewer", "testing", ["qa", "regression", "acceptance-verification"], ["testing"]),
  dockAgent("browser-qa-agent", "Browser QA Agent", "testing", ["browser-test", "responsive-test", "visual-verification"], ["browser", "ui"]),
  dockAgent("accessibility-agent", "Accessibility Reviewer", "accessibility", ["wcag", "accessibility-review"], ["a11y"]),
  dockAgent("performance-agent", "Performance Engineer", "performance", ["profiling", "performance", "optimization"], ["performance"]),
  dockAgent("debugger-agent", "Debugger Agent", "debugging", ["root-cause-analysis", "debugging", "log-analysis"], ["bugs"]),
  dockAgent("refactor-agent", "Refactor Agent", "refactoring", ["refactor", "dead-code", "maintainability"], ["cleanup"]),
  dockAgent("api-reviewer-agent", "API Reviewer", "api", ["api-review", "contract-testing", "compatibility"], ["api"]),
  dockAgent("devops-agent", "DevOps Agent", "devops", ["ci", "containers", "deployment-pipeline"], ["ci-cd"]),
  dockAgent("release-verifier-agent", "Release Verifier", "release", ["release-verification", "smoke-test", "rollback-plan"], ["release"]),
  dockAgent("observability-agent", "Observability Agent", "observability", ["logs", "metrics", "tracing", "alerts"], ["operations"]),
  dockAgent("migration-agent", "Migration Agent", "migration", ["migration-plan", "compatibility", "rollback"], ["migration"]),
  dockAgent("docs-agent", "Documentation Agent", "documentation", ["readme", "api-docs", "runbook", "changelog"], ["docs"]),
  dockAgent("provider-selector-agent", "Provider Selector", "providers", ["provider-selection", "fallback-selection", "cost-fit"], ["providers"]),
  dockAgent("memory-agent", "Project Memory Agent", "memory", ["checkpoint-summary", "decision-log", "context-recovery"], ["memory"], "tiny"),

  // Dockyard workflow capabilities
  c({ id: "workflow-bug-fix", name: "Bug Fix Workflow", category: "workflow", kind: "workflow", trust: "dockyard", caps: ["bug-fix", "root-cause", "regression"], tags: ["debug", "test"], source: "workflows/bug-fix", sourceType: "dockyard", maturity: 90, maintenance: 100 }),
  c({ id: "workflow-feature", name: "Feature Workflow", category: "workflow", kind: "workflow", trust: "dockyard", caps: ["feature", "planning", "implementation", "review"], tags: ["feature"], source: "workflows/feature", sourceType: "dockyard", maturity: 90, maintenance: 100 }),
  c({ id: "workflow-security", name: "Security Workflow", category: "workflow", kind: "workflow", trust: "dockyard", caps: ["security", "proof-fix-rerun", "threat-model"], tags: ["security", "verify"], source: "workflows/security", sourceType: "dockyard", maturity: 92, maintenance: 100 }),
  c({ id: "workflow-refactor", name: "Safe Refactor Workflow", category: "workflow", kind: "workflow", trust: "dockyard", caps: ["refactor", "behavior-preservation", "regression"], tags: ["cleanup"], source: "workflows/refactor", sourceType: "dockyard", maturity: 88, maintenance: 100 }),
  c({ id: "workflow-release", name: "Production Release Workflow", category: "workflow", kind: "workflow", trust: "dockyard", caps: ["release", "preview", "security", "production-verification"], tags: ["release", "deployment"], source: "workflows/release", sourceType: "dockyard", maturity: 90, maintenance: 100 }),
];

export const categoryNames = [...new Set(catalog.map((candidate) => candidate.category))].sort();
