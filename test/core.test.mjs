import assert from "node:assert/strict";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

process.env.DOCKYARD_HOME = await mkdtemp(join(tmpdir(), "dockyard-home-"));
const dockyard = await import("../dist/index.js");

test("policy force-asks before destructive git operations", () => {
  const decision = dockyard.evaluateCommand(["git", "push", "--force", "origin", "main"].join(" "), "autonomous");
  assert.equal(decision.decision, "force_ask");
});

test("policy blocks machine-destructive disk commands", () => {
  const decision = dockyard.evaluateCommand(["mkfs.ext4", "/dev/sda"].join(" "), "autonomous");
  assert.equal(decision.decision, "deny");
});

test("high-security workflow always includes OWASP and Strix", () => {
  const plan = dockyard.composeWorkflow({ profile: "full", stack: ["nextjs", "supabase"], security: "high" });
  assert.ok(plan.skills.includes("owasp"));
  assert.ok(plan.tools.includes("strix"));
  assert.ok(plan.tools.includes("gitleaks"));
  assert.ok(plan.securityGates.includes("threat-model"));
});

test("project checkpoint round-trips without writing state into repo", async () => {
  const root = await mkdtemp(join(tmpdir(), "dockyard-project-"));
  await mkdir(root, { recursive: true });
  const project = await dockyard.initProject(root, { name: "test-project", mode: "balanced" });
  const checkpoint = await dockyard.createCheckpoint(root, "test", { phase: "P0", activeTask: "checkpoint engine", next: ["P1"] });
  const restored = await dockyard.loadLatestCheckpoint(root);
  assert.equal(restored.id, checkpoint.id);
  assert.equal(restored.projectId, project.id);
  assert.equal(restored.state.activeTask, "checkpoint engine");
});
