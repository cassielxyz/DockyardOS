import assert from "node:assert/strict";
import { mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const dockyard = await import("../dist/index.js");

test("host registry covers every requested coding host with durable shared state", () => {
  const ids = new Set(dockyard.hostAdapters.map((adapter) => adapter.id));
  for (const id of ["antigravity", "gemini-cli", "codex", "claude-code", "cursor", "opencode"]) assert.ok(ids.has(id), `missing host ${id}`);
  for (const adapter of dockyard.hostAdapters) {
    assert.ok(adapter.verifiedAgainst.length > 0, `${adapter.id} missing verification metadata`);
    assert.ok(adapter.features.includes("skills") || adapter.features.includes("plugins"), `${adapter.id} has no portable capability surface`);
  }
});

test("Antigravity adapter tracks the official agy CLI, plugin surface, and native continuation", () => {
  const antigravity = dockyard.hostAdapter("antigravity");
  assert.equal(antigravity.executable, "agy");
  assert.equal(antigravity.supportsNativeResume, true);
  assert.ok(antigravity.features.includes("plugins"));
  assert.ok(antigravity.features.includes("resume"));
  assert.ok(antigravity.verifiedAgainst.some((item) => item.source.includes("antigravity.google/docs/cli/install")));
  assert.ok(antigravity.verifiedAgainst.some((item) => item.source.includes("antigravity.google/docs/cli/headless")));
  assert.ok(antigravity.verifiedAgainst.some((item) => item.source.includes("plugins?tab=cli")));
});

test("project-scope Antigravity install writes the full workspace plugin idempotently", async () => {
  const root = await mkdtemp(join(tmpdir(), "dockyard-host-antigravity-"));
  await dockyard.initProject(root, { name: "host-antigravity", mode: "balanced" });
  const planned = dockyard.planHostInstall(root, "antigravity", "project");
  const pluginAction = planned.actions.find((action) => action.type === "copy-plugin");
  assert.ok(pluginAction);
  assert.equal(pluginAction.destination, join(root, ".agents", "plugins", "dockyardos"));

  const first = await dockyard.executeHostInstall(root, "antigravity", "project");
  assert.ok(first.results.some((item) => item.action === "copy-plugin" && item.status === "installed"));
  const pluginPath = join(root, ".agents", "plugins", "dockyardos", "plugin.json");
  const plugin = JSON.parse(await readFile(pluginPath, "utf8"));
  assert.equal(plugin.name, "dockyardos");
  const hooks = JSON.parse(await readFile(join(root, ".agents", "plugins", "dockyardos", "hooks.json"), "utf8"));
  assert.ok(Array.isArray(hooks["dockyard-context"]?.PreInvocation));
  assert.ok(Array.isArray(hooks["dockyard-context"]?.Stop));
  assert.ok(Array.isArray(hooks["dockyard-safety-and-checkpoints"]?.PreToolUse));
  assert.ok(Array.isArray(hooks["dockyard-safety-and-checkpoints"]?.PostToolUse));

  const inspection = await dockyard.inspectHost(root, "antigravity");
  assert.ok(inspection.projectSignals.some((signal) => signal.path === ".agents/plugins/dockyardos" && signal.exists));

  const second = await dockyard.executeHostInstall(root, "antigravity", "project");
  assert.ok(second.results.some((item) => item.action === "copy-plugin" && item.status === "unchanged"));

  await writeFile(pluginPath, `${JSON.stringify({ ...plugin, name: "local-custom-plugin" }, null, 2)}\n`, "utf8");
  await assert.rejects(
    () => dockyard.executeHostInstall(root, "antigravity", "project"),
    /plugin already exists with different content/i,
  );
  const forced = await dockyard.executeHostInstall(root, "antigravity", "project", { force: true });
  assert.ok(forced.results.some((item) => item.action === "copy-plugin" && item.status === "installed"));
  const restored = JSON.parse(await readFile(pluginPath, "utf8"));
  assert.equal(restored.name, "dockyardos");
});

test("project-scope host install refuses symlinked integration parents", async () => {
  const root = await mkdtemp(join(tmpdir(), "dockyard-host-symlink-root-"));
  const outside = await mkdtemp(join(tmpdir(), "dockyard-host-symlink-outside-"));
  await dockyard.initProject(root, { name: "host-symlink", mode: "balanced" });
  await symlink(outside, join(root, ".agents"), "dir");

  await assert.rejects(
    () => dockyard.executeHostInstall(root, "antigravity", "project"),
    /contains a symbolic link/i,
  );
  await assert.rejects(
    () => dockyard.executeHostInstall(root, "cursor", "project"),
    /contains a symbolic link/i,
  );
});

test("Cursor adapter tracks the current agent CLI and native resume surface", () => {
  const cursor = dockyard.hostAdapter("cursor");
  assert.equal(cursor.executable, "agent");
  assert.equal(cursor.supportsNativeResume, true);
  assert.ok(cursor.features.includes("resume"));
  assert.ok(cursor.verifiedAgainst.some((item) => item.source.includes("cursor.com/docs/cli/installation")));
});

test("project-scope Cursor install writes only the portable skill and keeps runtime state external", async () => {
  const root = await mkdtemp(join(tmpdir(), "dockyard-host-cursor-"));
  await dockyard.initProject(root, { name: "host-cursor", mode: "balanced" });
  const planned = dockyard.planHostInstall(root, "cursor", "project");
  assert.equal(planned.sharedState.projectStateIsHostIndependent, true);
  assert.ok(planned.actions.some((action) => action.type === "copy-skill"));
  const result = await dockyard.executeHostInstall(root, "cursor", "project");
  assert.equal(result.sharedState.projectStateIsHostIndependent, true);
  const skill = await readFile(join(root, ".agents", "skills", "dockyardos", "SKILL.md"), "utf8");
  assert.match(skill, /DockyardOS portable skill/);
  assert.equal(planned.sharedState.dockyardHome.startsWith(root), false);
});

test("portable skill install is idempotent and refuses silent overwrite", async () => {
  const root = await mkdtemp(join(tmpdir(), "dockyard-host-overwrite-"));
  await dockyard.initProject(root, { name: "host-overwrite", mode: "balanced" });
  const first = await dockyard.executeHostInstall(root, "opencode", "project");
  assert.ok(first.results.some((item) => item.status === "installed"));
  const second = await dockyard.executeHostInstall(root, "opencode", "project");
  assert.ok(second.results.some((item) => item.status === "unchanged"));
  const skillPath = join(root, ".agents", "skills", "dockyardos", "SKILL.md");
  await writeFile(skillPath, "---\nname: dockyardos\ndescription: local custom\n---\ncustom\n", "utf8");
  await assert.rejects(() => dockyard.executeHostInstall(root, "opencode", "project"), /already exists with different content/);
  const forced = await dockyard.executeHostInstall(root, "opencode", "project", { force: true });
  assert.ok(forced.results.some((item) => item.status === "installed"));
});

test("host inspection recognizes a project integration without requiring the host executable", async () => {
  const root = await mkdtemp(join(tmpdir(), "dockyard-host-inspect-"));
  await dockyard.initProject(root, { name: "host-inspect", mode: "balanced" });
  await dockyard.executeHostInstall(root, "gemini-cli", "project");
  const inspection = await dockyard.inspectHost(root, "gemini-cli");
  assert.ok(inspection.projectSignals.some((signal) => signal.path === ".agents/skills/dockyardos" && signal.exists));
  assert.ok(inspection.features.includes("skills"));
});

test("Codex runtime plan does not invent a local automatic install path", async () => {
  const root = await mkdtemp(join(tmpdir(), "dockyard-host-codex-"));
  await dockyard.initProject(root, { name: "host-codex", mode: "balanced" });
  const plan = dockyard.planHostInstall(root, "codex", "runtime");
  assert.ok(plan.actions.some((action) => action.type === "manual" && /capability_directories/.test(action.reason)));
});
