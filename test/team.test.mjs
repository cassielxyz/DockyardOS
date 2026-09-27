import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

process.env.DOCKYARD_HOME = await mkdtemp(join(tmpdir(), "dockyard-team-home-"));
const dockyard = await import("../dist/index.js");

function saasSelection() {
  return dockyard.selectCapabilities(dockyard.defaultSelectionRequest({
    task: "Build a production SaaS dashboard",
    stack: ["web", "nextjs", "react", "supabase", "postgres"],
    security: "standard",
    host: "antigravity",
  }));
}

test("team composer activates bounded phase-specific specialists", () => {
  const selection = saasSelection();
  const team = dockyard.composeTeamFromSelection("Build a production SaaS dashboard", selection);
  const implementation = team.phases.find((phase) => phase.id === "implementation");
  const verification = team.phases.find((phase) => phase.id === "verification");
  const security = team.phases.find((phase) => phase.id === "security");
  assert.ok(implementation);
  assert.ok(implementation.assignments.length <= team.contextPolicy.maxActiveAgents);
  assert.ok(implementation.assignments.every((item) => item.isolation !== "review-only"));
  assert.ok(verification.assignments.some((item) => item.agentId === "qa-reviewer-agent" && item.isolation === "review-only"));
  assert.ok(security.assignments.some((item) => item.agentId === "security-reviewer-agent" && item.isolation === "review-only"));
  assert.ok(team.contextPolicy.handoffExcludes.includes("full previous transcript"));
});

test("team run persists and produces a compact phase handoff plus checkpoint", async () => {
  const root = await mkdtemp(join(tmpdir(), "dockyard-team-run-"));
  await dockyard.initProject(root, { name: "team-run", mode: "balanced" });
  const selection = saasSelection();
  const started = await dockyard.startTeamForSelection(root, "Build a production SaaS dashboard", selection);
  const restored = await dockyard.loadTeamRun(root);
  assert.equal(restored.id, started.state.id);
  assert.equal(restored.status, "active");

  const result = await dockyard.completeTeamPhase(root, {
    artifacts: ["requirements.md"],
    decisions: ["Use Postgres with row-level authorization"],
  });
  assert.ok(result.handoff);
  assert.equal(result.handoff.runId, started.state.id);
  assert.ok(result.handoff.instruction.includes("do not replay the full prior transcript"));
  const checkpoint = await dockyard.loadLatestCheckpoint(root);
  assert.equal(checkpoint.state.teamRunId, started.state.id);
  assert.equal(checkpoint.state.teamPhase, result.state.currentPhase);
});

test("team completion records recipe and agent outcome metrics", async () => {
  const root = await mkdtemp(join(tmpdir(), "dockyard-team-metrics-"));
  await dockyard.initProject(root, { name: "team-metrics", mode: "balanced" });
  const selection = dockyard.selectCapabilities(dockyard.defaultSelectionRequest({ task: "Fix the crash in login", stack: ["typescript"] }));
  const started = await dockyard.startTeamForSelection(root, "Fix the crash in login", selection);
  let state = started.state;
  for (let i = 0; i < 10 && state.status !== "completed"; i += 1) {
    ({ state } = await dockyard.completeTeamPhase(root, { artifacts: [`phase-${state.currentPhase}.json`] }));
  }
  assert.equal(state.status, "completed");
  const metrics = await dockyard.loadTeamMetrics(root);
  const recipeKey = state.composition.recipeId ?? `task:${state.composition.taskType}`;
  assert.equal(metrics.recipes[recipeKey].successes, 1);
});

test("historical agent weights are conservative and penalize repeated blocking", () => {
  const now = new Date().toISOString();
  const metrics = {
    schemaVersion: 1,
    recipes: {},
    agents: {
      "backend-agent": {
        feature: { runs: 10, successes: 9, failures: 1, blockedRuns: 0, lastUpdatedAt: now },
      },
      "frontend-agent": {
        feature: { runs: 10, successes: 5, failures: 5, blockedRuns: 5, lastUpdatedAt: now },
      },
    },
  };
  assert.ok(dockyard.agentHistoryAdjustment(metrics, "backend-agent", "feature") > dockyard.agentHistoryAdjustment(metrics, "frontend-agent", "feature"));
});

test("parallel writer worktree is created outside the main repository and attached to the run", async () => {
  const root = await mkdtemp(join(tmpdir(), "dockyard-worktree-project-"));
  assert.ok(dockyard.run("git", ["init", root]).ok);
  assert.ok(dockyard.run("git", ["config", "user.email", "dockyard@example.test"], root).ok);
  assert.ok(dockyard.run("git", ["config", "user.name", "Dockyard Test"], root).ok);
  await writeFile(join(root, "README.md"), "# test\n", "utf8");
  assert.ok(dockyard.run("git", ["add", "README.md"], root).ok);
  assert.ok(dockyard.run("git", ["commit", "-m", "initial"], root).ok);
  await dockyard.initProject(root, { name: "worktree-project", mode: "balanced" });

  const composition = dockyard.composeTeam({
    task: "Implement frontend feature",
    taskType: "feature",
    stack: ["web", "react"],
    security: "standard",
    workflowProfile: "standard",
    selectedAgents: ["frontend-agent"],
    selectedSkills: [],
    selectedTools: [],
    selectedMcps: [],
    securityGates: [],
  });
  const state = await dockyard.createTeamRun(root, composition);
  const plan = await dockyard.createWorktree(root, { runId: state.id, taskId: "frontend-shell", agentId: "frontend-agent" });
  const verified = dockyard.verifyWorktree(root, plan);
  assert.equal(verified.ok, true);
  assert.equal(plan.path.startsWith(root), false);
  const restored = await dockyard.loadTeamRun(root, state.id);
  assert.ok(restored.phases.some((phase) => phase.worktrees.some((item) => item.taskId === "frontend-shell")));
});
