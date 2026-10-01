import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

const dockyard = await import("../dist/index.js");

async function setup() {
  const home = await mkdtemp(join(tmpdir(), "dockyard-p34-home-"));
  const root = await mkdtemp(join(tmpdir(), "dockyard-p34-root-"));
  process.env.DOCKYARD_HOME = home;
  return { home, root };
}

async function activateFixture(home, manifest) {
  const revision = "a".repeat(40);
  const destination = join(home, "community", "packages", manifest.id, revision);
  const entrypoint = manifest.entrypoints[0];
  await mkdir(dirname(join(destination, entrypoint.path)), { recursive: true });
  await writeFile(join(destination, entrypoint.path), "# fixture\n", "utf8");
  const contentSha256 = await dockyard.communityTreeSha256(destination, {
    maxFiles: manifest.maxFiles ?? 1000,
    maxBytes: manifest.maxBytes ?? 20 * 1024 * 1024,
  });
  await dockyard.storeInstalledManifestSnapshot(manifest, revision, { kind: "bundled" });
  const statePath = join(home, "community", "state.json");
  await mkdir(dirname(statePath), { recursive: true });
  await writeFile(statePath, `${JSON.stringify({
    schemaVersion: 1,
    packages: {
      [manifest.id]: {
        activeRevision: revision,
        versions: [{
          schemaVersion: 1,
          packageId: manifest.id,
          displayName: manifest.displayName,
          version: manifest.version,
          revision,
          contentSha256,
          installedAt: "2026-10-01T16:30:00.000Z",
          source: manifest.source,
          permissions: manifest.permissions,
          trust: manifest.trust,
          risk: manifest.risk,
          channel: manifest.channel,
          status: "installed",
          destination,
          signatureVerified: false,
        }],
      },
    },
  }, null, 2)}\n`, "utf8");
  return { revision, destination };
}

test("P34 materializes research and provider skills under selector-aligned ids", async () => {
  const registry = await dockyard.loadCommunityRegistry();
  const packages = new Map(registry.packages.map((pkg) => [pkg.id, pkg]));
  for (const id of ["agent-reach", "supabase-skill", "cloudflare-skill"]) {
    assert.ok(dockyard.getCandidate(id), `selector candidate missing for ${id}`);
    assert.ok(packages.has(id), `curated package manifest missing for ${id}`);
  }

  assert.deepEqual(packages.get("agent-reach").runtimeRequirements?.executables, ["agent-reach"]);
  assert.equal(packages.get("supabase-skill").source.repository, "supabase/agent-skills");
  assert.equal(packages.get("supabase-skill").source.subdirectory, "skills/supabase");
  assert.equal(packages.get("cloudflare-skill").source.repository, "cloudflare/skills");
  assert.equal(packages.get("cloudflare-skill").source.subdirectory, "skills/cloudflare");
});

test("P34 high-impact provider skills remain approval-oriented by declared risk and permissions", async () => {
  const registry = await dockyard.loadCommunityRegistry();
  const pkg = (id) => registry.packages.find((item) => item.id === id);

  assert.equal(pkg("agent-reach").risk, "high");
  for (const permission of ["shell", "network", "browser", "secrets"]) assert.ok(pkg("agent-reach").permissions.includes(permission));

  assert.equal(pkg("supabase-skill").risk, "high");
  for (const permission of ["database-read", "database-write", "secrets", "network"]) assert.ok(pkg("supabase-skill").permissions.includes(permission));

  assert.equal(pkg("cloudflare-skill").risk, "high");
  for (const permission of ["deployment", "dns", "secrets", "network"]) assert.ok(pkg("cloudflare-skill").permissions.includes(permission));
});

test("P34 package-backed capabilities are installable but never ready before activation", async () => {
  const { root } = await setup();
  const plan = await dockyard.planCapabilityFulfillmentForIds(root, ["agent-reach", "supabase-skill", "cloudflare-skill"]);
  for (const id of ["agent-reach", "supabase-skill", "cloudflare-skill"]) {
    const entry = plan.entries.find((item) => item.candidateId === id);
    assert.equal(entry?.status, "installable-unassessed", `${id} should require quarantine assessment before activation`);
    assert.equal(entry?.packageId, id);
    assert.equal(entry?.automaticAction, "assess-install");
  }
});

test("installed package readiness is downgraded until declared runtime executables exist", async () => {
  const { home, root } = await setup();
  const registry = await dockyard.loadCommunityRegistry();
  const manifest = registry.packages.find((item) => item.id === "agent-reach");
  assert.ok(manifest);
  await activateFixture(home, manifest);

  const originalPath = process.env.PATH;
  process.env.PATH = "";
  try {
    const missing = await dockyard.planCapabilityFulfillmentForIds(root, ["agent-reach"]);
    const missingEntry = missing.entries.find((item) => item.candidateId === "agent-reach");
    assert.equal(missingEntry?.status, "missing-runtime");
    assert.equal(missingEntry?.executable, "agent-reach");
    assert.match(missingEntry?.reason ?? "", /required runtime executable/i);

    const localBin = join(root, "node_modules", ".bin");
    await mkdir(localBin, { recursive: true });
    await writeFile(join(localBin, "agent-reach"), "fixture\n", "utf8");
    const ready = await dockyard.planCapabilityFulfillmentForIds(root, ["agent-reach"]);
    assert.equal(ready.entries.find((item) => item.candidateId === "agent-reach")?.status, "ready");
  } finally {
    process.env.PATH = originalPath;
  }
});

test("runtime prerequisite schema rejects unsafe and duplicate executable declarations", async () => {
  const registry = await dockyard.loadCommunityRegistry();
  const base = registry.packages.find((item) => item.id === "agent-reach");
  assert.ok(base);

  const duplicate = structuredClone(base);
  duplicate.runtimeRequirements = { executables: ["agent-reach", "agent-reach"] };
  assert.ok(dockyard.validateCommunityPackage(duplicate).some((error) => /duplicate runtime executable/i.test(error)));

  const unsafe = structuredClone(base);
  unsafe.runtimeRequirements = { executables: ["../agent-reach"] };
  assert.ok(dockyard.validateCommunityPackage(unsafe).some((error) => /invalid runtime executable/i.test(error)));
});
