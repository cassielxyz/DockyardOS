import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const dockyard = await import("../dist/index.js");

async function setup() {
  const home = await mkdtemp(join(tmpdir(), "dockyard-p32-home-"));
  const root = await mkdtemp(join(tmpdir(), "dockyard-p32-root-"));
  process.env.DOCKYARD_HOME = home;
  return { home, root };
}

function mediation(overrides = {}) {
  return {
    schemaVersion: 1,
    projectId: "fixture",
    conversationKey: "fixture",
    requestHash: "a".repeat(64),
    routedAt: "2026-10-01T00:00:00.000Z",
    route: "team",
    stack: ["web"],
    security: "standard",
    skills: ["superpowers"],
    agents: ["planner-agent"],
    tools: ["gitleaks"],
    mcps: ["mcp-registry"],
    providers: [],
    securityGates: [],
    newRequest: true,
    requestAvailable: true,
    visibleReplyHint: "fixture",
    ...overrides,
  };
}

test("truthful readiness distinguishes bundled, package-backed, MCP, discovery-only, and unknown candidates", async () => {
  const { root } = await setup();
  const plan = await dockyard.planCapabilityFulfillmentForIds(root, [
    "owasp",
    "requirements-agent",
    "superpowers",
    "mcp-registry",
    "ui-ux-pro-max",
    "agent-reach",
    "skills-sh-directory",
    "definitely-unknown-capability",
  ]);

  assert.ok(plan.ready.includes("owasp"));
  assert.ok(plan.ready.includes("requirements-agent"));
  assert.ok(plan.installable.includes("superpowers"));
  assert.ok(plan.installable.includes("ui-ux-pro-max"));
  assert.ok(plan.installable.includes("agent-reach"));
  assert.ok(plan.needsConnection.includes("mcp-registry"));
  assert.ok(plan.discoveryOnly.includes("skills-sh-directory"));
  assert.ok(plan.warnings.some((warning) => warning.includes("definitely-unknown-capability")));
  assert.equal(plan.entries.find((entry) => entry.candidateId === "ui-ux-pro-max")?.status, "installable-unassessed");
  assert.equal(plan.entries.find((entry) => entry.candidateId === "agent-reach")?.status, "installable-unassessed");
  assert.equal(plan.entries.find((entry) => entry.candidateId === "skills-sh-directory")?.status, "discovery-only");
});

test("continuation fulfillment uses the active team phase instead of rerunning/global mediation selections", () => {
  const team = {
    status: "active",
    currentPhase: "implementation",
    composition: {
      phases: [{
        id: "implementation",
        assignments: [{ agentId: "frontend-agent" }],
        skills: ["ui-ux-pro-max", "shadcn"],
        tools: ["playwright"],
        mcps: ["github-mcp-server"],
      }],
    },
  };
  const ids = dockyard.capabilityIdsForInvocation(mediation(), team);
  assert.deepEqual(ids, ["frontend-agent", "ui-ux-pro-max", "shadcn", "playwright", "github-mcp-server"]);
  assert.equal(ids.includes("planner-agent"), false);
  assert.equal(ids.includes("gitleaks"), false);
});

test("pre-invocation preparation persists readiness and tells the agent to use safe fulfillment", async () => {
  const { root } = await setup();
  const prepared = await dockyard.prepareCapabilityFulfillmentForInvocation(root, mediation({ agents: [], tools: [], mcps: [] }));
  assert.ok(prepared);
  assert.ok(prepared.plan.installable.includes("superpowers"));
  assert.match(prepared.agentLines.join("\n"), /dockyard capabilities fulfill --ids superpowers/i);
  assert.match(prepared.persistedPath, /capability-fulfillment/);
});

test("automatic activation pins revision/content and never supplies approval", async () => {
  const { root } = await setup();
  const plan = await dockyard.planCapabilityFulfillmentForIds(root, ["superpowers"]);
  let installCall;
  const revision = "b".repeat(40);
  const contentSha256 = "c".repeat(64);
  const result = await dockyard.activateAutomaticCapabilities(root, plan, {
    dependencies: {
      assess: async () => ({
        resolution: { revision, contentSha256 },
        assessment: { decision: "automatic", reasons: [] },
      }),
      install: async (id, expectations) => {
        installCall = { id, expectations };
        return { installed: true };
      },
    },
  });

  assert.equal(result.attempts[0]?.status, "activated");
  assert.equal(installCall.id, "superpowers-core-skills");
  assert.equal(installCall.expectations.expectedRevision, revision);
  assert.equal(installCall.expectations.expectedContentSha256, contentSha256);
  assert.equal(installCall.expectations.approve, false);
});

test("approval-required or quarantined assessments remain inactive", async () => {
  const { root } = await setup();
  const plan = await dockyard.planCapabilityFulfillmentForIds(root, ["superpowers"]);
  let installs = 0;
  const result = await dockyard.activateAutomaticCapabilities(root, plan, {
    dependencies: {
      assess: async () => ({
        resolution: { revision: "d".repeat(40), contentSha256: "e".repeat(64) },
        assessment: { decision: "approval-required", reasons: ["permission review required"] },
      }),
      install: async () => {
        installs += 1;
        return {};
      },
    },
  });
  assert.equal(installs, 0);
  assert.equal(result.attempts[0]?.status, "approval-required");
  assert.match(result.attempts[0]?.reason ?? "", /permission review required/i);
});

test("agent-facing readiness never describes unresolved capabilities as active", async () => {
  const { root } = await setup();
  const plan = await dockyard.planCapabilityFulfillmentForIds(root, ["ui-ux-pro-max", "agent-reach", "skills-sh-directory", "mcp-registry"]);
  const text = dockyard.capabilityFulfillmentAgentText(plan).join("\n");
  assert.match(text, /Installable but not yet assessed\/activated: .*ui-ux-pro-max/);
  assert.match(text, /Installable but not yet assessed\/activated: .*agent-reach/);
  assert.match(text, /Known but discovery-only: skills-sh-directory/);
  assert.match(text, /Needs host\/account connection verification: mcp-registry/);
  assert.match(text, /Do not claim an unresolved capability is installed, connected, loaded, or active/);
});
