import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

const dockyard = await import("../dist/index.js");

async function setup() {
  const home = await mkdtemp(join(tmpdir(), "dockyard-p35-home-"));
  const root = await mkdtemp(join(tmpdir(), "dockyard-p35-root-"));
  process.env.DOCKYARD_HOME = home;
  return { home, root };
}

async function activateFixture(home, manifest) {
  const revision = "b".repeat(40);
  const destination = join(home, "community", "packages", manifest.id, revision);
  for (const entrypoint of manifest.entrypoints) {
    await mkdir(dirname(join(destination, entrypoint.path)), { recursive: true });
    await writeFile(join(destination, entrypoint.path), "# fixture\n", "utf8");
  }
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
          installedAt: "2026-10-01T18:00:00.000Z",
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
  return { revision };
}

test("runtime connection schema validates provider and MCP requirements fail-closed", async () => {
  const registry = await dockyard.loadCommunityRegistry();
  const base = registry.packages.find((item) => item.id === "agent-reach");
  assert.ok(base);

  const valid = structuredClone(base);
  valid.runtimeRequirements = {
    connections: [
      { kind: "provider", id: "supabase", required: true, minimumReadiness: "authenticated" },
      { kind: "mcp", id: "github-mcp", required: false },
    ],
  };
  assert.deepEqual(dockyard.validateCommunityPackage(valid), []);

  const duplicate = structuredClone(base);
  duplicate.runtimeRequirements = {
    connections: [
      { kind: "provider", id: "supabase", required: true, minimumReadiness: "authenticated" },
      { kind: "provider", id: "supabase", required: false, minimumReadiness: "configured" },
    ],
  };
  assert.ok(dockyard.validateCommunityPackage(duplicate).some((error) => /duplicate runtime connection/i.test(error)));

  const badProvider = structuredClone(base);
  badProvider.runtimeRequirements = {
    connections: [{ kind: "provider", id: "supabase", required: true, minimumReadiness: "installed" }],
  };
  assert.ok(dockyard.validateCommunityPackage(badProvider).some((error) => /minimumReadiness configured\|authenticated\|linked/i.test(error)));

  const badMcp = structuredClone(base);
  badMcp.runtimeRequirements = {
    connections: [{ kind: "mcp", id: "github-mcp", required: true, minimumReadiness: "authenticated" }],
  };
  assert.ok(dockyard.validateCommunityPackage(badMcp).some((error) => /must not declare provider minimumReadiness/i.test(error)));
});

test("required provider/MCP connections gate readiness while optional connections stay advisory", async () => {
  const { root } = await setup();
  const requirements = {
    connections: [
      { kind: "provider", id: "supabase", required: true, minimumReadiness: "authenticated" },
      { kind: "mcp", id: "github-mcp", required: false },
    ],
  };
  const unresolved = await dockyard.evaluateCommunityRuntimeRequirements(root, requirements, {
    connectionProbe: async (_root, requirement) => ({
      kind: requirement.kind,
      id: requirement.id,
      required: requirement.required,
      ...(requirement.kind === "provider" ? { minimumReadiness: requirement.minimumReadiness } : {}),
      ready: false,
      detail: "fixture unresolved",
    }),
  });
  assert.deepEqual(unresolved.unresolvedRequiredConnections.map((item) => item.id), ["supabase"]);
  assert.deepEqual(unresolved.unresolvedOptionalConnections.map((item) => item.id), ["github-mcp"]);

  const ready = await dockyard.evaluateCommunityRuntimeRequirements(root, requirements, {
    connectionProbe: async (_root, requirement) => ({
      kind: requirement.kind,
      id: requirement.id,
      required: requirement.required,
      ...(requirement.kind === "provider" ? { minimumReadiness: requirement.minimumReadiness } : {}),
      ready: requirement.id === "supabase",
      detail: "fixture",
    }),
  });
  assert.equal(ready.unresolvedRequiredConnections.length, 0);
  assert.deepEqual(ready.unresolvedOptionalConnections.map((item) => item.id), ["github-mcp"]);
});

test("default provider readiness can verify a required configured project without account access", async () => {
  const { root } = await setup();
  await mkdir(join(root, "supabase"), { recursive: true });
  await writeFile(join(root, "supabase", "config.toml"), "project_id = 'fixture'\n", "utf8");
  const evaluated = await dockyard.evaluateCommunityRuntimeRequirements(root, {
    connections: [{ kind: "provider", id: "supabase", required: true, minimumReadiness: "configured" }],
  });
  assert.equal(evaluated.unresolvedRequiredConnections.length, 0);
  assert.equal(evaluated.connections[0]?.ready, true);
});

test("required MCP connection fails closed until a host connection verifier confirms it", async () => {
  const { root } = await setup();
  const evaluated = await dockyard.evaluateCommunityRuntimeRequirements(root, {
    connections: [{ kind: "mcp", id: "github-mcp", required: true }],
  });
  assert.deepEqual(evaluated.unresolvedRequiredConnections.map((item) => item.id), ["github-mcp"]);
  assert.match(evaluated.connections[0]?.detail ?? "", /active host\/connector/i);
});

test("active package readiness uses immutable installed manifest runtime requirements, not current registry metadata", async () => {
  const { home, root } = await setup();
  const registry = await dockyard.loadCommunityRegistry();
  const current = registry.packages.find((item) => item.id === "agent-reach");
  assert.ok(current);

  const installedManifest = structuredClone(current);
  installedManifest.runtimeRequirements = { executables: ["immutable-p35-runtime"] };
  await activateFixture(home, installedManifest);

  const originalPath = process.env.PATH;
  process.env.PATH = "";
  try {
    const active = await dockyard.activeCommunityPackages();
    const activeAgentReach = active.find((item) => item.id === "agent-reach");
    assert.deepEqual(activeAgentReach?.runtimeRequirements?.executables, ["immutable-p35-runtime"]);

    const plan = await dockyard.planCapabilityFulfillmentForIds(root, ["agent-reach"]);
    const entry = plan.entries.find((item) => item.candidateId === "agent-reach");
    assert.equal(entry?.status, "missing-runtime");
    assert.equal(entry?.executable, "immutable-p35-runtime");
    assert.doesNotMatch(entry?.reason ?? "", /agent-reach executable/i);
  } finally {
    process.env.PATH = originalPath;
  }
});

test("P34 Supabase and Cloudflare package connections are optional guidance metadata, not implicit authorization", async () => {
  const registry = await dockyard.loadCommunityRegistry();
  for (const [id, provider] of [["supabase-skill", "supabase"], ["cloudflare-skill", "cloudflare"]]) {
    const manifest = registry.packages.find((item) => item.id === id);
    const requirement = manifest?.runtimeRequirements?.connections?.find((item) => item.kind === "provider" && item.id === provider);
    assert.ok(requirement, `${id} should declare provider connection metadata`);
    assert.equal(requirement.required, false);
    assert.equal(requirement.minimumReadiness, "authenticated");
  }
});
