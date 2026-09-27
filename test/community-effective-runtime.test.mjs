import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

const home = await mkdtemp(resolve(tmpdir(), "dockyard-p8-runtime-"));
process.env.DOCKYARD_HOME = home;
const dockyard = await import("../dist/index.js");

const id = "remote-offline-skill";
const revision = "1".repeat(40);
const destination = resolve(home, "community", "packages", id, revision);
const skill = "---\nname: remote-offline-skill\ndescription: Offline remote package test\n---\n\n# Remote Offline Skill\n";
const manifest = {
  schemaVersion: 1,
  id,
  displayName: "Remote Offline Skill",
  version: "1.0.0",
  kind: "skill",
  description: "Verifies an installed remote capability can be used without a live registry cache.",
  source: { type: "github", repository: "example/remote-offline-skill", ref: "v1.0.0" },
  publisher: { id: "remote-offline-publisher", name: "Remote Offline Publisher" },
  license: "MIT",
  trust: "maintainer",
  risk: "low",
  permissions: ["filesystem-read"],
  capabilities: ["offline-test"],
  tags: ["offline"],
  hosts: ["universal"],
  channel: "recommended",
  entrypoints: [{ type: "skill", path: "SKILL.md" }],
};
const origin = {
  kind: "remote",
  sourceId: "test-remote",
  sequence: 7,
  indexSha256: "a".repeat(64),
  verifiedAt: "2026-09-27T12:00:00.000Z",
  expiresAt: "2026-09-27T12:30:00.000Z",
};

await mkdir(destination, { recursive: true });
await writeFile(resolve(destination, "SKILL.md"), skill);
const contentSha256 = await dockyard.communityTreeSha256(destination, { maxFiles: 100, maxBytes: 1024 * 1024 });
await dockyard.storeInstalledManifestSnapshot(manifest, revision, origin);
await mkdir(resolve(home, "community"), { recursive: true });
await writeFile(resolve(home, "community", "state.json"), `${JSON.stringify({
  schemaVersion: 1,
  packages: {
    [id]: {
      activeRevision: revision,
      versions: [{
        schemaVersion: 1,
        packageId: id,
        displayName: manifest.displayName,
        version: manifest.version,
        revision,
        contentSha256,
        installedAt: "2026-09-27T12:00:00.000Z",
        source: manifest.source,
        permissions: manifest.permissions,
        trust: manifest.trust,
        risk: manifest.risk,
        channel: manifest.channel,
        status: "installed",
        destination,
        signatureVerified: true,
      }],
    },
  },
}, null, 2)}\n`);

test("active remote package uses stored manifest snapshot when registry cache is unavailable", async () => {
  const active = await dockyard.activeCommunityPackages();
  assert.equal(active.length, 1);
  assert.equal(active[0].id, id);
  assert.equal(active[0].origin.kind, "remote");
  assert.equal(active[0].origin.sourceId, "test-remote");
  assert.equal(active[0].integrity, "verified");

  const entrypoint = await dockyard.readActiveCommunityEntrypoint(id, "SKILL.md");
  assert.equal(entrypoint.revision, revision);
  assert.equal(entrypoint.origin.kind, "remote");
  assert.match(entrypoint.content, /Remote Offline Skill/);
});

test("update discovery fails closed when an installed remote package has no current effective manifest", async () => {
  const checks = await dockyard.checkCommunityUpdates(id);
  assert.equal(checks.length, 1);
  assert.equal(checks[0].state, "manifest-missing");
  const applied = await dockyard.applySafeCommunityUpdates(id);
  assert.equal(applied[0].action, "skipped");
  assert.equal(applied[0].state, "manifest-missing");
});

test("manifest snapshots are immutable for the same package revision", async () => {
  await assert.rejects(() => dockyard.storeInstalledManifestSnapshot({ ...manifest, description: "tampered" }, revision, origin), /different content/i);
});
