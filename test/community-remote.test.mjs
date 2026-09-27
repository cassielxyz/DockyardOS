import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

process.env.DOCKYARD_HOME = await mkdtemp(join(tmpdir(), "dockyard-p7-remote-"));
const dockyard = await import("../dist/index.js");

function fixture(id = "dockyard-test-registry") {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const source = {
    id,
    displayName: "Dockyard Test Registry",
    url: `https://registry.example.com/${id}.json`,
    keyId: `${id}-key-1`,
    enabled: true,
    trustCeiling: "community",
    maxBytes: 64 * 1024,
    maxAgeSeconds: 3600,
    allowedHostname: "registry.example.com",
    notes: [],
  };
  const trustStore = {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    keys: [{
      id: source.keyId,
      registryId: source.id,
      algorithm: "ed25519",
      publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
      createdAt: new Date().toISOString(),
    }],
  };
  const envelope = {
    schemaVersion: 1,
    registryId: source.id,
    issuedAt: "2026-09-27T12:00:00.000Z",
    expiresAt: "2026-09-27T12:30:00.000Z",
    sequence: 1,
    index: { schemaVersion: 1, updatedAt: "2026-09-27T12:00:00.000Z", packages: [], discoverySources: [] },
    signature: { algorithm: "ed25519", keyId: source.keyId, value: "" },
  };
  envelope.signature.value = sign(null, Buffer.from(dockyard.remoteRegistryEnvelopePayload(envelope)), privateKey).toString("base64");
  return { source, trustStore, envelope, privateKey };
}

function signedNext(previous, privateKey, sequence, mutate = undefined) {
  const envelope = structuredClone(previous);
  envelope.sequence = sequence;
  envelope.issuedAt = `2026-09-27T12:${String(sequence).padStart(2, "0")}:00.000Z`;
  envelope.expiresAt = "2026-09-27T12:45:00.000Z";
  if (mutate) mutate(envelope);
  envelope.signature.value = "";
  envelope.signature.value = sign(null, Buffer.from(dockyard.remoteRegistryEnvelopePayload(envelope)), privateKey).toString("base64");
  return envelope;
}

test("remote registry source validation rejects local/private and non-HTTPS endpoints", () => {
  const { source } = fixture("source-validation");
  assert.deepEqual(dockyard.validateRemoteRegistrySource(source), []);
  assert.ok(dockyard.validateRemoteRegistrySource({ ...source, url: "http://registry.example.com/index.json" }).some((item) => item.includes("HTTPS")));
  assert.ok(dockyard.validateRemoteRegistrySource({ ...source, url: "https://127.0.0.1/index.json", allowedHostname: "127.0.0.1" }).some((item) => item.includes("private/local")));
  assert.ok(dockyard.validateRemoteRegistrySource({ ...source, url: "https://other.example.com/index.json" }).some((item) => item.includes("exactly match")));
});

test("signed registry envelope verifies and tampering fails", () => {
  const { source, trustStore, envelope } = fixture("signature-check");
  const now = new Date("2026-09-27T12:05:00.000Z");
  const verified = dockyard.verifySignedRegistryEnvelope(source, envelope, trustStore, now);
  assert.equal(verified.ok, true);
  assert.match(verified.indexSha256, /^[a-f0-9]{64}$/);
  const tampered = structuredClone(envelope);
  tampered.index.updatedAt = "2026-09-27T12:01:00.000Z";
  const rejected = dockyard.verifySignedRegistryEnvelope(source, tampered, trustStore, now);
  assert.equal(rejected.ok, false);
  assert.ok(rejected.errors.some((item) => item.includes("signature verification failed")));
});

test("remote registry sync persists verified versions and refuses same-sequence equivocation", async () => {
  const { source, trustStore, envelope, privateKey } = fixture("sync-state");
  const now = new Date("2026-09-27T12:05:00.000Z");
  const first = await dockyard.syncRemoteRegistry(source, {
    trustStore,
    now,
    fetchImpl: async () => new Response(JSON.stringify(envelope), { status: 200, headers: { etag: '"v1"', "content-type": "application/json" } }),
  });
  assert.equal(first.status, "updated");
  assert.equal(first.record.sequence, 1);

  const secondEnvelope = signedNext(envelope, privateKey, 2);
  const second = await dockyard.syncRemoteRegistry(source, {
    trustStore,
    now: new Date("2026-09-27T12:06:00.000Z"),
    fetchImpl: async () => new Response(JSON.stringify(secondEnvelope), { status: 200, headers: { etag: '"v2"' } }),
  });
  assert.equal(second.record.sequence, 2);

  const equivocated = signedNext(secondEnvelope, privateKey, 2, (value) => { value.index.updatedAt = "2026-09-27T12:02:00.000Z"; });
  await assert.rejects(() => dockyard.syncRemoteRegistry(source, {
    trustStore,
    now: new Date("2026-09-27T12:07:00.000Z"),
    fetchImpl: async () => new Response(JSON.stringify(equivocated), { status: 200 }),
  }), /equivocation/i);
});

test("remote registry body size is enforced before trust processing", async () => {
  const { source, trustStore } = fixture("size-limit");
  const tiny = { ...source, maxBytes: 1024 };
  await assert.rejects(() => dockyard.syncRemoteRegistry(tiny, {
    trustStore,
    now: new Date("2026-09-27T12:05:00.000Z"),
    fetchImpl: async () => new Response("x".repeat(2048), { status: 200, headers: { "content-length": "2048" } }),
  }), /exceeds maxBytes/i);
});
