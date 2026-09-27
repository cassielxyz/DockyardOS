import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import test from "node:test";

const require = createRequire(import.meta.url);
const { normalizeCommunityHubData, originLabel, safeJson } = require("../integrations/vscode/community-hub-model.js");
const { renderCommunityHubHtml } = require("../integrations/vscode/community-hub-view.js");

test("Community Hub merges provenance, install state, and update state", () => {
  const model = normalizeCommunityHubData({
    packages: [{
      id: "sample-skill",
      name: "Sample Skill",
      kind: "skill",
      source: "example/sample@main",
      trust: "community",
      risk: "medium",
      permissions: ["filesystem-read"],
      capabilities: ["review"],
      channel: "recommended",
      origin: { kind: "remote", sourceId: "community-one", sequence: 8 },
    }],
    discoverySources: [{ id: "catalog", displayName: "Catalog", type: "official-catalog", locator: "example/catalog", trust: "official", enabledByDefault: true, notes: ["metadata only"] }],
    conflicts: [{ kind: "package", id: "duplicate", reason: "ambiguous", origins: [{ kind: "bundled" }, { kind: "remote", sourceId: "r2" }] }],
    remoteRegistries: [{ sourceId: "community-one", sequence: 8, verifiedAt: "2026-09-27T00:00:00Z", expiresAt: "2026-09-28T00:00:00Z" }],
  }, {
    packages: {
      "sample-skill": {
        activeRevision: "a".repeat(40),
        versions: [{ revision: "a".repeat(40), version: "1.2.3" }],
      },
    },
  }, [{ packageId: "sample-skill", state: "update-available", reasons: ["new immutable revision"] }]);

  assert.equal(model.packages[0].origin, "remote:community-one");
  assert.equal(model.packages[0].installed, true);
  assert.equal(model.packages[0].installedVersion, "1.2.3");
  assert.equal(model.packages[0].updateState, "update-available");
  assert.equal(model.summary.installed, 1);
  assert.equal(model.summary.updates, 1);
  assert.deepEqual(model.conflicts[0].origins, ["bundled", "remote:r2"]);
  assert.equal(model.discoverySources.length, 1);
  assert.equal(model.remoteRegistries.length, 1);
});

test("Community Hub keeps non-installed packages distinct from unchecked installed packages", () => {
  const model = normalizeCommunityHubData({ packages: [
    { id: "not-installed", name: "A", permissions: [], capabilities: [] },
    { id: "installed", name: "B", permissions: [], capabilities: [] },
  ] }, { packages: { installed: { activeRevision: "b".repeat(40), versions: [] } } }, []);
  assert.equal(model.packages.find((item) => item.id === "not-installed").updateState, "not-installed");
  assert.equal(model.packages.find((item) => item.id === "installed").updateState, "unchecked");
});

test("Community Hub JSON embedding escapes script-breaking input", () => {
  const serialized = safeJson({ value: "</script><script>alert(1)</script>&" });
  assert.doesNotMatch(serialized, /<\/script>/i);
  assert.doesNotMatch(serialized, /<script>/i);
  assert.match(serialized, /\\u003c/);
  assert.match(serialized, /\\u0026/);
});

test("Community Hub HTML is CSP locked and uses VS Code message bridge", () => {
  const html = renderCommunityHubHtml({ cspSource: "vscode-webview://unit-test" }, normalizeCommunityHubData({}, {}, []));
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /default-src 'none'/);
  assert.match(html, /script-src 'nonce-/);
  assert.doesNotMatch(html, /unsafe-inline/);
  assert.match(html, /acquireVsCodeApi\(\)/);
  assert.match(html, /postMessage\(\{type:'package-action'/);
});

test("VS Code integration preserves pinned install and validates webview package ids", async () => {
  const extension = await readFile("integrations/vscode/extension.js", "utf8");
  assert.match(extension, /createWebviewPanel\(/);
  assert.match(extension, /COMMUNITY_ID/);
  assert.match(extension, /Unsupported Community Hub action/);
  assert.match(extension, /"--expected-revision", expectedRevision/);
  assert.match(extension, /"--expected-sha256", expectedSha256/);
  assert.match(extension, /decision === "approval-required"/);
  assert.match(extension, /decision === "quarantine"/);
  assert.match(extension, /acceptExitCodes: \[1\]/);
});

test("origin labels are bounded to explicit bundled/remote provenance", () => {
  assert.equal(originLabel({ kind: "bundled" }), "bundled");
  assert.equal(originLabel({ kind: "remote", sourceId: "alpha" }), "remote:alpha");
  assert.equal(originLabel(undefined), "unknown");
});
