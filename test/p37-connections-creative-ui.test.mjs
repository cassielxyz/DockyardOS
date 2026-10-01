import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";

const dockyard = await import("../dist/index.js");
const require = createRequire(import.meta.url);
const {
  MCP_DEFINITIONS,
  mcpDefinition,
  normalizeConnections,
  providerDefinition,
  safeJson,
} = require("../integrations/vscode/connections-model.js");
const { renderConnectionsHtml } = require("../integrations/vscode/connections-view.js");

function selectedIds(items) {
  return items.map((item) => item.candidate.id);
}

test("P37 registers Taste, Awesome Design Skills, and Inspo without overstating trust or execution", () => {
  const taste = dockyard.getCandidate("taste-skill");
  assert.ok(taste);
  assert.equal(taste.kind, "skill");
  assert.equal(taste.trust, "maintainer");
  assert.equal(taste.source.locator, "Leonxlnx/taste-skill");
  assert.equal(taste.source.revisionStrategy, "pin-on-install");

  const awesome = dockyard.getCandidate("awesome-design-skills");
  assert.ok(awesome);
  assert.equal(awesome.kind, "skill");
  assert.equal(awesome.source.locator, "bergside/awesome-design-skills");

  const inspo = dockyard.getCandidate("inspo-mcp");
  assert.ok(inspo);
  assert.equal(inspo.kind, "mcp");
  assert.equal(inspo.source.type, "website");
  assert.equal(inspo.source.locator, "https://inspomcp.dev/mcp");
  assert.equal(inspo.source.revisionStrategy, "live-metadata-only");
  assert.deepEqual(inspo.permissions, ["network"]);
  assert.equal(inspo.risk, "low");

  assert.deepEqual(dockyard.validateCatalog(), []);
});

test("P37 premium creative web requests route through the dedicated creative workflow", () => {
  const request = dockyard.defaultSelectionRequest({
    task: "Build a premium creative landing page that does not look AI-generated. Use real website inspiration and an original visual direction.",
    stack: ["nextjs", "react"],
    host: "antigravity",
  });

  assert.ok(request.capabilities.includes("anti-slop"));
  assert.ok(request.capabilities.includes("design-inspiration"));
  assert.ok(request.capabilities.includes("visual-direction"));

  const result = dockyard.selectCapabilities(request);
  assert.equal(result.recipe?.id, "creative-web-ui");
  const skillIds = selectedIds(result.skills);
  const mcpIds = selectedIds(result.mcps);
  for (const id of ["taste-skill", "awesome-design-skills", "ui-ux-pro-max", "vercel-web-design-guidelines"]) {
    assert.ok(skillIds.includes(id), `expected creative skill ${id}`);
  }
  assert.ok(mcpIds.includes("inspo-mcp"), "expected Inspo MCP for design-reference work");
});

test("P37 Connections Center keeps local, live, and host-session connection states distinct", () => {
  const local = normalizeConnections([
    {
      providerId: "github",
      displayName: "GitHub",
      readiness: "installed",
      installed: true,
      configured: false,
      liveChecked: false,
      signals: [{ type: "cli", ok: true, detail: "CLI detected: gh" }],
    },
    {
      providerId: "vercel",
      displayName: "Vercel",
      readiness: "unavailable",
      installed: false,
      configured: false,
      liveChecked: false,
      signals: [],
    },
  ]);

  const github = local.providers.find((item) => item.id === "github");
  const vercel = local.providers.find((item) => item.id === "vercel");
  assert.equal(github.status.state, "installed");
  assert.equal(github.canLogin, true);
  assert.equal(github.authenticated, false);
  assert.equal(vercel.canLogin, false, "missing CLI must not expose a login command button");
  assert.equal(local.liveChecked, false);

  const verified = normalizeConnections([
    {
      providerId: "github",
      displayName: "GitHub",
      readiness: "linked",
      installed: true,
      configured: true,
      authenticated: true,
      linked: true,
      liveChecked: true,
      signals: [],
    },
  ], { liveChecked: true });
  assert.equal(verified.providers[0].status.level, "ready");
  assert.equal(verified.liveChecked, true);

  const inspo = local.mcps.find((item) => item.id === "inspo-mcp");
  const githubMcp = local.mcps.find((item) => item.id === "github-mcp-server");
  assert.equal(inspo.auth, "none");
  assert.equal(inspo.status.state, "ready-to-configure");
  assert.notEqual(inspo.status.state, "connected");
  assert.equal(githubMcp.status.state, "host-verification-required");
  assert.equal(githubMcp.verificationScope, "host-session");
});

test("P37 Connections actions are allowlisted metadata, not caller supplied commands or URLs", () => {
  assert.equal(providerDefinition("unknown-provider"), undefined);
  assert.equal(mcpDefinition("unknown-mcp"), undefined);

  const github = providerDefinition("github");
  assert.equal(github.loginCommand, "gh auth login");
  assert.match(github.setupUrl, /^https:\/\//);

  const inspo = mcpDefinition("inspo-mcp");
  assert.equal(inspo.setupCommand, "npx -y inspo-mcp install");
  assert.equal(inspo.endpoint, "https://inspomcp.dev/mcp");

  for (const entry of MCP_DEFINITIONS) {
    if (entry.setupUrl) assert.match(entry.setupUrl, /^https:\/\//, `${entry.id} setup URL must be HTTPS`);
    if (entry.endpoint) assert.match(entry.endpoint, /^https:\/\//, `${entry.id} endpoint must be HTTPS`);
  }
});

test("P37 Connections webview uses a nonce CSP and escapes injected model text", () => {
  const model = normalizeConnections([]);
  model.safety.push("<script>not executable</script>");
  const escaped = safeJson(model);
  assert.ok(!escaped.includes("<script>"));

  const html = renderConnectionsHtml({ cspSource: "vscode-webview:" }, model);
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /script-src 'nonce-/);
  assert.match(html, /Configured is not the same as connected/);
  assert.ok(!html.includes("<script>not executable</script>"));
});

test("P37 VS Code extension exposes Connections through the composed entrypoint", async () => {
  const pkg = JSON.parse(await readFile(new URL("../integrations/vscode/package.json", import.meta.url), "utf8"));
  assert.equal(pkg.main, "./main.js");
  assert.ok(pkg.activationEvents.includes("onCommand:dockyardOS.connections"));
  assert.ok(pkg.contributes.commands.some((command) => command.command === "dockyardOS.connections"));
  assert.match(pkg.scripts.check, /connections-controller\.js/);
  assert.match(pkg.scripts.check, /connections-model\.js/);
  assert.match(pkg.scripts.check, /connections-view\.js/);
});
