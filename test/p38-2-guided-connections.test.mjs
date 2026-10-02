import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import test from "node:test";

const dockyard = await import("../dist/index.js");
const require = createRequire(import.meta.url);
const { mcpDefinition, normalizeConnections, providerDefinition } = require("../integrations/vscode/connections-model.js");
const controllerUrl = new URL("../integrations/vscode/connections-controller.js", import.meta.url);
const processUrl = new URL("../src/process.ts", import.meta.url);
const {
  mcpSetupPlan,
  mergeJsonMcpConfig,
  providerConnectPlan,
  terminalLine,
} = require("../integrations/vscode/connections-setup.js");

test("P38.2 provider cards expose guided Connect even without a global CLI", () => {
  const model = normalizeConnections([
    { providerId: "vercel", displayName: "Vercel", readiness: "unavailable", installed: false, configured: false, signals: [] },
    { providerId: "supabase", displayName: "Supabase", readiness: "unavailable", installed: false, configured: false, signals: [] },
  ]);
  for (const id of ["vercel", "supabase"]) {
    const item = model.providers.find((provider) => provider.id === id);
    assert.equal(item.canConnect, true);
    assert.equal(item.automaticConnect, true);
    assert.equal(item.connectLabel, "Connect");
  }

  const vercelPlan = providerConnectPlan(providerDefinition("vercel"), model.providers[0], "win32");
  assert.equal(vercelPlan.kind, "login");
  assert.equal(vercelPlan.commands[0].command, "npx");
  assert.deepEqual(vercelPlan.commands[0].args, ["-y", "vercel@latest", "login"]);

  const githubPlan = providerConnectPlan(providerDefinition("github"), { installed: false }, "win32");
  assert.equal(githubPlan.kind, "install-login");
  assert.equal(githubPlan.commands[0].command, "winget");
  assert.equal(githubPlan.commands[1].command, "gh");
});

test("P38.2 provider auth metadata has bounded ephemeral verification fallbacks", () => {
  for (const id of ["vercel", "cloudflare", "supabase", "neon", "firebase", "appwrite", "railway"]) {
    const adapter = dockyard.providerAdapter(id);
    assert.equal(adapter.authProbe?.fallback?.command, "npx", `${id} must use the explicit npx fallback only for live auth verification`);
    assert.ok(adapter.authProbe.fallback.args.length >= 3);
  }
});

test("P38.2 provider actions use the same fallback launcher contract when needed", async () => {
  const root = await mkdtemp(join(tmpdir(), "dockyard-guided-connections-"));
  const vercel = dockyard.planProviderAction(root, { providerId: "vercel", actionId: "preview-deploy", environment: "preview" });
  assert.ok(["vercel", "npx"].includes(vercel.command));
  if (vercel.command === "npx") assert.deepEqual(vercel.args.slice(0, 2), ["-y", "vercel@latest"]);

  const supabase = dockyard.planProviderAction(root, {
    providerId: "supabase",
    actionId: "functions-deploy",
    environment: "preview",
    params: { "project-ref": "abcd1234", function: "hello" },
  });
  assert.ok(["supabase", "npx"].includes(supabase.command));
  if (supabase.command === "npx") assert.deepEqual(supabase.args.slice(0, 2), ["-y", "supabase@latest"]);
});

test("P38.2 Inspo uses the current hosted endpoint and host-specific config shape", () => {
  const inspo = mcpDefinition("inspo-mcp");
  assert.equal(inspo.endpoint, "https://inspomcp.dev/api/mcp");

  const antigravity = mcpSetupPlan("antigravity", inspo, { home: "/home/test", antigravityConfigRoot: "/home/test/.gemini/config" });
  assert.equal(antigravity.kind, "json-file");
  assert.equal(antigravity.entry.serverUrl, "https://inspomcp.dev/api/mcp");
  assert.equal(antigravity.entry.url, undefined);

  const cursor = mcpSetupPlan("cursor", inspo, { home: "/home/test" });
  assert.equal(cursor.kind, "json-file");
  assert.equal(cursor.entry.url, "https://inspomcp.dev/api/mcp");

  const gemini = mcpSetupPlan("gemini-cli", inspo, { home: "/home/test" });
  assert.deepEqual(gemini.args, ["mcp", "add", "inspo", "https://inspomcp.dev/api/mcp", "--transport", "http", "--scope", "user"]);

  const codex = mcpSetupPlan("codex", inspo, { home: "/home/test" });
  assert.deepEqual(codex.args, ["mcp", "add", "inspo", "--url", "https://inspomcp.dev/api/mcp"]);
});

test("P38.2 host MCP merge preserves unrelated servers and rejects unsafe command tokens", () => {
  const inspo = mcpDefinition("inspo-mcp");
  const plan = mcpSetupPlan("antigravity", inspo, { home: "/home/test", antigravityConfigRoot: "/home/test/.gemini/config" });
  const merged = mergeJsonMcpConfig(JSON.stringify({
    mcpServers: {
      existing: { serverUrl: "https://example.com/mcp" },
    },
    unrelated: { keep: true },
  }), plan);
  assert.deepEqual(merged.mcpServers.existing, { serverUrl: "https://example.com/mcp" });
  assert.deepEqual(merged.mcpServers.inspo, { serverUrl: "https://inspomcp.dev/api/mcp" });
  assert.deepEqual(merged.unrelated, { keep: true });

  assert.equal(terminalLine({ command: "npx", args: ["-y", "vercel@latest", "login"] }), "npx -y vercel@latest login");
  assert.throws(() => terminalLine({ command: "npx", args: ["safe;rm"] }), /unsafe connection command token/i);
});

test("P38.2 OAuth MCPs are configured as endpoint metadata, never as stored credentials", () => {
  for (const id of ["github-mcp-server", "supabase-mcp-server", "cloudflare-api-mcp", "figma-mcp", "linear-mcp", "notion-mcp", "atlassian-rovo-mcp"]) {
    const mcp = mcpDefinition(id);
    assert.match(mcp.endpoint, /^https:\/\//);
    assert.equal(mcp.auth, "oauth");
    const plan = mcpSetupPlan("cursor", mcp, { home: "/home/test" });
    assert.deepEqual(Object.keys(plan.entry), ["url"]);
    assert.equal(plan.entry.url, mcp.endpoint);
  }
});


test("P38.2 Connections controller keeps webview input identifier-only and avoids shell execution", async () => {
  const controller = await import("node:fs/promises").then((fs) => fs.readFile(controllerUrl, "utf8"));
  assert.match(controller, /case "provider-connect": await connectProvider\(context, panel, id\)/);
  assert.match(controller, /case "mcp-configure": await configureMcp\(context, panel, id\)/);
  assert.doesNotMatch(controller, /message\.command|message\.args|message\.url/);
  assert.doesNotMatch(controller, /shell\s*:\s*true/);
  assert.doesNotMatch(controller, /dockyard-backup/);
  assert.match(controller, /dockyard-rollback/);
});

test("P38.2 Windows npm/npx support stays shell-free in Dockyard Core", async () => {
  const source = await import("node:fs/promises").then((fs) => fs.readFile(processUrl, "utf8"));
  assert.match(source, /windowsPackageManagerInvocation/);
  assert.match(source, /npx-cli\.js/);
  assert.doesNotMatch(source, /shell\s*:\s*true/);
});
