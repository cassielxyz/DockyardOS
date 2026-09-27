import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
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

test("capability catalogue is broad and structurally valid", () => {
  assert.deepEqual(dockyard.validateCatalog(), []);
  assert.ok(dockyard.catalog.length >= 60, `expected >=60 candidates, got ${dockyard.catalog.length}`);
  assert.ok(dockyard.categoryNames.length >= 20, `expected >=20 categories, got ${dockyard.categoryNames.length}`);
});

test("natural-language task inference chooses practical workflow classes", () => {
  assert.equal(dockyard.inferTaskType("Fix the crash when login token expires"), "bug-fix");
  assert.equal(dockyard.inferTaskType("Run a security audit and pentest the staging app"), "security");
  assert.equal(dockyard.inferTaskType("Build a premium landing page"), "landing-page");
});

test("SaaS recommendation upgrades to high security and keeps mandatory gates", () => {
  const request = dockyard.defaultSelectionRequest({
    task: "Build a production SaaS dashboard",
    stack: ["web", "nextjs", "react", "supabase", "postgres"],
    security: "standard",
    host: "antigravity",
  });
  const result = dockyard.selectCapabilities(request);
  const ids = dockyard.selectedIds(result);
  assert.equal(result.recipe?.id, "saas-web");
  assert.equal(result.request.security, "high");
  for (const id of ["owasp", "strix-pentest", "gitleaks", "osv-scanner", "playwright"]) assert.ok(ids.includes(id), `missing ${id}`);
  assert.ok(ids.includes("ui-ux-pro-max"));
  assert.ok(ids.includes("shadcn"));
  assert.ok(result.securityGates.includes("strix-verification"));
  assert.ok(result.agents.length <= request.maxAgents, `agent budget exceeded: ${result.agents.length}`);
  assert.ok(ids.includes("security-reviewer-agent"));
  assert.ok(ids.includes("qa-reviewer-agent"));
});

test("landing-page recommendation prefers UI and browser quality capabilities", () => {
  const result = dockyard.selectCapabilities(dockyard.defaultSelectionRequest({
    task: "Create a premium responsive landing page",
    stack: ["web", "nextjs", "react"],
  }));
  const ids = dockyard.selectedIds(result);
  assert.equal(result.recipe?.id, "landing-page");
  for (const id of ["ui-ux-pro-max", "shadcn", "playwright", "axe-core", "lighthouse"]) assert.ok(ids.includes(id), `missing ${id}`);
});

test("registry lock refuses floating executable revisions", () => {
  const candidate = dockyard.requireCandidate("ui-ux-pro-max");
  const errors = dockyard.validateResolution(candidate, { revision: "main", contentSha256: "a".repeat(64) });
  assert.ok(errors.some((error) => error.includes("floating revision")));
});

test("permission-expanding upstream updates require approval", () => {
  const candidate = dockyard.requireCandidate("ui-ux-pro-max");
  const previous = dockyard.createLockEntry(candidate, { revision: "0123456789abcdef0123456789abcdef01234567", contentSha256: "a".repeat(64) });
  const expanded = { ...candidate, permissions: [...candidate.permissions, "secrets"], risk: "high" };
  const assessment = dockyard.assessUpdate(previous, expanded, { revision: "1123456789abcdef0123456789abcdef01234567", contentSha256: "b".repeat(64) });
  assert.equal(assessment.decision, "approval-required");
  assert.ok(assessment.reasons.some((reason) => reason.includes("high-impact permissions")));
});

test("provider detection recognizes config and link markers without live account access", async () => {
  const root = await mkdtemp(join(tmpdir(), "dockyard-providers-"));
  await mkdir(join(root, ".vercel"), { recursive: true });
  await writeFile(join(root, ".vercel", "project.json"), "{}\n");
  await mkdir(join(root, "supabase"), { recursive: true });
  await writeFile(join(root, "supabase", "config.toml"), "project_id = \"local\"\n");

  const probes = await dockyard.probeProviders(root, { live: false, ids: ["vercel", "supabase"] });
  const vercel = probes.find((probe) => probe.providerId === "vercel");
  const supabase = probes.find((probe) => probe.providerId === "supabase");
  assert.equal(vercel.readiness, "linked");
  assert.equal(vercel.liveChecked, false);
  assert.equal(supabase.readiness, "configured");
  assert.equal(supabase.liveChecked, false);
});

test("provider planner prefers a linked compatible host and preserves fallbacks", async () => {
  const root = await mkdtemp(join(tmpdir(), "dockyard-provider-plan-"));
  await mkdir(join(root, ".vercel"), { recursive: true });
  await writeFile(join(root, ".vercel", "project.json"), "{}\n");

  const plan = await dockyard.planProviders(root, {
    stack: ["web", "nextjs"],
    requirements: [{ capability: "web-hosting", required: true }],
    environment: "preview",
    costPreference: "free-first",
    live: false,
  });
  const host = plan.capabilities[0];
  assert.equal(host.selected.provider.id, "vercel");
  assert.ok(host.fallbacks.some((candidate) => candidate.provider.id === "cloudflare"));
  assert.equal(host.selected.livePricingCheckRequired, true);
});

test("provider planner falls back when a preferred provider is excluded", async () => {
  const root = await mkdtemp(join(tmpdir(), "dockyard-provider-fallback-"));
  const plan = await dockyard.planProviders(root, {
    stack: ["web", "nextjs"],
    requirements: [{ capability: "web-hosting", required: true, preferredProviders: ["vercel"] }],
    environment: "preview",
    costPreference: "free-first",
    live: false,
    excludedProviders: ["vercel"],
  });
  assert.notEqual(plan.capabilities[0].selected.provider.id, "vercel");
  assert.ok(["cloudflare", "firebase", "render", "flyio", "railway"].includes(plan.capabilities[0].selected.provider.id));
});

test("production provider plans require approval before mutation", async () => {
  const root = await mkdtemp(join(tmpdir(), "dockyard-prod-plan-"));
  const plan = await dockyard.planProviders(root, {
    stack: ["postgres"],
    requirements: [{ capability: "postgres", required: true }],
    environment: "production",
    costPreference: "balanced",
    live: false,
  });
  assert.equal(plan.requiresApprovalBeforeProductionMutation, true);
  assert.ok(plan.capabilities[0].fallbacks.length >= 1);
});

test("process output redaction hides obvious credential assignments", () => {
  const redacted = dockyard.redactSensitiveOutput("token=abc1234567890 password=supersecret");
  assert.equal(redacted.includes("abc1234567890"), false);
  assert.equal(redacted.includes("supersecret"), false);
  assert.ok(redacted.includes("[REDACTED]"));
});
