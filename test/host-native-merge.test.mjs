import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const dockyard = await import("../dist/index.js");

async function root(prefix) {
  return mkdtemp(join(tmpdir(), prefix));
}

async function json(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

test("P24 exposes only hosts with explicit safe project-file merge rules", () => {
  assert.deepEqual(new Set(dockyard.nativeMergeHosts()), new Set(["claude-code", "cursor", "opencode", "codex"]));
});

test("Claude native merge preserves unrelated MCP servers and appends marked instructions", async () => {
  const workspace = await root("dockyard-native-claude-");
  await writeFile(join(workspace, ".mcp.json"), `${JSON.stringify({ mcpServers: { existing: { command: "existing-mcp", args: ["--safe"] } }, projectSetting: true }, null, 2)}\n`);
  await writeFile(join(workspace, "CLAUDE.md"), "# Existing project guidance\n\nKeep this text.\n", "utf8");

  const plan = await dockyard.planNativeHostMerge(workspace, "claude-code");
  assert.equal(plan.reviewRequired, false);
  assert.match(plan.planSha256, /^[a-f0-9]{64}$/);
  assert.equal(plan.actions.find((item) => item.destination === ".mcp.json").status, "merge");
  assert.equal(plan.actions.find((item) => item.destination === "CLAUDE.md").status, "append");

  await assert.rejects(
    () => dockyard.applyNativeHostMerge(workspace, "claude-code", { expectedPlanSha256: plan.planSha256 }),
    /explicit --approve/i,
  );

  const applied = await dockyard.applyNativeHostMerge(workspace, "claude-code", { approve: true, expectedPlanSha256: plan.planSha256 });
  assert.equal(applied.status, "applied");
  const merged = await json(join(workspace, ".mcp.json"));
  assert.equal(merged.projectSetting, true);
  assert.equal(merged.mcpServers.existing.command, "existing-mcp");
  assert.equal(merged.mcpServers.dockyardos.command, "dockyard-mcp");
  const instructions = await readFile(join(workspace, "CLAUDE.md"), "utf8");
  assert.match(instructions, /# Existing project guidance/);
  assert.match(instructions, /<!-- dockyardos:native:start -->/);
  assert.match(instructions, /<!-- dockyardos:native:end -->/);

  const second = await dockyard.planNativeHostMerge(workspace, "claude-code");
  assert.equal(second.reviewRequired, false);
  assert.ok(second.actions.every((item) => item.status === "unchanged"));
});

test("P24 aborts the whole apply when an existing Dockyard MCP entry conflicts", async () => {
  const workspace = await root("dockyard-native-conflict-");
  await writeFile(join(workspace, ".mcp.json"), `${JSON.stringify({ mcpServers: { dockyardos: { command: "custom-dockyard" } } }, null, 2)}\n`);
  await writeFile(join(workspace, "CLAUDE.md"), "User-owned instructions.\n", "utf8");
  const before = await readFile(join(workspace, "CLAUDE.md"), "utf8");

  const plan = await dockyard.planNativeHostMerge(workspace, "claude-code");
  assert.equal(plan.reviewRequired, true);
  assert.equal(plan.actions.find((item) => item.destination === ".mcp.json").status, "review-required");
  await assert.rejects(
    () => dockyard.applyNativeHostMerge(workspace, "claude-code", { approve: true, expectedPlanSha256: plan.planSha256 }),
    /will not partially apply/i,
  );
  assert.equal(await readFile(join(workspace, "CLAUDE.md"), "utf8"), before);
});

test("P24 stale plan digest fails closed when host config changes after review", async () => {
  const workspace = await root("dockyard-native-stale-");
  const plan = await dockyard.planNativeHostMerge(workspace, "cursor");
  await mkdir(join(workspace, ".cursor"), { recursive: true });
  await writeFile(join(workspace, ".cursor", "mcp.json"), `${JSON.stringify({ mcpServers: { changed: { command: "later" } } })}\n`);
  await assert.rejects(
    () => dockyard.applyNativeHostMerge(workspace, "cursor", { approve: true, expectedPlanSha256: plan.planSha256 }),
    /changed after review/i,
  );
});

test("Cursor uniquely owned rule is never overwritten when customized", async () => {
  const workspace = await root("dockyard-native-cursor-owned-");
  await mkdir(join(workspace, ".cursor", "rules"), { recursive: true });
  const target = join(workspace, ".cursor", "rules", "dockyardos.mdc");
  await writeFile(target, "custom local rule\n", "utf8");
  const plan = await dockyard.planNativeHostMerge(workspace, "cursor");
  const action = plan.actions.find((item) => item.destination === ".cursor/rules/dockyardos.mdc");
  assert.equal(action.status, "review-required");
  assert.equal(await readFile(target, "utf8"), "custom local rule\n");
});

test("OpenCode JSONC remains review-required when an existing config differs", async () => {
  const workspace = await root("dockyard-native-opencode-");
  await writeFile(join(workspace, "opencode.jsonc"), "{\n  // user comment\n  \"theme\": \"custom\"\n}\n", "utf8");
  const plan = await dockyard.planNativeHostMerge(workspace, "opencode");
  const action = plan.actions.find((item) => item.destination === "opencode.jsonc");
  assert.equal(action.status, "review-required");
  assert.match(action.reason, /comments or user settings/i);
});

test("Codex native compatibility files install only inside the Dockyard namespace", async () => {
  const workspace = await root("dockyard-native-codex-");
  const plan = await dockyard.planNativeHostMerge(workspace, "codex");
  assert.equal(plan.reviewRequired, false);
  assert.ok(plan.actions.every((item) => item.destination.startsWith(".dockyard/plugins/openai/")));
  await dockyard.applyNativeHostMerge(workspace, "codex", { approve: true, expectedPlanSha256: plan.planSha256 });
  const plugin = await json(join(workspace, ".dockyard", "plugins", "openai", ".codex-plugin", "plugin.json"));
  assert.equal(typeof plugin.name, "string");
  const mcp = await json(join(workspace, ".dockyard", "plugins", "openai", ".mcp.json"));
  assert.equal(mcp.mcpServers.dockyardos.command, "dockyard-mcp");
});

test("malformed marked instruction blocks remain review-required", async () => {
  const workspace = await root("dockyard-native-markers-");
  await writeFile(join(workspace, "CLAUDE.md"), "before\n<!-- dockyardos:native:start -->\ncustom without end\n", "utf8");
  const plan = await dockyard.planNativeHostMerge(workspace, "claude-code");
  assert.equal(plan.reviewRequired, true);
  assert.equal(plan.actions.find((item) => item.destination === "CLAUDE.md").status, "review-required");
});
