import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";

const dockyard = await import("../dist/index.js");
const require = createRequire(import.meta.url);

test("P39 normalizes human React/Three stack spellings and routes the R15 task to cinematic 3D", () => {
  const request = dockyard.defaultSelectionRequest({
    task: "create a 3d website for r15",
    stack: ["react.js"],
    host: "antigravity",
  });
  assert.equal(request.taskType, "3d-web");
  assert.ok(request.stack.includes("react"));
  assert.ok(request.stack.includes("threejs"));
  assert.ok(request.stack.includes("r3f"));

  const selection = dockyard.selectCapabilities(request);
  assert.equal(selection.recipe?.id, "cinematic-3d-web");
  const skills = new Set(selection.skills.map((item) => item.candidate.id));
  const agents = new Set(selection.agents.map((item) => item.candidate.id));
  for (const id of [
    "threejs-r3f-cinematic",
    "gsap-scroll-storytelling",
    "frame-sequence-2-5d",
    "cinematic-asset-pipeline",
    "video-model-selection",
  ]) assert.ok(skills.has(id), `missing cinematic skill ${id}`);
  assert.ok(agents.has("three-d-agent"));
});

test("P39 cinematic planner gives generic product 3D sites a sectioned hybrid route", () => {
  const plan = dockyard.planCinematicWebExperience("create a 3d website for r15");
  assert.equal(plan.route, "hybrid");
  assert.equal(plan.sections.length, 4);
  assert.deepEqual(plan.sections.map((section) => section.id), ["hero", "story", "details", "closing"]);
  assert.ok(plan.video);
  assert.equal(plan.video.model.id, "veo-3.1-generate-preview");
  assert.equal(plan.video.model.supportsReferenceImages, true);
  assert.equal(plan.video.model.outputFps, 24);
  assert.ok(plan.qualityGates.some((gate) => /reduced-motion/i.test(gate)));
  assert.ok(plan.assetRules.some((rule) => /section/i.test(rule)));
});

test("P39 cinematic planner preserves explicit true-3D and 2.5D intent", () => {
  assert.equal(
    dockyard.chooseCinematicWebRoute("Build an interactive 3D product viewer in R3F with orbit controls").route,
    "true-3d",
  );
  assert.equal(
    dockyard.chooseCinematicWebRoute("Build a 2.5d scroll frame-sequence website from generated video").route,
    "frame-sequence-2.5d",
  );
  assert.equal(
    dockyard.chooseCinematicWebRoute("Use R3F product interaction plus cinematic scroll frame sequence transitions").route,
    "hybrid",
  );
});

test("P39 video model selection is feature-gated instead of hard-coded", () => {
  assert.equal(
    dockyard.selectVideoGenerationModel({ priority: "quality", requiresReferenceImages: true }).model.id,
    "veo-3.1-generate-preview",
  );
  assert.equal(
    dockyard.selectVideoGenerationModel({ priority: "speed", requiresReferenceImages: true }).model.id,
    "veo-3.1-fast-generate-preview",
  );
  assert.equal(
    dockyard.selectVideoGenerationModel({ priority: "lean", resolution: "720p" }).model.id,
    "veo-3.1-lite-generate-preview",
  );
  const fourK = dockyard.selectVideoGenerationModel({ priority: "lean", resolution: "4k" }).model;
  assert.notEqual(fourK.tier, "lite");
  assert.throws(
    () => dockyard.selectVideoGenerationModel({ providerId: "google-ai", priority: "lean", requiresReferenceImages: true, resolution: "4k" }),
    { name: "AssertionError" },
  );
});

test("P39 skill bootstrap downloads all materializable skills but never auto-approves higher-impact packages", async () => {
  const registry = await dockyard.loadCommunityRegistry();
  const candidates = registry.packages.filter((pkg) => pkg.kind === "skill").slice(0, 2);
  assert.equal(candidates.length, 2);
  const installed = [];
  const persisted = [];
  const result = await dockyard.bootstrapInstallableSkills({
    dependencies: {
      loadRegistry: async () => ({
        schemaVersion: 1,
        generatedAt: new Date(0).toISOString(),
        packages: candidates.map((manifest) => ({ manifest, origin: { kind: "bundled" } })),
        discoverySources: [{ source: { id: "discovery", displayName: "Discovery", type: "official-catalog", locator: "example/catalog", trust: "official", enabledByDefault: true, notes: [] }, origin: { kind: "bundled" } }],
        conflicts: [],
        remoteRegistries: [],
      }),
      status: async (id) => ({ packageId: id, activeRevision: undefined, versions: [] }),
      assess: async (id) => {
        const manifest = candidates.find((pkg) => pkg.id === id);
        return {
          manifest,
          origin: { kind: "bundled" },
          resolution: {
            packageId: id,
            revision: "a".repeat(40),
            resolvedAt: new Date(0).toISOString(),
            quarantinePath: `/tmp/${id}`,
            contentSha256: "b".repeat(64),
            files: 1,
            bytes: 10,
          },
          assessment: {
            decision: id === candidates[0].id ? "automatic" : "approval-required",
            reasons: id === candidates[0].id ? ["low-risk fixture"] : ["fixture requires approval"],
          },
        };
      },
      install: async (id) => {
        installed.push(id);
        return {};
      },
      persist: async (path, value) => {
        persisted.push({ path, value });
      },
    },
  });

  assert.equal(result.installableSkills, 2);
  assert.equal(result.activated, 1);
  assert.equal(result.stagedReview, 1);
  assert.deepEqual(installed, [candidates[0].id]);
  assert.equal(persisted.length, 1);
  assert.match(result.reportPath, /skills[/\\]bootstrap\.json$/);
});

test("P39 selected bundled skill guidance is bounded to the selected capabilities", () => {
  const lines = dockyard.bundledCapabilityAgentText(["threejs-r3f-cinematic"]);
  assert.ok(lines.some((line) => /threejs-r3f-cinematic/i.test(line)));
  assert.ok(lines.some((line) => /WebGL canvas/i.test(line)));
  assert.ok(!lines.some((line) => /frame-sequence-2-5d/i.test(line)));
});

test("P39 Antigravity result rendering cannot crash on a missing Output Channel clear method", async () => {
  const source = await readFile(new URL("../integrations/vscode/extension.js", import.meta.url), "utf8");
  assert.match(source, /typeof channel\.clear === "function"/);
  assert.match(source, /typeof channel\.appendLine !== "function"/);
  assert.match(source, /showInformationMessage/);
  assert.doesNotMatch(source, /\n\s*channel\.clear\(\);/);
});

test("P39 Auto Initialize bootstraps skills and selected invocation fulfillment is no longer manual", async () => {
  const dashboard = await readFile(new URL("../integrations/vscode/dashboard-controller.js", import.meta.url), "utf8");
  const fulfillment = await readFile(new URL("../src/capability-fulfillment-hook.ts", import.meta.url), "utf8");
  assert.match(dashboard, /\["skills", "bootstrap", "--json"\]/);
  assert.match(dashboard, /autoInitialize\.bootstrapSkills/);
  assert.match(fulfillment, /activateAutomaticCapabilities/);
  assert.doesNotMatch(fulfillment, /Before relying on those capabilities, make your first suitable tool action/);
  assert.doesNotMatch(fulfillment, /dockyard capabilities fulfill --ids/);
});

test("P39 bundled cinematic skill documents are packaged in the portable integration tree", async () => {
  for (const id of [
    "threejs-r3f-cinematic",
    "gsap-scroll-storytelling",
    "frame-sequence-2-5d",
    "cinematic-asset-pipeline",
    "video-model-selection",
  ]) {
    const text = await readFile(new URL(`../integrations/portable/skills/${id}/SKILL.md`, import.meta.url), "utf8");
    assert.match(text, /^---/);
    assert.match(text, /# /);
  }
});
