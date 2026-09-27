import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

process.env.DOCKYARD_HOME = await mkdtemp(join(tmpdir(), "dockyard-host-home-"));
const dockyard = await import("../dist/index.js");

const expectedHosts = ["antigravity", "gemini-cli", "codex", "claude-code", "cursor", "opencode", "vscode"];

test("cross-host registry covers supported DockyardOS surfaces", () => {
  const ids = dockyard.hostAdapters.map((adapter) => adapter.id);
  for (const id of expectedHosts) assert.ok(ids.includes(id), `missing ${id}`);
  assert.equal(new Set(ids).size, ids.length);
});

test("host integration bundles are discoverable from the installed package root", async () => {
  const probes = await dockyard.inspectHosts(expectedHosts);
  assert.equal(probes.length, expectedHosts.length);
  for (const probe of probes) {
    assert.equal(probe.integrationAvailable, true, `${probe.id} integration bundle missing`);
    assert.ok(["integration-available", "ready"].includes(probe.readiness) || probe.installed);
  }
});

test("portable host context restores checkpoint continuity without chat history", async () => {
  const root = await mkdtemp(join(tmpdir(), "dockyard-host-project-"));
  await dockyard.initProject(root, { name: "portable-host", mode: "balanced" });
  const checkpoint = await dockyard.createCheckpoint(root, "host-test", {
    phase: "implementation",
    activeTask: "wire host adapters",
    completed: ["host registry"],
    next: ["verify adapters"],
    capabilities: ["dockyardos"],
  });
  const context = await dockyard.buildPortableHostContext(root, "codex");
  assert.equal(context.project.name, "portable-host");
  assert.equal(context.checkpoint?.id, checkpoint.id);
  assert.equal(context.checkpoint?.activeTask, "wire host adapters");
  assert.ok(context.instructions.some((instruction) => instruction.includes("continuity")));
  assert.ok(dockyard.renderPortableHostContext(context).includes("wire host adapters"));
});
