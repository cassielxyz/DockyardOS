const PROVIDER_DEFINITIONS = Object.freeze({
  github: { setupUrl: "https://cli.github.com/", loginCommand: "gh auth login" },
  vercel: { setupUrl: "https://vercel.com/docs/cli", loginCommand: "vercel login" },
  cloudflare: { setupUrl: "https://developers.cloudflare.com/workers/wrangler/install-and-update/", loginCommand: "wrangler login" },
  supabase: { setupUrl: "https://supabase.com/docs/guides/local-development/cli/getting-started", loginCommand: "supabase login" },
  neon: { setupUrl: "https://neon.com/docs/reference/neon-cli", loginCommand: "neon auth" },
  firebase: { setupUrl: "https://firebase.google.com/docs/cli", loginCommand: "firebase login" },
  appwrite: { setupUrl: "https://appwrite.io/docs/tooling/command-line/installation", loginCommand: "appwrite login" },
  render: { setupUrl: "https://render.com/docs/cli" },
  railway: { setupUrl: "https://docs.railway.com/guides/cli", loginCommand: "railway login" },
  flyio: { setupUrl: "https://fly.io/docs/flyctl/install/", loginCommand: "fly auth login" },
  pocketbase: { setupUrl: "https://pocketbase.io/docs/" },
  turso: { setupUrl: "https://docs.turso.tech/cli/introduction" },
  sentry: { setupUrl: "https://docs.sentry.io/cli/" },
  "cloud-run": { setupUrl: "https://cloud.google.com/sdk/docs/install", loginCommand: "gcloud auth login" },
  "github-pages": { setupUrl: "https://cli.github.com/", loginCommand: "gh auth login" },
});

const MCP_DEFINITIONS = Object.freeze([
  {
    id: "inspo-mcp",
    name: "Inspo MCP",
    category: "Design inspiration",
    endpoint: "https://inspomcp.dev/mcp",
    setupUrl: "https://inspomcp.dev/mcp",
    setupCommand: "npx -y inspo-mcp install",
    auth: "none",
    note: "Read-only design reference MCP. Hosted endpoint is free and requires no account login.",
  },
  { id: "github-mcp-server", name: "GitHub MCP", category: "Source control", setupUrl: "https://github.com/github/github-mcp-server", auth: "required" },
  { id: "vercel-mcp-server", name: "Vercel MCP", category: "Deployment", endpoint: "https://mcp.vercel.com", setupUrl: "https://vercel.com/docs/mcp/vercel-mcp", auth: "required" },
  { id: "supabase-mcp-server", name: "Supabase MCP", category: "Database / backend", endpoint: "https://mcp.supabase.com/mcp", setupUrl: "https://supabase.com/docs/guides/getting-started/mcp", auth: "required" },
  { id: "neon-mcp-server", name: "Neon MCP", category: "Database", setupUrl: "https://github.com/neondatabase/mcp-server-neon", auth: "required" },
  { id: "cloudflare-api-mcp", name: "Cloudflare MCP", category: "Edge / cloud", endpoint: "https://mcp.cloudflare.com/mcp", setupUrl: "https://developers.cloudflare.com/agents/model-context-protocol/mcp-servers-for-cloudflare/", auth: "required" },
  { id: "figma-mcp", name: "Figma MCP", category: "Design", setupUrl: "https://help.figma.com/hc/en-us/articles/32132100833559-Guide-to-the-Dev-Mode-MCP-Server", auth: "required" },
  { id: "linear-mcp", name: "Linear MCP", category: "Project management", endpoint: "https://mcp.linear.app/mcp", setupUrl: "https://linear.app/docs/mcp", auth: "required" },
  { id: "notion-mcp", name: "Notion MCP", category: "Knowledge", endpoint: "https://mcp.notion.com/mcp", setupUrl: "https://developers.notion.com/docs/mcp", auth: "required" },
  { id: "atlassian-rovo-mcp", name: "Atlassian Rovo MCP", category: "Jira / Confluence", endpoint: "https://mcp.atlassian.com/v2/mcp", setupUrl: "https://support.atlassian.com/rovo/docs/setting-up-ides/", auth: "required" },
  { id: "mongodb-atlas-mcp", name: "MongoDB Atlas MCP", category: "Database", setupUrl: "https://www.mongodb.com/docs/mcp-server/", auth: "required" },
  { id: "huggingface-mcp", name: "Hugging Face MCP", category: "AI / ML", setupUrl: "https://huggingface.co/docs/hub/en/mcp", auth: "required" },
  { id: "sentry-mcp", name: "Sentry MCP", category: "Observability", setupUrl: "https://docs.sentry.io/product/sentry-mcp/", auth: "required" },
]);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function providerStatus(probe) {
  const readiness = String(probe?.readiness || "unknown");
  if (readiness === "linked") return { state: "linked", label: "Linked", level: "ready" };
  if (readiness === "authenticated") return { state: "authenticated", label: "Authenticated", level: "ready" };
  if (readiness === "configured") return { state: "configured", label: "Configured", level: "partial" };
  if (readiness === "installed") return { state: "installed", label: "Login needed", level: "partial" };
  if (readiness === "degraded") return { state: "degraded", label: "Needs attention", level: "warning" };
  if (readiness === "unavailable") return { state: "unavailable", label: "Not installed", level: "muted" };
  return { state: readiness, label: "Unknown", level: "muted" };
}

function normalizeConnections(providerProbeValue, options = {}) {
  const liveChecked = options.liveChecked === true;
  const providers = asArray(providerProbeValue).map((probe) => {
    const id = String(probe?.providerId || "");
    const definition = PROVIDER_DEFINITIONS[id] || {};
    const status = providerStatus(probe);
    return {
      id,
      name: String(probe?.displayName || id || "Unknown provider"),
      kind: "provider",
      status,
      installed: probe?.installed === true,
      configured: probe?.configured === true,
      authenticated: probe?.authenticated === true,
      linked: probe?.linked === true,
      liveChecked: probe?.liveChecked === true,
      signals: asArray(probe?.signals).map((signal) => ({
        type: String(signal?.type || "unknown"),
        ok: signal?.ok === true,
        detail: String(signal?.detail || ""),
      })),
      setupUrl: definition.setupUrl || null,
      canLogin: Boolean(definition.loginCommand),
      loginCommand: definition.loginCommand || null,
    };
  }).filter((item) => item.id);

  const mcps = MCP_DEFINITIONS.map((mcp) => ({
    ...mcp,
    kind: "mcp",
    status: mcp.auth === "none"
      ? { state: "ready-to-configure", label: "No login required", level: "ready" }
      : { state: "host-verification-required", label: "Host verification required", level: "partial" },
    verificationScope: "host-session",
  }));

  return {
    generatedAt: new Date().toISOString(),
    liveChecked,
    providers,
    mcps,
    summary: {
      providers: providers.length,
      providerReady: providers.filter((item) => item.status.level === "ready").length,
      providerAttention: providers.filter((item) => item.status.level === "warning" || item.status.level === "partial").length,
      mcps: mcps.length,
      noAuthMcps: mcps.filter((item) => item.auth === "none").length,
    },
    safety: [
      "DockyardOS never stores provider passwords, OAuth tokens, API keys, or MCP credentials in project checkpoints.",
      "Live verification is read-only. Connection readiness never grants deployment, production, destructive, database, DNS, or Git mutation approval.",
      "MCP connection truth is host-session scoped; this extension does not claim an MCP is connected merely because setup metadata exists.",
    ],
  };
}

function providerDefinition(id) {
  return PROVIDER_DEFINITIONS[id];
}

function mcpDefinition(id) {
  return MCP_DEFINITIONS.find((item) => item.id === id);
}

function safeJson(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

module.exports = { normalizeConnections, providerDefinition, mcpDefinition, safeJson, MCP_DEFINITIONS };
