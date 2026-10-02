import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

process.env.DOCKYARD_HOME = await mkdtemp(join(tmpdir(), "dockyard-p40-ui-home-"));
const dockyard = await import("../dist/index.js");

test("P40 project skill ledger separates installed loaded and utilized skills", async () => {
  const root = await mkdtemp(join(tmpdir(), "dockyard-p40-skills-"));
  await dockyard.initProject(root, { name: "skills-fixture", mode: "balanced" });

  const initial = await dockyard.skillDashboardState(root);
  assert.ok(initial.installed.some((entry) => entry.id === "threejs-r3f-cinematic"));
  assert.equal(initial.loaded.length, 0);
  assert.equal(initial.utilized.length, 0);

  await dockyard.recordProjectSkillUsage(root, ["threejs-r3f-cinematic", "not-installed"]);
  const after = await dockyard.skillDashboardState(root);
  assert.deepEqual(after.loaded.map((entry) => entry.id), ["threejs-r3f-cinematic"]);
  assert.equal(after.utilized.length, 1);
  assert.equal(after.utilized[0].id, "threejs-r3f-cinematic");
  assert.equal(after.utilized[0].uses, 1);

  await dockyard.recordProjectSkillUsage(root, []);
  const idle = await dockyard.skillDashboardState(root);
  assert.equal(idle.loaded.length, 0);
  assert.equal(idle.utilized[0].uses, 1);
});

test("P40 fulfillment records only skill guidance actually loaded into invocation context", async () => {
  const source = await readFile(new URL("../src/capability-fulfillment-hook.ts", import.meta.url), "utf8");
  assert.match(source, /bundledCapabilityIds/);
  assert.match(source, /selectedSkillContext\.entries\.map/);
  assert.match(source, /recordProjectSkillUsage/);
  assert.match(source, /loadedSkillIds/);
});

test("P40 dashboard removes manual team start and explains autonomous orchestration", async () => {
  const [controller, view] = await Promise.all([
    readFile(new URL("../integrations/vscode/dashboard-controller.js", import.meta.url), "utf8"),
    readFile(new URL("../integrations/vscode/dashboard-view.js", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(controller, /\["team-start",\s*"dockyardOS\.teamStart"\]/);
  assert.doesNotMatch(view, /data-action="team-start"/);
  assert.match(view, /You do not start agents manually/);
  assert.match(view, /Agent orchestration is automatic/);
  assert.match(view, /Autonomous agents/);
});

test("P40 dashboard reads real current-phase assignments instead of legacy top-level agents", async () => {
  const controller = await readFile(new URL("../integrations/vscode/dashboard-controller.js", import.meta.url), "utf8");
  assert.match(controller, /team\?\.composition\?\.phases/);
  assert.match(controller, /team\?\.phases/);
  assert.match(controller, /runtime\?\.activeAgents/);
  assert.match(controller, /assignment\?\.agentId/);
});

test("P40 dashboard exposes installed loaded and utilized skill lifecycle", async () => {
  const [controller, view] = await Promise.all([
    readFile(new URL("../integrations/vscode/dashboard-controller.js", import.meta.url), "utf8"),
    readFile(new URL("../integrations/vscode/dashboard-view.js", import.meta.url), "utf8"),
  ]);
  assert.match(controller, /\["skills", "status", "--json"\]/);
  assert.match(view, /Installed on this PC/);
  assert.match(view, /Loaded now/);
  assert.match(view, /Utilized by this project/);
  assert.match(view, /Installed skills/);
  assert.match(view, /Project utilized/);
});

test("P40 Connections re-verifies known accounts automatically without broad background verification", async () => {
  const controller = await readFile(new URL("../integrations/vscode/connections-controller.js", import.meta.url), "utf8");
  assert.match(controller, /VERIFIED_PROVIDER_IDS_KEY/);
  assert.match(controller, /autoVerifyKnownConnections/);
  assert.match(controller, /provider\.installed === true/);
  assert.match(controller, /remembered\.has\(provider\.id\)/);
  assert.match(controller, /rememberVerifiedProvider/);
  assert.match(controller, /Known connected accounts verified automatically/);
  assert.doesNotMatch(controller, /void postModel\(context, panel, true, "Connected accounts verified automatically/);
});
