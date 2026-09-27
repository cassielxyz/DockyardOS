import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
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
