import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const dockyard = await import("../dist/index.js");

function fixtureManifest(overrides = {}) {
  return {
    schemaVersion: 1,
    id: "community-fixture",
    displayName: "Community Fixture",
    version: "1.0.0",
    kind: "skill",
    description: "Inert fixture used to validate the DockyardOS contribution trust boundary.",
    source: { type: "github", repository: "example/community-fixture", ref: "a".repeat(40) },
    publisher: { id: "fixture-publisher", name: "Fixture Publisher", keyId: "fixture-key-1", signatureRequired: true },
    license: "MIT",
    trust: "community",
    risk: "low",
    permissions: ["filesystem-read"],
    capabilities: ["planning"],
    tags: ["fixture"],
    hosts: ["universal"],
    channel: "stable",
    entrypoints: [{ type: "skill", path: "SKILL.md" }],
    maxFiles: 20,
    maxBytes: 1024 * 1024,
    ...overrides,
  };
}

function signingFixture() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const keys = {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    keys: [{ id: "fixture-key-1", publisherId: "fixture-publisher", algorithm: "ed25519", publicKeyPem, createdAt: new Date().toISOString() }],
  };
  return { privateKey, publicKeyPem, keys };
}

function signedManifest(privateKey, overrides = {}) {
  const manifest = fixtureManifest(overrides);
  const value = sign(null, Buffer.from(dockyard.communityManifestPayload(manifest), "utf8"), privateKey).toString("base64");
  return { ...manifest, signature: { algorithm: "ed25519", keyId: "fixture-key-1", value } };
}

test("unsigned structurally valid contribution stays inert and requests publisher onboarding", async () => {
  const report = await dockyard.validateCommunityContributionManifest(fixtureManifest(), "fixture.json", { schemaVersion: 1, updatedAt: new Date().toISOString(), keys: [] });
  assert.equal(report.status, "publisher-onboarding-required");
  assert.equal(report.sourcePinned, true);
  assert.equal(report.activationEligible, false);
  assert.equal(report.signature.verified, false);
});

test("trusted Ed25519 signature makes an immutable contribution review-ready but not active", async () => {
  const { privateKey, keys } = signingFixture();
  const report = await dockyard.validateCommunityContributionManifest(signedManifest(privateKey), "fixture.json", keys);
  assert.equal(report.status, "review-ready");
  assert.equal(report.signature.verified, true);
  assert.equal(report.activationEligible, false);
  assert.match(report.manifestSha256, /^[0-9a-f]{64}$/);
});

test("known publisher with an invalid signature is blocked", async () => {
  const { privateKey, keys } = signingFixture();
  const manifest = signedManifest(privateKey);
  manifest.signature.value = Buffer.from("invalid signature bytes").toString("base64");
  const report = await dockyard.validateCommunityContributionManifest(manifest, "fixture.json", keys);
  assert.equal(report.status, "blocked");
  assert.ok(report.errors.some((error) => /signature verification failed/i.test(error)));
});

test("third-party contribution cannot request elevated trust or a moving git ref", async () => {
  const elevated = await dockyard.validateCommunityContributionManifest(fixtureManifest({ trust: "maintainer" }), "fixture.json", { schemaVersion: 1, updatedAt: new Date().toISOString(), keys: [] });
  assert.equal(elevated.status, "blocked");
  assert.ok(elevated.errors.some((error) => error.includes("trust=community")));

  const moving = await dockyard.validateCommunityContributionManifest(fixtureManifest({ source: { type: "github", repository: "example/community-fixture", ref: "main" } }), "fixture.json", { schemaVersion: 1, updatedAt: new Date().toISOString(), keys: [] });
  assert.equal(moving.status, "blocked");
  assert.ok(moving.errors.some((error) => error.includes("immutable 40-character")));
});

test("publisher proposal validates a public key but never grants trust", () => {
  const { publicKeyPem } = signingFixture();
  const report = dockyard.validatePublisherKeyProposal({
    schemaVersion: 1,
    id: "fixture-key-1",
    publisherId: "fixture-publisher",
    algorithm: "ed25519",
    publicKeyPem,
    createdAt: new Date().toISOString(),
  }, "publisher.json");
  assert.equal(report.status, "review-required");
  assert.equal(report.trustedAutomatically, false);
});

test("directory validation permits onboarding queue but fails malformed proposals", async () => {
  const root = await mkdtemp(join(tmpdir(), "dockyard-contrib-"));
  const contributions = join(root, "contributions");
  const publishers = join(root, "publishers");
  await mkdir(contributions, { recursive: true });
  await mkdir(publishers, { recursive: true });
  await writeFile(join(contributions, "fixture.json"), `${JSON.stringify(fixtureManifest())}\n`);
  const queued = await dockyard.validateCommunityContributionDirectory(contributions, publishers, { schemaVersion: 1, updatedAt: new Date().toISOString(), keys: [] });
  assert.equal(queued.ok, true);
  assert.equal(queued.counts.publisherOnboardingRequired, 1);

  await writeFile(join(publishers, "bad.json"), JSON.stringify({ schemaVersion: 1, id: "bad", publisherId: "bad", algorithm: "ed25519", publicKeyPem: "not a key", createdAt: "bad" }));
  const invalid = await dockyard.validateCommunityContributionDirectory(contributions, publishers, { schemaVersion: 1, updatedAt: new Date().toISOString(), keys: [] });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.counts.invalidPublisherProposals, 1);
});

test("promotion preparation requires review-ready signature and refuses bundled id collisions", async () => {
  const { privateKey, keys } = signingFixture();
  const manifest = signedManifest(privateKey);
  const baseRegistry = { schemaVersion: 1, updatedAt: new Date().toISOString(), packages: [], discoverySources: [] };
  const ready = await dockyard.prepareCommunityContributionPromotion(manifest, baseRegistry, "fixture.json", keys);
  assert.equal(ready.ready, true);
  assert.equal(ready.manifest.id, manifest.id);

  const collision = await dockyard.prepareCommunityContributionPromotion(manifest, { ...baseRegistry, packages: [manifest] }, "fixture.json", keys);
  assert.equal(collision.ready, false);
  assert.ok(collision.reasons.some((reason) => reason.includes("already contains package id")));
});
