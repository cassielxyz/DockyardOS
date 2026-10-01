import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dockyard = await import("../dist/index.js");

function basePlan(entries) {
  const statusIds = (status) => entries.filter((entry) => entry.status === status).map((entry) => entry.candidateId);
  return {
    schemaVersion: 1,
    generatedAt: "2026-10-01T19:00:00.000Z",
    entries,
    ready: statusIds("ready"),
    unresolved: entries.filter((entry) => entry.status !== "ready").map((entry) => entry.candidateId),
    installable: statusIds("installable-unassessed"),
    needsConnection: statusIds("needs-connection"),
    discoveryOnly: statusIds("discovery-only"),
    missingRuntime: statusIds("missing-runtime"),
    blocked: statusIds("blocked"),
    warnings: [],
  };
}

function baseEntry(overrides) {
  return {
    candidateId: "github-mcp",
    displayName: "GitHub MCP",
    kind: "mcp",
    status: "needs-connection",
    reason: "configured is not connected",
    sourceType: "official-registry",
    sourceLocator: "fixture",
    automaticAction: "none",
    ...overrides,
  };
}

async function jsonFixture(path) {
  return JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), "utf8"));
}

test("host-session MCP evidence is process-local metadata and grants no mutation approval", () => {
  const registry = new dockyard.HostSessionConnectionRegistry();
  const evidence = registry.attestMcp("codex", "github-mcp", "tool-call-success", new Date("2026-10-01T19:01:02.000Z"));
  assert.deepEqual(evidence, {
    kind: "mcp",
    id: "github-mcp",
    host: "codex",
    verifiedAt: "2026-10-01T19:01:02.000Z",
    observation: "tool-call-success",
    scope: "process",
    grantsMutationApproval: false,
  });
  assert.equal(registry.hasMcp("codex", "github-mcp"), true);
  assert.equal(registry.hasMcp("claude-code", "github-mcp"), false);
  assert.deepEqual(registry.listMcp("codex"), [evidence]);
});

test("unsafe MCP ids and unbounded observations are rejected", () => {
  const registry = new dockyard.HostSessionConnectionRegistry();
  assert.throws(() => registry.attestMcp("codex", "../github", "tool-call-success"), /path-safe identifier/i);
  assert.throws(() => registry.attestMcp("codex", "GitHub-MCP", "tool-call-success"), /path-safe identifier/i);
  assert.throws(() => registry.attestMcp("codex", "github-mcp", ""), /observation/i);
  assert.throws(() => registry.attestMcp("codex", "github-mcp", "x".repeat(241)), /observation/i);
});

test("a direct MCP capability becomes ready only for the host that attested successful use", () => {
  const registry = new dockyard.HostSessionConnectionRegistry();
  registry.attestMcp("codex", "github-mcp", "tool-call-success");
  const plan = basePlan([baseEntry({})]);

  const codex = dockyard.applyHostSessionConnectionEvidence(plan, "codex", registry.listMcp("codex"));
  assert.equal(codex.entries[0]?.status, "ready");
  assert.deepEqual(codex.ready, ["github-mcp"]);
  assert.deepEqual(codex.needsConnection, []);
  assert.equal(codex.entries[0]?.connections?.[0]?.ready, true);
  assert.match(codex.entries[0]?.reason ?? "", /active codex host session/i);

  const claude = dockyard.applyHostSessionConnectionEvidence(plan, "claude-code", registry.listMcp("codex"));
  assert.equal(claude.entries[0]?.status, "needs-connection");
});

test("required package MCP prerequisites can be satisfied by active-host evidence while optional MCPs stay advisory", () => {
  const registry = new dockyard.HostSessionConnectionRegistry();
  registry.attestMcp("gemini-cli", "github-mcp", "resource-read-success");
  const plan = basePlan([baseEntry({
    candidateId: "fixture-skill",
    displayName: "Fixture Skill",
    kind: "skill",
    packageId: "fixture-skill",
    activeRevision: "a".repeat(40),
    connections: [
      { kind: "mcp", id: "github-mcp", required: true, ready: false, detail: "host verification required" },
      { kind: "mcp", id: "figma-mcp", required: false, ready: false, detail: "optional" },
    ],
  })]);

  const updated = dockyard.applyHostSessionConnectionEvidence(plan, "gemini-cli", registry.listMcp("gemini-cli"));
  assert.equal(updated.entries[0]?.status, "ready");
  assert.equal(updated.entries[0]?.connections?.[0]?.ready, true);
  assert.equal(updated.entries[0]?.connections?.[1]?.ready, false);
  assert.match(updated.entries[0]?.reason ?? "", /optional connection.*figma-mcp/i);
});

test("host MCP evidence never overrides an unresolved required provider connection", () => {
  const registry = new dockyard.HostSessionConnectionRegistry();
  registry.attestMcp("codex", "github-mcp", "tool-call-success");
  const plan = basePlan([baseEntry({
    candidateId: "fixture-agent",
    kind: "agent",
    connections: [
      { kind: "mcp", id: "github-mcp", required: true, ready: false, detail: "host verification required" },
      { kind: "provider", id: "supabase", required: true, minimumReadiness: "authenticated", ready: false, detail: "live provider auth required" },
    ],
  })]);

  const updated = dockyard.applyHostSessionConnectionEvidence(plan, "codex", registry.listMcp("codex"));
  assert.equal(updated.entries[0]?.status, "needs-connection");
  assert.equal(updated.entries[0]?.connections?.[0]?.ready, true);
  assert.equal(updated.entries[0]?.connections?.[1]?.ready, false);
  assert.deepEqual(updated.needsConnection, ["fixture-agent"]);
});

test("native host MCP launchers bind session identity instead of accepting a caller-selected host", async () => {
  const gemini = await jsonFixture("integrations/native/gemini-cli/gemini-extension.json");
  const codex = await jsonFixture("integrations/native/codex/.mcp.json");
  const claude = await jsonFixture("integrations/native/claude-code/.mcp.json");
  const cursor = await jsonFixture("integrations/native/cursor/.cursor/mcp.json");
  const opencode = await jsonFixture("integrations/native/opencode/opencode.jsonc");

  assert.deepEqual(gemini.mcpServers.dockyardos.args, ["--host", "gemini-cli"]);
  assert.deepEqual(codex.mcpServers.dockyardos.args, ["--host", "codex"]);
  assert.deepEqual(claude.mcpServers.dockyardos.args, ["--host", "claude-code"]);
  assert.deepEqual(cursor.mcpServers.dockyardos.args, ["--host", "cursor"]);
  assert.deepEqual(opencode.mcp.servers.dockyardos.command, ["dockyard-mcp", "--host", "opencode"]);

  const serverSource = await readFile(new URL("../src/mcp-server.ts", import.meta.url), "utf8");
  assert.match(serverSource, /const activeHost = launcherHost\(\)/);
  const attestBlock = serverSource.slice(serverSource.indexOf('"dockyard_connection_attest"'), serverSource.indexOf('"dockyard_fulfillment"'));
  const fulfillmentBlock = serverSource.slice(serverSource.indexOf('"dockyard_fulfillment"'), serverSource.indexOf('"dockyard_recommend"'));
  assert.doesNotMatch(attestBlock, /host:\s*z\.enum/);
  assert.doesNotMatch(fulfillmentBlock, /host:\s*z\.enum/);
});
