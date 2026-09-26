import type { Candidate, ProviderDefinition } from "./types.js";

export const candidates: Candidate[] = [
  { id: "superpowers", displayName: "Superpowers", category: "planning", kind: "skill", trust: "community", tags: ["spec", "planning", "subagents", "review"] },
  { id: "ui-ux-pro-max", displayName: "UI UX Pro Max", category: "ui-ux", kind: "skill", trust: "community", tags: ["ui", "ux", "design-system", "frontend"] },
  { id: "shadcn", displayName: "shadcn/ui", category: "components", kind: "skill", trust: "official", tags: ["react", "components", "tailwind"] },
  { id: "agent-reach", displayName: "Agent Reach", category: "research", kind: "skill", trust: "community", tags: ["research", "web", "discovery"] },
  { id: "owasp", displayName: "OWASP secure development", category: "security", kind: "skill", trust: "community", tags: ["appsec", "threat-model", "web"] },
  { id: "strix", displayName: "Strix", category: "security", kind: "tool", trust: "community", tags: ["pentest", "verification", "appsec"] },
  { id: "gitleaks", displayName: "Gitleaks", category: "security", kind: "tool", trust: "community", tags: ["secrets", "git"] },
  { id: "osv-scanner", displayName: "OSV-Scanner", category: "security", kind: "tool", trust: "official", tags: ["dependencies", "vulnerabilities"] },
  { id: "playwright", displayName: "Playwright", category: "testing", kind: "tool", trust: "official", tags: ["browser", "e2e", "visual"] },
  { id: "github-mcp", displayName: "GitHub MCP", category: "source-control", kind: "mcp", trust: "official", tags: ["git", "issues", "prs", "actions"] },
  { id: "vercel", displayName: "Vercel", category: "deployment", kind: "mcp", trust: "official", tags: ["hosting", "preview", "web"] },
  { id: "supabase", displayName: "Supabase", category: "backend", kind: "mcp", trust: "official", tags: ["postgres", "auth", "storage", "functions"] },
  { id: "cloudflare", displayName: "Cloudflare", category: "edge", kind: "mcp", trust: "official", tags: ["dns", "cdn", "security", "workers", "storage"] }
];

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
  { id: "sentry", displayName: "Sentry", capabilities: ["errors", "performance", "tracing"], connectionKinds: ["api", "sdk"], tags: ["observability"], requiresLiveAvailabilityCheck: true }
];

export function providersFor(capability: string): ProviderDefinition[] {
  return providers.filter((provider) => provider.capabilities.includes(capability));
}
