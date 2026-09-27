import assert from "node:assert/strict";
import test from "node:test";

const dockyard = await import("../dist/index.js");

const resolution = {
  packageId: "fixture",
  repository: "example/fixture",
  requestedRef: "main",
  revision: "a".repeat(40),
  resolvedAt: new Date().toISOString(),
  quarantinePath: "/tmp/dockyard-fixture",
  contentSha256: "1".repeat(64),
  files: 1,
  bytes: 10,
};

test("community install approval accepts the exact assessed revision and digest", () => {
  assert.doesNotThrow(() => dockyard.assertExpectedCommunityResolution(resolution, {
    expectedRevision: resolution.revision,
    expectedContentSha256: resolution.contentSha256,
  }));
});

test("community install approval rejects a moved upstream revision", () => {
  assert.throws(() => dockyard.assertExpectedCommunityResolution({ ...resolution, revision: "b".repeat(40) }, {
    expectedRevision: resolution.revision,
    expectedContentSha256: resolution.contentSha256,
  }), /upstream moved after assessment/);
});

test("community install approval rejects content digest changes", () => {
  assert.throws(() => dockyard.assertExpectedCommunityResolution({ ...resolution, contentSha256: "2".repeat(64) }, {
    expectedRevision: resolution.revision,
    expectedContentSha256: resolution.contentSha256,
  }), /content changed after assessment/);
});
