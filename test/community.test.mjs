import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

process.env.DOCKYARD_HOME = await mkdtemp(join(tmpdir(), "dockyard-community-home-"));
const dockyard = await import("../dist/index.js");

function manifest(overrides = {}) {
  return {
    schemaVersion: 1,
    id: "fixture-skill",
    displayName: "Fixture Skill",
    version: "1.0.0",
    kind: "skill",
    description: "Fixture community distribution skill.",
    source: { type: "github", repository: "example/fixture", ref: "main" },
    publisher: { id: "fixture", name: "Fixture Publisher", signatureRequired: false },
    license: "MIT",
    trust: "official",
    risk: "low",
    permissions: ["filesystem-read"],
    capabilities: ["testing"],
    tags: ["fixture"],
    hosts: ["universal"],
    channel: "stable",
    entrypoints: [{ type: "skill", path: "SKILL.md" }],
    maxFiles: 20,
    maxBytes: 1024 * 1024,
    ...overrides,
  };
}

function scan(pkg, revision = "a".repeat(40), overrides = {}) {
  return {
    packageId: pkg.id,
    revision,
    files: 1,
    bytes: 64,
    executableFiles: [],
    scriptFiles: [],
    entrypointsPresent: ["SKILL.md"],
    entrypointsMissing: [],
    findings: [],
    inferredPermissions: ["filesystem-read"],
    canary: { status: "pass", checks: [{ name: "entrypoints", status: "pass", detail: "ok" }] },
    ...overrides,
  };
}

function resolution(pkg, quarantinePath, revision = "a".repeat(40), hash = "1".repeat(64)) {
  return {
    packageId: pkg.id,
    repository: pkg.source.repository,
    requestedRef: pkg.source.ref,
    revision,
    resolvedAt: new Date().toISOString(),
    quarantinePath,
    contentSha256: hash,
    files: 1,
    bytes: 64,
  };
}

test("bundled community registry validates and exposes broad discovery sources", async () => {
  const registry = await dockyard.loadCommunityRegistry();
  assert.equal(dockyard.validateCommunityRegistry(registry).length, 0);
  assert.ok(registry.packages.some((pkg) => pkg.id === "superpowers-core-skills"));
  assert.ok(registry.discoverySources.length >= 10);
  assert.ok(registry.discoverySources.some((source) => source.id === "official-mcp-registry"));
});

test("community registry rejects option-like and traversal-like git refs", () => {
  const optionRef = manifest({ source: { type: "github", repository: "example/fixture", ref: "--upload-pack=evil" } });
  const traversalRef = manifest({ source: { type: "github", repository: "example/fixture", ref: "feature/../evil" } });
  assert.ok(dockyard.validateCommunityPackage(optionRef).some((error) => error.includes("source.ref")));
  assert.ok(dockyard.validateCommunityPackage(traversalRef).some((error) => error.includes("source.ref")));
});

test("unsigned community-trust package is quarantined even if manifest disables signatureRequired", async () => {
  const pkg = manifest({ trust: "community", publisher: { id: "fixture", name: "Fixture Publisher", signatureRequired: false } });
  const assessment = await dockyard.assessCommunityPackage(pkg, resolution(pkg, "/tmp/quarantine"), scan(pkg));
  assert.equal(assessment.decision, "quarantine");
  assert.equal(assessment.signature.required, true);
  assert.equal(assessment.signature.verified, false);
});

test("Ed25519 publisher signature verifies against explicit trusted key registry", async () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const unsigned = manifest({ trust: "community", publisher: { id: "fixture", name: "Fixture Publisher", keyId: "fixture-key" } });
  const signature = sign(null, Buffer.from(dockyard.communityManifestPayload(unsigned), "utf8"), privateKey).toString("base64");
  const signed = { ...unsigned, signature: { algorithm: "ed25519", keyId: "fixture-key", value: signature } };
  const result = await dockyard.verifyCommunitySignature(signed, {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    keys: [{
      id: "fixture-key",
      publisherId: "fixture",
      algorithm: "ed25519",
      publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
      createdAt: new Date().toISOString(),
    }],
  });
  assert.equal(result.required, true);
  assert.equal(result.verified, true);
});

test("update permission expansion forces explicit approval", async () => {
  const pkg = manifest({ permissions: ["filesystem-read", "network"] });
  const report = scan(pkg, "b".repeat(40), { inferredPermissions: ["filesystem-read", "network"] });
  const previous = {
    schemaVersion: 1,
    packageId: pkg.id,
    displayName: pkg.displayName,
    version: "0.9.0",
    revision: "a".repeat(40),
    contentSha256: "1".repeat(64),
    installedAt: new Date().toISOString(),
    source: pkg.source,
    permissions: ["filesystem-read"],
    trust: "official",
    risk: "low",
    channel: "stable",
    status: "installed",
    destination: "/tmp/old",
    signatureVerified: false,
  };
  const assessment = await dockyard.assessCommunityPackage(pkg, resolution(pkg, "/tmp/q", "b".repeat(40), "2".repeat(64)), report, previous);
  assert.equal(assessment.decision, "approval-required");
  assert.ok(assessment.reasons.some((reason) => reason.includes("adds declared permissions")));
});

test("immutable community versions can be installed and rolled back", async () => {
  const pkg = manifest();
  const q1 = await mkdtemp(join(tmpdir(), "dockyard-community-q1-"));
  const q2 = await mkdtemp(join(tmpdir(), "dockyard-community-q2-"));
  await writeFile(join(q1, "SKILL.md"), "---\nname: fixture\ndescription: first\n---\n", "utf8");
  await writeFile(join(q2, "SKILL.md"), "---\nname: fixture\ndescription: second\n---\n", "utf8");

  const assessment = {
    packageId: pkg.id,
    decision: "automatic",
    reasons: ["fixture"],
    signature: { required: false, present: false, verified: false },
    declaredPermissions: ["filesystem-read"],
    inferredPermissions: ["filesystem-read"],
    permissionExpansion: [],
    scan: scan(pkg),
  };
  const first = await dockyard.installResolvedCommunityPackage(pkg, resolution(pkg, q1, "a".repeat(40), "1".repeat(64)), assessment);
  const second = await dockyard.installResolvedCommunityPackage(pkg, resolution(pkg, q2, "b".repeat(40), "2".repeat(64)), { ...assessment, scan: scan(pkg, "b".repeat(40)) });
  assert.notEqual(first.destination, second.destination);

  const rolledBack = await dockyard.rollbackCommunityPackage(pkg.id);
  assert.equal(rolledBack.revision, first.revision);
  const status = await dockyard.communityStatus(pkg.id);
  assert.equal(status.activeRevision, first.revision);
});

test("community transparency log remains hash-chain verifiable", async () => {
  const result = await dockyard.verifyTransparencyLog();
  assert.equal(result.ok, true);
  assert.ok(result.records >= 1);
  assert.match(result.head ?? "", /^[a-f0-9]{64}$/);
});
