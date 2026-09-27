import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

process.env.DOCKYARD_HOME = await mkdtemp(join(tmpdir(), "dockyard-mcp-home-"));
const dockyard = await import("../dist/index.js");

test("portable context restores checkpoint state independently of host chat history", async () => {
  const root = await mkdtemp(join(tmpdir(), "dockyard-mcp-project-"));
  await dockyard.initProject(root, { name: "mcp-context", mode: "balanced" });
  const checkpoint = await dockyard.createCheckpoint(root, "mcp-context-test", {
    phase: "implementation",
    activeTask: "native host bridges",
    completed: ["shared context"],
    blocked: [],
    next: ["mcp bridge"],
    capabilities: ["dockyardos"],
  });

  const context = await dockyard.buildDockyardContext(root, "codex");
  assert.equal(context.project.name, "mcp-context");
  assert.equal(context.project.mode, "balanced");
  assert.equal(context.checkpoint?.id, checkpoint.id);
  assert.equal(context.checkpoint?.activeTask, "native host bridges");
  assert.deepEqual(context.checkpoint?.completed, ["shared context"]);
  assert.ok(context.instructions.some((instruction) => instruction.includes("durable continuity")));
  assert.ok(dockyard.renderDockyardContext(context).includes("native host bridges"));
});

test("portable context includes active team phase and independent gates", async () => {
  const root = await mkdtemp(join(tmpdir(), "dockyard-mcp-team-"));
  await dockyard.initProject(root, { name: "mcp-team", mode: "balanced" });
  const selection = dockyard.selectCapabilities(dockyard.defaultSelectionRequest({
    task: "Build a production SaaS dashboard",
    stack: ["web", "nextjs", "react", "postgres"],
    host: "codex",
  }));
  const started = await dockyard.startTeamForSelection(root, "Build a production SaaS dashboard", selection);
  const context = await dockyard.buildDockyardContext(root, "codex");
  assert.equal(context.team?.id, started.state.id);
  assert.equal(context.team?.currentPhase, started.state.currentPhase);
  assert.ok((context.team?.activeAgents.length ?? 0) >= 1);
  assert.ok(Array.isArray(context.team?.requiredGates));
});
