import type { Candidate, ContextCost, HostId, PermissionId, RiskLevel } from "./types.js";

const ALL_HOSTS: HostId[] = ["antigravity", "gemini-cli", "codex", "claude-code", "cursor", "opencode", "universal"];

type ConnectorSeed = {
  id: string;
  name: string;
  category: string;
  caps: string[];
  source: string;
  tags?: string[];
  stacks?: string[];
  permissions?: PermissionId[];
  risk?: RiskLevel;
  cost?: ContextCost;
  maturity?: number;
  maintenance?: number;
  hosts?: HostId[];
  sourceType?: Candidate["source"]["type"];
  license?: string;
  kind?: "mcp" | "tool" | "skill";
};

function connector(seed: ConnectorSeed): Candidate {
  const kind = seed.kind ?? "mcp";
  return {
    id: seed.id,
    displayName: seed.name,
    category: seed.category,
    kind,
    trust: "official",
    capabilities: seed.caps,
    tags: seed.tags ?? [],
    stacks: seed.stacks ?? [],
    hosts: seed.hosts ?? ALL_HOSTS,
    permissions: seed.permissions ?? (kind === "mcp" ? ["network"] : []),
    risk: seed.risk ?? "low",
    contextCost: seed.cost ?? (kind === "mcp" ? "tiny" : "small"),
    maturity: seed.maturity ?? 90,
    maintenance: seed.maintenance ?? 95,
    defaultChannel: "recommended",
    source: {
      type: seed.sourceType ?? (seed.source.startsWith("http") ? "website" : "github"),
      locator: seed.source,
      revisionStrategy: seed.sourceType === "website" || seed.source.startsWith("http") ? "live-metadata-only" : "pin-on-install",
      ...(seed.license ? { license: seed.license } : {}),
    },
  };
}

export const connectorCatalog: Candidate[] = [
  // Source control, code hosting, deployment and cloud control planes.
  connector({ id: "github-mcp-server", name: "GitHub MCP Server", category: "source-control-mcp", caps: ["repositories", "code-search", "issues", "pull-requests", "actions", "releases"], source: "github/github-mcp-server", tags: ["github", "git", "ci"], permissions: ["network", "git-write"], risk: "high", license: "MIT", maturity: 99, maintenance: 99 }),
  connector({ id: "vercel-mcp-server", name: "Vercel MCP", category: "deployment-mcp", caps: ["vercel", "projects", "deployments", "deployment-logs", "domains", "docs"], source: "https://mcp.vercel.com", tags: ["vercel", "hosting", "nextjs"], stacks: ["web", "nextjs", "react"], permissions: ["network", "deployment"], risk: "high", maturity: 98, maintenance: 99 }),
  connector({ id: "supabase-mcp-server", name: "Supabase MCP", category: "database-mcp", caps: ["supabase", "postgres", "schema", "migrations", "queries", "logs", "edge-functions", "branching"], source: "https://mcp.supabase.com/mcp", tags: ["supabase", "postgres", "baas"], stacks: ["supabase", "postgres"], permissions: ["network", "database-read", "database-write"], risk: "high", maturity: 96, maintenance: 99 }),
  connector({ id: "neon-mcp-server", name: "Neon MCP", category: "database-mcp", caps: ["neon", "postgres", "branches", "schema", "queries", "migrations", "observability"], source: "neondatabase/mcp-server-neon", tags: ["neon", "postgres", "serverless"], stacks: ["neon", "postgres"], permissions: ["network", "database-read", "database-write"], risk: "high", license: "MIT", maturity: 95, maintenance: 99 }),
  connector({ id: "cloudflare-api-mcp", name: "Cloudflare API MCP", category: "cloud-mcp", caps: ["cloudflare", "workers", "dns", "security", "performance", "account-management"], source: "https://mcp.cloudflare.com/mcp", tags: ["cloudflare", "edge", "security"], stacks: ["cloudflare", "workers", "web"], permissions: ["network", "deployment", "dns"], risk: "high", maturity: 96, maintenance: 99 }),
  connector({ id: "cloudflare-docs-mcp", name: "Cloudflare Documentation MCP", category: "documentation-mcp", caps: ["cloudflare-docs", "reference", "platform-guidance"], source: "https://docs.mcp.cloudflare.com/mcp", tags: ["cloudflare", "docs"], stacks: ["cloudflare", "workers"], permissions: ["network"], risk: "low", maturity: 97, maintenance: 99 }),
  connector({ id: "cloudflare-bindings-mcp", name: "Cloudflare Workers Bindings MCP", category: "cloud-mcp", caps: ["workers-bindings", "r2", "d1", "kv", "queues", "ai"], source: "https://bindings.mcp.cloudflare.com/mcp", tags: ["cloudflare", "workers", "bindings"], stacks: ["cloudflare", "workers"], permissions: ["network"], risk: "medium", maturity: 94, maintenance: 99 }),
  connector({ id: "cloudflare-builds-mcp", name: "Cloudflare Workers Builds MCP", category: "ci-mcp", caps: ["workers-builds", "builds", "deployments", "build-debugging"], source: "https://builds.mcp.cloudflare.com/mcp", tags: ["cloudflare", "ci", "workers"], stacks: ["cloudflare", "workers"], permissions: ["network", "deployment"], risk: "medium", maturity: 93, maintenance: 99 }),
  connector({ id: "cloudflare-observability-mcp", name: "Cloudflare Observability MCP", category: "observability-mcp", caps: ["logs", "analytics", "workers-observability", "debugging"], source: "https://observability.mcp.cloudflare.com/mcp", tags: ["cloudflare", "observability", "logs"], stacks: ["cloudflare", "workers"], permissions: ["network"], risk: "medium", maturity: 94, maintenance: 99 }),
  connector({ id: "cloudflare-radar-mcp", name: "Cloudflare Radar MCP", category: "research-mcp", caps: ["internet-trends", "traffic-insights", "url-scans", "network-research"], source: "https://radar.mcp.cloudflare.com/mcp", tags: ["cloudflare", "research", "network"], permissions: ["network"], risk: "low", maturity: 92, maintenance: 99 }),

  // Browser, UI, design and product-context connectors.
  connector({ id: "playwright-mcp", name: "Playwright MCP", category: "browser-mcp", caps: ["browser-automation", "e2e", "screenshots", "accessibility-snapshots", "web-debugging"], source: "microsoft/playwright-mcp", tags: ["browser", "testing", "qa"], stacks: ["web"], permissions: ["browser", "network"], risk: "medium", license: "Apache-2.0", maturity: 98, maintenance: 99 }),
  connector({ id: "figma-mcp", name: "Figma MCP", category: "design-mcp", caps: ["figma", "design-context", "design-tokens", "assets", "figjam"], source: "https://www.figma.com/mcp-catalog/", tags: ["figma", "design", "ui-ux"], permissions: ["network"], risk: "medium", maturity: 96, maintenance: 99 }),
  connector({ id: "linear-mcp", name: "Linear MCP", category: "project-management-mcp", caps: ["linear", "issues", "projects", "comments", "roadmap"], source: "https://mcp.linear.app/mcp", tags: ["linear", "planning", "issues"], permissions: ["network"], risk: "medium", maturity: 97, maintenance: 99 }),
  connector({ id: "linear-mcp-readonly", name: "Linear MCP Read-only", category: "project-management-mcp", caps: ["linear", "issues-read", "projects-read", "roadmap-context"], source: "https://mcp.linear.app/mcp/readonly", tags: ["linear", "planning", "read-only"], permissions: ["network"], risk: "low", maturity: 97, maintenance: 99 }),
  connector({ id: "notion-mcp", name: "Notion MCP", category: "knowledge-mcp", caps: ["notion", "workspace-search", "pages", "markdown", "knowledge-base"], source: "https://mcp.notion.com/mcp", tags: ["notion", "docs", "knowledge"], permissions: ["network"], risk: "medium", maturity: 96, maintenance: 99 }),
  connector({ id: "atlassian-rovo-mcp", name: "Atlassian Rovo MCP", category: "project-management-mcp", caps: ["jira", "confluence", "compass", "teamwork-graph", "issues", "knowledge"], source: "https://mcp.atlassian.com/v2/mcp", tags: ["atlassian", "jira", "confluence"], permissions: ["network"], risk: "medium", maturity: 98, maintenance: 99 }),

  // Language, dependency, architecture and contract tooling.
  connector({ id: "typescript-language-service", name: "TypeScript Language Service", category: "language-intelligence", kind: "tool", caps: ["typescript", "symbols", "references", "diagnostics", "refactor"], source: "microsoft/TypeScript", tags: ["typescript", "lsp"], stacks: ["typescript", "javascript"], permissions: ["filesystem-read"], license: "Apache-2.0", maturity: 100, maintenance: 100, cost: "tiny" }),
  connector({ id: "ruff", name: "Ruff", category: "python-quality", kind: "tool", caps: ["python-lint", "format", "imports", "code-quality"], source: "astral-sh/ruff", tags: ["python", "lint"], stacks: ["python"], permissions: ["filesystem-read", "filesystem-write", "shell"], risk: "medium", license: "MIT", maturity: 99, maintenance: 100, cost: "tiny" }),
  connector({ id: "biome", name: "Biome", category: "web-quality", kind: "tool", caps: ["javascript-lint", "typescript-lint", "format", "code-quality"], source: "biomejs/biome", tags: ["javascript", "typescript", "lint"], stacks: ["javascript", "typescript", "web"], permissions: ["filesystem-read", "filesystem-write", "shell"], risk: "medium", license: "MIT OR Apache-2.0", maturity: 97, maintenance: 99, cost: "tiny" }),
  connector({ id: "eslint", name: "ESLint", category: "web-quality", kind: "tool", caps: ["javascript-lint", "typescript-lint", "static-analysis"], source: "eslint/eslint", tags: ["javascript", "typescript", "lint"], stacks: ["javascript", "typescript", "web"], permissions: ["filesystem-read", "shell"], risk: "low", license: "MIT", maturity: 100, maintenance: 98, cost: "tiny" }),
  connector({ id: "knip", name: "Knip", category: "codebase-audit", kind: "tool", caps: ["dead-code", "unused-files", "unused-dependencies", "exports-analysis"], source: "webpro-nl/knip", tags: ["cleanup", "refactor", "typescript"], stacks: ["typescript", "javascript", "web"], permissions: ["filesystem-read", "shell"], risk: "low", license: "ISC", maturity: 94, maintenance: 97, cost: "tiny" }),
  connector({ id: "dependency-cruiser", name: "dependency-cruiser", category: "architecture-analysis", kind: "tool", caps: ["dependency-graph", "architecture-rules", "circular-dependencies", "module-boundaries"], source: "sverweij/dependency-cruiser", tags: ["architecture", "graph", "typescript"], stacks: ["javascript", "typescript"], permissions: ["filesystem-read", "shell"], risk: "low", license: "MIT", maturity: 96, maintenance: 96, cost: "tiny" }),
  connector({ id: "spectral-openapi", name: "Spectral", category: "api-quality", kind: "tool", caps: ["openapi-lint", "json-schema", "api-governance", "contract-review"], source: "stoplightio/spectral", tags: ["openapi", "api", "lint"], stacks: ["api"], permissions: ["filesystem-read", "shell"], risk: "low", license: "Apache-2.0", maturity: 96, maintenance: 94, cost: "tiny" }),
  connector({ id: "graphql-inspector", name: "GraphQL Inspector", category: "api-quality", kind: "tool", caps: ["graphql", "schema-diff", "breaking-changes", "schema-validation"], source: "kamilkisiela/graphql-inspector", tags: ["graphql", "api", "schema"], stacks: ["graphql", "api"], permissions: ["filesystem-read", "shell"], risk: "low", license: "MIT", maturity: 94, maintenance: 94, cost: "tiny" }),
  connector({ id: "sqlfluff", name: "SQLFluff", category: "database-quality", kind: "tool", caps: ["sql-lint", "sql-format", "dialects", "database-quality"], source: "sqlfluff/sqlfluff", tags: ["sql", "database", "lint"], stacks: ["sql", "postgres"], permissions: ["filesystem-read", "filesystem-write", "shell"], risk: "medium", license: "MIT", maturity: 97, maintenance: 97, cost: "tiny" }),

  // Infrastructure, packaging and load verification.
  connector({ id: "terraform", name: "Terraform", category: "infrastructure-as-code", kind: "tool", caps: ["terraform", "infrastructure", "plan", "state", "cloud-provisioning"], source: "hashicorp/terraform", tags: ["iac", "cloud", "infra"], permissions: ["filesystem-read", "filesystem-write", "shell", "network", "deployment"], risk: "high", license: "BUSL-1.1", maturity: 100, maintenance: 99, cost: "small" }),
  connector({ id: "opentofu", name: "OpenTofu", category: "infrastructure-as-code", kind: "tool", caps: ["tofu", "terraform-compatible", "infrastructure", "plan", "state"], source: "opentofu/opentofu", tags: ["iac", "cloud", "infra"], permissions: ["filesystem-read", "filesystem-write", "shell", "network", "deployment"], risk: "high", license: "MPL-2.0", maturity: 97, maintenance: 99, cost: "small" }),
  connector({ id: "kubectl", name: "kubectl", category: "kubernetes", kind: "tool", caps: ["kubernetes", "cluster-inspection", "deployments", "logs", "resources"], source: "kubernetes/kubectl", tags: ["kubernetes", "containers"], permissions: ["shell", "network", "deployment"], risk: "high", license: "Apache-2.0", maturity: 100, maintenance: 100, cost: "tiny" }),
  connector({ id: "helm", name: "Helm", category: "kubernetes", kind: "tool", caps: ["helm", "kubernetes-packages", "charts", "release-management"], source: "helm/helm", tags: ["kubernetes", "deployment"], permissions: ["filesystem-read", "shell", "network", "deployment"], risk: "high", license: "Apache-2.0", maturity: 100, maintenance: 99, cost: "tiny" }),
  connector({ id: "docker-cli", name: "Docker CLI", category: "containers", kind: "tool", caps: ["containers", "images", "builds", "compose", "sandbox"], source: "docker/cli", tags: ["docker", "containers"], permissions: ["filesystem-read", "shell", "network", "deployment"], risk: "high", license: "Apache-2.0", maturity: 100, maintenance: 100, cost: "tiny" }),
  connector({ id: "k6", name: "Grafana k6", category: "performance-testing", kind: "tool", caps: ["load-test", "performance-test", "http-benchmark", "thresholds"], source: "grafana/k6", tags: ["performance", "load", "testing"], permissions: ["filesystem-read", "shell", "network"], risk: "medium", license: "AGPL-3.0", maturity: 98, maintenance: 99, cost: "tiny" }),

  // Observability and product analytics connectors are metadata-only until a configured provider/action adapter exists.
  connector({ id: "sentry-connector", name: "Sentry Connector", category: "observability", kind: "tool", caps: ["errors", "traces", "releases", "issue-context"], source: "https://docs.sentry.io/", tags: ["sentry", "observability"], permissions: ["network"], risk: "medium", maturity: 99, maintenance: 99 }),
  connector({ id: "grafana-connector", name: "Grafana Connector", category: "observability", kind: "tool", caps: ["metrics", "logs", "traces", "dashboards", "alerts"], source: "https://grafana.com/docs/", tags: ["grafana", "observability"], permissions: ["network"], risk: "medium", maturity: 99, maintenance: 99 }),
  connector({ id: "posthog-connector", name: "PostHog Connector", category: "product-analytics", kind: "tool", caps: ["product-analytics", "events", "feature-flags", "session-replay"], source: "https://posthog.com/docs", tags: ["analytics", "product"], permissions: ["network"], risk: "medium", maturity: 95, maintenance: 98 }),
  connector({ id: "pagerduty-connector", name: "PagerDuty Connector", category: "incident-management", kind: "tool", caps: ["incidents", "on-call", "alerts", "incident-response"], source: "https://developer.pagerduty.com/", tags: ["incident", "operations"], permissions: ["network"], risk: "medium", maturity: 99, maintenance: 98 }),
];
