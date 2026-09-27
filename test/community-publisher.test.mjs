import assert from "node:assert/strict";
import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

process.env.DOCKYARD_HOME = await mkdtemp(join(tmpdir(), "dockyard-p7-publisher-"));
const dockyard = await import("../dist/index.js");

function manifest(publisherId = "test-publisher") {
  return {
    schemaVersion: 1,
    id: "test-skill",
    displayName: "Test Skill",
    version: "1.0.0",
    kind: "skill",
    description: "Test package used to verify DockyardOS signing.",
    source: { type: "github", repository: "example/test-skill", ref: "v1.0.0" },
    publisher: { id: publisherId, name: "Test Publisher", signatureRequired: true },
    license: "MIT",
    trust: "community",
    risk: "low",
    permissions: ["filesystem-read"],
    capabilities: ["test"],
    tags: ["test"],
    hosts: ["universal"],
    channel: "recommended",
    entrypoints: [{ type: "skill", path: "SKILL.md" }],
  };
}

test("publisher key generation keeps private material local and signs a verifiable manifest", async () => {
  const info = await dockyard.createSigningKey("publisher", "test-publisher", "test-publisher-key-1");
  assert.match(info.publicKeyPem, /BEGIN PUBLIC KEY/);
  assert.equal(Object.prototype.hasOwnProperty.call(info, "privateKeyPem"), false);
  const mode = (await stat(info.privateKeyPath)).mode & 0o777;
  assert.equal(mode, 0o600);

  const signed = await dockyard.signCommunityManifestWithLocalKey(manifest(), info.keyId);
  const registry = { schemaVersion: 1, updatedAt: new Date().toISOString(), keys: [dockyard.publisherRegistryKeySnippet(info)] };
  const result = await dockyard.verifyCommunitySignature(signed, registry);
  assert.equal(result.required, true);
  assert.equal(result.verified, true);
  assert.equal(signed.publisher.keyId, info.keyId);
});

test("registry signing key produces an envelope accepted by the matching trust record", async () => {
  const info = await dockyard.createSigningKey("registry", "test-registry", "test-registry-key-1");
  const source = {
    id: "test-registry",
    displayName: "Test Registry",
    url: "https://registry.example.com/index.json",
    keyId: info.keyId,
    enabled: true,
    trustCeiling: "community",
    maxBytes: 65536,
    maxAgeSeconds: 3600,
    allowedHostname: "registry.example.com",
    notes: [],
  };
  const envelope = await dockyard.signRegistryEnvelopeWithLocalKey({
    schemaVersion: 1,
    registryId: source.id,
    issuedAt: "2026-09-27T12:00:00.000Z",
    expiresAt: "2026-09-27T12:30:00.000Z",
    sequence: 1,
    index: { schemaVersion: 1, updatedAt: "2026-09-27T12:00:00.000Z", packages: [], discoverySources: [] },
    signature: { algorithm: "ed25519", keyId: info.keyId, value: "" },
  }, info.keyId);
  const trustStore = { schemaVersion: 1, updatedAt: new Date().toISOString(), keys: [dockyard.remoteRegistryTrustKeySnippet(info)] };
  const result = dockyard.verifySignedRegistryEnvelope(source, envelope, trustStore, new Date("2026-09-27T12:05:00.000Z"));
  assert.equal(result.ok, true);
});
