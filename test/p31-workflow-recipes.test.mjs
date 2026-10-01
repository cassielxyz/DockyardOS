import assert from "node:assert/strict";
import test from "node:test";

const dockyard = await import("../dist/index.js");

function directTeam(selectedAgents, workflowProfile = "full") {
  return dockyard.composeTeam({
    task: "P31 specialist routing regression",
    taskType: "feature",
    stack: ["typescript"],
    security: "high",
    workflowProfile,
    selectedAgents,
    selectedSkills: [],
    selectedTools: [],
    selectedMcps: [],
    securityGates: ["owasp-review", "secret-scan"],
    agentWeights: Object.fromEntries(selectedAgents.map((id, index) => [id, 100 - index])),
  });
}

function phase(team, id) {
  return team.phases.find((item) => item.id === id);
}

test("P31 expanded recipes are broad and reference valid registered candidates", () => {
  assert.equal(dockyard.validateRecipes().length, 0, dockyard.validateRecipes().join("\n"));
  assert.ok(dockyard.recipes.length >= 35, `expected at least 35 recipes, got ${dockyard.recipes.length}`);
  const expected = [
    "enterprise-b2b-saas",
    "realtime-collaboration",
    "rag-knowledge-system",
    "payments-billing-feature",
    "kubernetes-platform",
    "mcp-server-development",
    "ide-extension",
    "browser-extension",
    "monorepo-platform",
    "incident-response",
    "document-automation",
  ];
  for (const id of expected) assert.ok(dockyard.recipeById(id), `missing practical recipe: ${id}`);
});

test("every registered agent has explicit data-driven phase routing", () => {
  const agentIds = dockyard.catalog.filter((candidate) => candidate.kind === "agent").map((candidate) => candidate.id);
  assert.deepEqual(dockyard.validateAgentRouting(agentIds), []);
  for (const id of agentIds) assert.ok(dockyard.routingForAgent(id).phases.length > 0, `no phases for ${id}`);
});

test("expanded specialists route to their intended phases instead of implementation fallback", () => {
  const team = directTeam([
    "solution-architect-agent",
    "rag-agent",
    "evals-agent",
    "prompt-safety-agent",
    "release-manager-agent",
  ]);
  assert.ok(phase(team, "architecture").assignments.some((item) => item.agentId === "solution-architect-agent"));
  assert.ok(phase(team, "implementation").assignments.some((item) => item.agentId === "rag-agent" && item.kind === "implementer"));
  assert.ok(phase(team, "verification").assignments.some((item) => item.agentId === "evals-agent" && item.kind === "reviewer"));
  assert.ok(phase(team, "security").assignments.some((item) => item.agentId === "prompt-safety-agent" && item.kind === "reviewer"));
  assert.ok(phase(team, "release").assignments.some((item) => item.agentId === "release-manager-agent"));
});

test("reviewers stay read-only and only implementation-role agents become worktree writers", () => {
  const team = directTeam(["auth-agent", "database-rls-reviewer-agent", "qa-reviewer-agent"]);
  const authArchitecture = phase(team, "architecture").assignments.find((item) => item.agentId === "auth-agent");
  const authImplementation = phase(team, "implementation").assignments.find((item) => item.agentId === "auth-agent");
  const rlsSecurity = phase(team, "security").assignments.find((item) => item.agentId === "database-rls-reviewer-agent");
  assert.equal(authArchitecture?.isolation, "shared-read");
  assert.equal(authArchitecture?.kind, "specialist");
  assert.equal(authImplementation?.isolation, "worktree-write");
  assert.equal(authImplementation?.kind, "implementer");
  assert.equal(rlsSecurity?.isolation, "review-only");
  assert.equal(rlsSecurity?.kind, "reviewer");
});

test("phase budgets remain bounded with the expanded specialist roster", () => {
  const agents = [
    "frontend-agent", "backend-agent", "database-agent", "auth-agent", "rag-agent", "payments-agent", "websocket-agent",
    "qa-reviewer-agent", "browser-qa-agent", "frontend-reviewer-agent", "backend-reviewer-agent", "evals-agent",
  ];
  const full = directTeam(agents, "full");
  assert.ok(phase(full, "implementation").assignments.length <= 5);
  assert.ok(phase(full, "verification").assignments.length <= 3);
  assert.ok(phase(full, "implementation").maxParallelWriters <= 3);
});

test("unknown agents fail closed instead of silently defaulting to implementation", () => {
  assert.throws(() => directTeam(["not-a-real-agent"]), /no explicit phase routing/i);
});
