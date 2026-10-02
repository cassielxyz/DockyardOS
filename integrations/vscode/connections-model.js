const PROVIDER_DEFINITIONS = Object.freeze({
  github: {
    setupUrl: "https://cli.github.com/",
    login: { command: "gh", args: ["auth", "login", "--hostname", "github.com", "--git-protocol", "https", "--web"] },
    installers: {
      win32: { command: "winget", args: ["install", "--id", "GitHub.cli", "--source", "winget", "--accept-package-agreements", "--accept-source-agreements"] },
      darwin: { command: "brew", args: ["install", "gh"] },
    },
  },
  vercel: {
    setupUrl: "https://vercel.com/docs/cli",
    login: { command: "vercel", args: ["login"] },
    fallbackLogin: { command: "npx", args: ["-y", "vercel@latest", "login"] },
  },
  cloudflare: {
    setupUrl: "https://developers.cloudflare.com/workers/wrangler/install-and-update/",
    login: { command: "wrangler", args: ["login", "--device"] },
    fallbackLogin: { command: "npx", args: ["-y", "wrangler@latest", "login", "--device"] },
  },
  supabase: {
    setupUrl: "https://supabase.com/docs/guides/local-development/cli/getting-started",
    login: { command: "supabase", args: ["login"] },
    fallbackLogin: { command: "npx", args: ["-y", "supabase@latest", "login"] },
  },
  neon: {
    setupUrl: "https://neon.com/cli",
    login: { command: "neon", args: ["auth"] },
    fallbackLogin: { command: "npx", args: ["-y", "neon@latest", "auth"] },
  },
  firebase: {
    setupUrl: "https://firebase.google.com/docs/cli",
    login: { command: "firebase", args: ["login"] },
    fallbackLogin: { command: "npx", args: ["-y", "firebase-tools@latest", "login"] },
  },
  appwrite: {
    setupUrl: "https://appwrite.io/docs/tooling/command-line/installation",
    login: { command: "appwrite", args: ["login"] },
    fallbackLogin: { command: "npx", args: ["-y", "appwrite-cli@latest", "login"] },
  },
  render: {
    setupUrl: "https://render.com/docs/cli",
    login: { command: "render", args: ["login"] },
    installers: {
      win32: { command: "winget", args: ["install", "--id", "render.cli", "--accept-package-agreements", "--accept-source-agreements"] },
      darwin: { command: "brew", args: ["install", "render"] },
    },
  },
  railway: {
    setupUrl: "https://docs.railway.com/guides/cli",
    login: { command: "railway", args: ["login"] },
    fallbackLogin: { command: "npx", args: ["-y", "@railway/cli@latest", "login"] },
  },
  flyio: {
    setupUrl: "https://fly.io/docs/flyctl/install/",
    login: { command: "fly", args: ["auth", "login"] },
  },
  pocketbase: {
    setupUrl: "https://pocketbase.io/docs/",
    setupOnly: true,
    note: "PocketBase is normally self-hosted/local; there is no universal managed-account login to perform.",
  },
  turso: {
    setupUrl: "https://docs.turso.tech/cli/introduction",
    setupOnly: true,
    note: "Use Turso's current official CLI setup for the target environment before Dockyard performs readiness checks.",
  },
  sentry: {
    setupUrl: "https://docs.sentry.io/api/auth/",
    setupOnly: true,
    note: "Sentry account/API authentication is kept outside Dockyard; prefer its supported OAuth/MCP flow where available.",
  },
  "google-ai": {
    setupUrl: "https://aistudio.google.com/",
    secretInput: true,
    secretStorageKey: "dockyardOS.provider.google-ai.apiKey",
    secretEnvVar: "GEMINI_API_KEY",
    note: "Gemini/Veo API credentials are stored only in VS Code SecretStorage. Dockyard passes the key to Core in-memory for read-only verification and approved media execution; it is never written to project/checkpoint state.",
  },
  "cloud-run": {
    setupUrl: "https://cloud.google.com/sdk/docs/install",
    login: { command: "gcloud", args: ["auth", "login"] },
  },
  "github-pages": {
    setupUrl: "https://cli.github.com/",
    login: { command: "gh", args: ["auth", "login", "--hostname", "github.com", "--git-protocol", "https", "--web"] },
    installers: {
      win32: { command: "winget", args: ["install", "--id", "GitHub.cli", "--source", "winget", "--accept-package-agreements", "--accept-source-agreements"] },
      darwin: { command: "brew", args: ["install", "gh"] },
    },
  },
});

const MCP_DEFINITIONS = Object.freeze([
  {
    id: "inspo-mcp",
    name: "Inspo MCP",
    serverName: "inspo",
    category: "Design inspiration",
    endpoint: "https://inspomcp.dev/api/mcp",
    setupUrl: "https://inspomcp.dev/",
    auth: "none",
    note: "Read-only design reference MCP. Dockyard configures the hosted endpoint directly and does not use the third-party installer shell path.",
  },
  {
    id: "github-mcp-server",
    name: "GitHub MCP",
    serverName: "github",
    category: "Source control",
    endpoint: "https://api.githubcopilot.com/mcp/",
    setupUrl: "https://github.com/github/github-mcp-server/blob/main/docs/remote-server.md",
    auth: "oauth",
  },
  { id: "vercel-mcp-server", name: "Vercel MCP", serverName: "vercel", category: "Deployment", endpoint: "https://mcp.vercel.com", setupUrl: "https://vercel.com/docs/mcp/vercel-mcp", auth: "oauth" },
  { id: "supabase-mcp-server", name: "Supabase MCP", serverName: "supabase", category: "Database / backend", endpoint: "https://mcp.supabase.com/mcp", setupUrl: "https://supabase.com/docs/guides/getting-started/mcp", auth: "oauth" },
  { id: "neon-mcp-server", name: "Neon MCP", serverName: "neon", category: "Database", setupUrl: "https://neon.com/docs/ai/neon-mcp-server", auth: "required" },
  { id: "cloudflare-api-mcp", name: "Cloudflare MCP", serverName: "cloudflare", category: "Edge / cloud", endpoint: "https://mcp.cloudflare.com/mcp", setupUrl: "https://developers.cloudflare.com/agents/model-context-protocol/mcp-servers-for-cloudflare/", auth: "oauth" },
  { id: "figma-mcp", name: "Figma MCP", serverName: "figma", category: "Design", endpoint: "https://mcp.figma.com/mcp", setupUrl: "https://help.figma.com/hc/en-us/articles/32132100833559-Guide-to-the-Figma-MCP-Server", auth: "oauth" },
  { id: "linear-mcp", name: "Linear MCP", serverName: "linear", category: "Project management", endpoint: "https://mcp.linear.app/mcp", setupUrl: "https://linear.app/docs/mcp", auth: "oauth" },
  { id: "notion-mcp", name: "Notion MCP", serverName: "notion", category: "Knowledge", endpoint: "https://mcp.notion.com/mcp", setupUrl: "https://developers.notion.com/docs/mcp", auth: "oauth" },
  { id: "atlassian-rovo-mcp", name: "Atlassian Rovo MCP", serverName: "atlassian", category: "Jira / Confluence", endpoint: "https://mcp.atlassian.com/v2/mcp", setupUrl: "https://support.atlassian.com/rovo/docs/setting-up-ides/", auth: "oauth" },
  { id: "mongodb-atlas-mcp", name: "MongoDB Atlas MCP", serverName: "mongodb-atlas", category: "Database", setupUrl: "https://www.mongodb.com/docs/mcp-server/", auth: "required" },
  { id: "huggingface-mcp", name: "Hugging Face MCP", serverName: "huggingface", category: "AI / ML", setupUrl: "https://huggingface.co/docs/hub/en/mcp", auth: "required" },
  { id: "sentry-mcp", name: "Sentry MCP", serverName: "sentry", category: "Observability", setupUrl: "https://docs.sentry.io/product/sentry-mcp/", auth: "required" },
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
    const installed = probe?.installed === true;
    return {
      id,
      name: String(probe?.displayName || id || "Unknown provider"),
      kind: "provider",
      status,
      installed,
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
      canConnect: Boolean(definition.secretInput || definition.login || definition.fallbackLogin || definition.installers || definition.setupOnly || definition.setupUrl),
      automaticConnect: Boolean(definition.secretInput || definition.login || definition.fallbackLogin || definition.installers),
      connectionKind: definition.secretInput ? "secret-storage" : "provider-flow",
      canForgetSecret: Boolean(definition.secretInput),
      connectLabel: definition.setupOnly
        ? "Configure"
        : status.level === "ready"
          ? "Reconnect"
          : "Connect",
      connectionNote: definition.note || null,
    };
  }).filter((item) => item.id);

  const mcps = MCP_DEFINITIONS.map((mcp) => ({
    ...mcp,
    kind: "mcp",
    canConfigure: Boolean(mcp.endpoint),
    status: mcp.auth === "none"
      ? { state: "ready-to-configure", label: "Ready to configure", level: "ready" }
      : mcp.endpoint
        ? { state: "oauth-configuration-ready", label: "Connect with host OAuth", level: "partial" }
        : { state: "host-verification-required", label: "Host setup required", level: "partial" },
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
