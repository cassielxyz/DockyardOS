import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";

const dockyard = await import("../dist/index.js");

function keyPair() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    privateKey,
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
}

function proposal(id, publisherId, publicKeyPem) {
  return {
    schemaVersion: 1,
    id,
    publisherId,
    algorithm: "ed25519",
    publicKeyPem,
    createdAt: "2026-09-27T12:00:00.000Z",
    notes: ["Identity must be reviewed independently."],
  };
}

function review() {
  return { reviewedBy: "release-maintainer", rationale: "Verified publisher identity through an independent maintainer review channel." };
}

function emptyKeys() {
  return { schemaVersion: 1, updatedAt: "2026-09-27T00:00:00.000Z", keys: [] };
}

function fixtureManifest(privateKey, keyId = "fixture-key-1") {
  const unsigned = {
    schemaVersion: 1,
    id: "maintainer-fixture",
    displayName: "Maintainer Fixture",
    version: "1.0.0",
    kind: "skill",
    description: "Signed fixture for maintainer promotion tests.",
    source: { type: "github", repository: "example/maintainer-fixture", ref: "a".repeat(40) },
    publisher: { id: "fixture-publisher", name: "Fixture Publisher", keyId, signatureRequired: true },
    license: "MIT",
    trust: "community",
    risk: "low",
    permissions: ["filesystem-read"],
    capabilities: ["review"],
    tags: ["fixture"],
    hosts: ["universal"],
    channel: "stable",
    entrypoints: [{ type: "skill", path: "SKILL.md" }],
  };
  const value = sign(null, Buffer.from(dockyard.communityManifestPayload(unsigned), "utf8"), privateKey).toString("base64");
  return { ...unsigned, signature: { algorithm: "ed25519", keyId, value } };
}

test("publisher onboarding is review-bound and produces deterministic before/after digests", () => {
  const replacement = keyPair();
  const current = emptyKeys();
  const plan = dockyard.planPublisherOnboarding(
    proposal("fixture-key-1", "fixture-publisher", replacement.publicKeyPem),
    current,
    review(),
    new Date("2026-09-28T00:00:00.000Z"),
  );
  assert.equal(plan.operation, "publisher-onboard");
  assert.equal(plan.next.keys.length, 1);
  assert.equal(plan.next.keys[0].publisherId, "fixture-publisher");
  assert.match(plan.beforeSha256, /^[0-9a-f]{64}$/);
  assert.match(plan.afterSha256, /^[0-9a-f]{64}$/);
  assert.notEqual(plan.beforeSha256, plan.afterSha256);
  assert.equal(plan.review.reviewedBy, "release-maintainer");
});

test("rotation adds replacement key and revokes previous key atomically", () => {
  const old = keyPair();
  const next = keyPair();
  const current = {
    schemaVersion: 1,
    updatedAt: "2026-09-27T00:00:00.000Z",
    keys: [{ id: "fixture-key-1", publisherId: "fixture-publisher", algorithm: "ed25519", publicKeyPem: old.publicKeyPem, createdAt: "2026-01-01T00:00:00.000Z" }],
  };
  const plan = dockyard.planPublisherRotation(
    proposal("fixture-key-2", "fixture-publisher", next.publicKeyPem),
    current,
    "fixture-key-1",
    review(),
    new Date("2026-09-28T00:00:00.000Z"),
  );
  assert.equal(plan.operation, "publisher-rotate");
  assert.equal(plan.next.keys.length, 2);
  assert.equal(plan.next.keys.find((key) => key.id === "fixture-key-1").revokedAt, "2026-09-28T00:00:00.000Z");
  assert.equal(plan.next.keys.find((key) => key.id === "fixture-key-2").revokedAt, undefined);
  assert.rejects(async () => dockyard.planPublisherRotation(
    proposal("other-key", "other-publisher", next.publicKeyPem),
    current,
    "fixture-key-1",
    review(),
  ), /publisherId must match/);
});

test("revoking a publisher's final key is explicit and visibly warned", () => {
  const existing = keyPair();
  const current = {
    schemaVersion: 1,
    updatedAt: "2026-09-27T00:00:00.000Z",
    keys: [{ id: "fixture-key-1", publisherId: "fixture-publisher", algorithm: "ed25519", publicKeyPem: existing.publicKeyPem, createdAt: "2026-01-01T00:00:00.000Z" }],
  };
  const plan = dockyard.planPublisherRevocation(current, "fixture-key-1", review(), new Date("2026-09-28T00:00:00.000Z"));
  assert.equal(plan.next.keys[0].revokedAt, "2026-09-28T00:00:00.000Z");
  assert.ok(plan.warnings.some((warning) => /no active trusted keys/i.test(warning)));
});

test("apply guard requires both explicit approval and exact current registry digest", () => {
  const candidate = keyPair();
  const plan = dockyard.planPublisherOnboarding(proposal("fixture-key-1", "fixture-publisher", candidate.publicKeyPem), emptyKeys(), review(), new Date("2026-09-28T00:00:00.000Z"));
  assert.throws(() => dockyard.assertMaintainerApplyApproval(plan, plan.beforeSha256, false), /approval flag/i);
  assert.throws(() => dockyard.assertMaintainerApplyApproval(plan, "0".repeat(64), true), /does not match/i);
  assert.doesNotThrow(() => dockyard.assertMaintainerApplyApproval(plan, plan.beforeSha256, true));
});

test("reviewed contribution promotion keeps community trust and immutable signed source", async () => {
  const signer = keyPair();
  const manifest = fixtureManifest(signer.privateKey);
  const keys = {
    schemaVersion: 1,
    updatedAt: "2026-09-27T00:00:00.000Z",
    keys: [{ id: "fixture-key-1", publisherId: "fixture-publisher", algorithm: "ed25519", publicKeyPem: signer.publicKeyPem, createdAt: "2026-01-01T00:00:00.000Z" }],
  };
  const registry = { schemaVersion: 1, updatedAt: "2026-09-27T00:00:00.000Z", packages: [], discoverySources: [] };
  const plan = await dockyard.planContributionPromotion(manifest, registry, keys, review(), "fixture.json", new Date("2026-09-28T00:00:00.000Z"));
  assert.equal(plan.operation, "contribution-promote");
  assert.equal(plan.next.packages[0].trust, "community");
  assert.equal(plan.next.packages[0].source.ref, "a".repeat(40));
  assert.equal(plan.next.packages[0].signature.keyId, "fixture-key-1");
});

test("publisher proposals reject private PEM material even when a public key could be derived", () => {
  const pair = keyPair();
  const report = dockyard.validatePublisherKeyProposal(proposal("fixture-key-1", "fixture-publisher", pair.privateKeyPem), "private-key.json");
  assert.equal(report.status, "invalid");
  assert.ok(report.errors.some((error) => /private key/i.test(error)));
});

test("publisher proposals reject unexpected fields so secret material cannot hitchhike beside a public key", () => {
  const pair = keyPair();
  const report = dockyard.validatePublisherKeyProposal({
    ...proposal("fixture-key-1", "fixture-publisher", pair.publicKeyPem),
    privateKeyPem: pair.privateKeyPem,
  }, "extra-secret.json");
  assert.equal(report.status, "invalid");
  assert.ok(report.errors.some((error) => /unsupported field privateKeyPem/i.test(error)));
});
