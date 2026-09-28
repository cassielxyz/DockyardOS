import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("shared MCP bridge exposes and internally applies the official public gate", async () => {
  const source = await readFile("src/mcp-server.ts", "utf8");
  assert.match(source, /"dockyard_public_gate"/);
  assert.match(source, /checkPublicAdGate/);
  for (const tool of [
    "dockyard_context",
    "dockyard_recommend",
    "dockyard_team_start",
    "dockyard_team_status",
    "dockyard_team_advance",
    "dockyard_checkpoint",
    "dockyard_policy",
    "dockyard_community_active",
    "dockyard_community_entrypoint",
  ]) assert.match(source, new RegExp(`"${tool}"`));
  const gateCalls = source.match(/await publicGate\(value\)/g) ?? [];
  assert.ok(gateCalls.length >= 10, `expected cross-host gate calls, got ${gateCalls.length}`);
});

test("public MCP blocked results keep sponsor disclosure visible and do not expose a bypass", async () => {
  const source = await readFile("src/mcp-server.ts", "utf8");
  assert.match(source, /status: "sponsor-required"/);
  assert.match(source, /Show this clearly labeled Sponsored placement/);
  assert.doesNotMatch(source, /disable.?ads|skip.?ads|bypass.?ads/i);
});
