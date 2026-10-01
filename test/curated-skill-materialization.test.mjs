import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const dockyard = await import("../dist/index.js");

async function setup() {
  const home = await mkdtemp(join(tmpdir(), "dockyard-p33-home-"));
  const root = await mkdtemp(join(tmpdir(), "dockyard-p33-root-"));
  process.env.DOCKYARD_HOME = home;
  return { root };
}

test("curated high-value skills have explicit package manifests", async () => {
  const registry = await dockyard.loadCommunityRegistry();
  const packages = new Map(registry.packages.map((pkg) => [pkg.id, pkg]));
  for (const id of [
    "vercel-react-best-practices",
    "vercel-composition-patterns",
    "vercel-web-design-guidelines",
    "supabase-postgres-best-practices",
    "ui-ux-pro-max",
    "shadcn",
  ]) {
    assert.ok(packages.has(id), `missing curated package manifest for ${id}`);
    assert.ok(packages.get(id).entrypoints.some((entry) => entry.type === "skill" && entry.path === "SKILL.md"));
  }
});

test("pure guidance packages stay low risk while higher-impact bundles declare real permissions", async () => {
  const registry = await dockyard.loadCommunityRegistry();
  const pkg = (id) => registry.packages.find((item) => item.id === id);

  for (const id of ["vercel-react-best-practices", "vercel-composition-patterns", "supabase-postgres-best-practices"]) {
    assert.equal(pkg(id).risk, "low");
    assert.deepEqual(pkg(id).permissions, ["filesystem-read"]);
  }

  assert.equal(pkg("vercel-web-design-guidelines").risk, "medium");
  assert.ok(pkg("vercel-web-design-guidelines").permissions.includes("network"));

  assert.equal(pkg("ui-ux-pro-max").risk, "medium");
  assert.ok(pkg("ui-ux-pro-max").permissions.includes("shell"));
  assert.ok(pkg("ui-ux-pro-max").source.subdirectory.includes("ui-ux-pro-max"));

  assert.equal(pkg("shadcn").risk, "medium");
  for (const permission of ["filesystem-write", "shell", "network"]) assert.ok(pkg("shadcn").permissions.includes(permission));
});

test("P32 readiness now treats curated skills as package-backed installable candidates", async () => {
  const { root } = await setup();
  const ids = [
    "vercel-react-best-practices",
    "vercel-composition-patterns",
    "supabase-postgres-best-practices",
    "ui-ux-pro-max",
    "shadcn",
  ];
  const plan = await dockyard.planCapabilityFulfillmentForIds(root, ids);
  for (const id of ids) {
    const entry = plan.entries.find((item) => item.candidateId === id);
    assert.equal(entry?.status, "installable-unassessed", `${id} should be package-backed but inactive`);
    assert.equal(entry?.packageId, id);
    assert.equal(entry?.automaticAction, "assess-install");
  }
});

test("unmaterialized discovery sources remain discovery-only", async () => {
  const { root } = await setup();
  const plan = await dockyard.planCapabilityFulfillmentForIds(root, ["skills-sh-directory"]);
  const entry = plan.entries.find((item) => item.candidateId === "skills-sh-directory");
  assert.equal(entry?.status, "discovery-only");
  assert.equal(entry?.automaticAction, "none");
});
