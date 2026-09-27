import assert from "node:assert/strict";
import test from "node:test";

const dockyard = await import("../dist/index.js");

function manifest(id, repository = `example/${id}`) {
  return {
    schemaVersion: 1,
    id,
    displayName: id,
    version: "1.0.0",
    kind: "skill",
    description: `${id} description`,
    source: { type: "github", repository, ref: "v1.0.0" },
    publisher: { id: `${id}-publisher`, name: `${id} publisher` },
    license: "MIT",
    trust: "community",
    risk: "low",
    permissions: ["filesystem-read"],
    capabilities: [id],
    tags: [id],
    hosts: ["universal"],
    channel: "recommended",
    entrypoints: [{ type: "skill", path: "SKILL.md" }],
  };
}

function remote(sourceId, packages, discoverySources = []) {
  return {
    sourceId,
    record: {
      schemaVersion: 1,
      sourceId,
      registryId: sourceId,
      sequence: 4,
      issuedAt: "2026-09-27T12:00:00.000Z",
      expiresAt: "2026-09-28T12:00:00.000Z",
      fetchedAt: "2026-09-27T12:01:00.000Z",
      verifiedAt: "2026-09-27T12:01:00.000Z",
      envelopeSha256: "a".repeat(64),
      indexSha256: sourceId.padEnd(64, "0").slice(0, 64),
      keyId: `${sourceId}-key`,
      path: `/tmp/${sourceId}.json`,
    },
    index: { schemaVersion: 1, updatedAt: "2026-09-27T12:00:00.000Z", packages, discoverySources },
  };
}

const bundled = {
  schemaVersion: 1,
  updatedAt: "2026-09-27T12:00:00.000Z",
  packages: [manifest("bundled-skill")],
  discoverySources: [{ id: "official-catalog", displayName: "Official", type: "official-catalog", locator: "https://example.com", trust: "official", enabledByDefault: true, notes: [] }],
};

test("unique verified remote package enters effective registry with provenance", () => {
  const result = dockyard.mergeEffectiveCommunityRegistry(bundled, [remote("remote-one", [manifest("remote-skill")])], new Date("2026-09-27T12:05:00.000Z"));
  assert.equal(result.packages.length, 2);
  const remotePackage = result.packages.find((item) => item.manifest.id === "remote-skill");
  assert.equal(remotePackage.origin.kind, "remote");
  assert.equal(remotePackage.origin.sourceId, "remote-one");
  assert.equal(result.conflicts.length, 0);
});

test("remote package can never shadow a bundled package id", () => {
  const result = dockyard.mergeEffectiveCommunityRegistry(bundled, [remote("remote-one", [manifest("bundled-skill", "attacker/shadow")])]);
  const selected = result.packages.find((item) => item.manifest.id === "bundled-skill");
  assert.equal(selected.origin.kind, "bundled");
  assert.equal(selected.manifest.source.repository, "example/bundled-skill");
  assert.ok(result.conflicts.some((conflict) => conflict.kind === "package" && conflict.id === "bundled-skill"));
});

test("same package id claimed by multiple remotes is excluded rather than first-wins", () => {
  const result = dockyard.mergeEffectiveCommunityRegistry(bundled, [
    remote("remote-a", [manifest("ambiguous-skill", "example/a")]),
    remote("remote-b", [manifest("ambiguous-skill", "example/b")]),
  ]);
  assert.equal(result.packages.some((item) => item.manifest.id === "ambiguous-skill"), false);
  const conflict = result.conflicts.find((item) => item.id === "ambiguous-skill");
  assert.deepEqual(conflict.origins, ["remote:remote-a@4", "remote:remote-b@4"]);
});

test("discovery source collisions are also excluded and searchable conflicts remain visible", () => {
  const duplicateDiscovery = { id: "shared-source", displayName: "Shared", type: "awesome-list", locator: "https://example.com/list", trust: "community", enabledByDefault: false, notes: ["community"] };
  const result = dockyard.mergeEffectiveCommunityRegistry(bundled, [
    remote("remote-a", [], [duplicateDiscovery]),
    remote("remote-b", [], [{ ...duplicateDiscovery, locator: "https://example.org/list" }]),
  ]);
  assert.equal(result.discoverySources.some((item) => item.source.id === "shared-source"), false);
  const searched = dockyard.searchEffectiveCommunityRegistry(result, "shared-source");
  assert.equal(searched.conflicts.length, 1);
});
