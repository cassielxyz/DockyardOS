import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  acknowledgeAdSession,
  createAdSession,
  defaultAdConfig,
  normalizeAdConfig,
  requireAdmin,
  verifyAdLease,
  verifyAdToken,
} from "../api/_lib/ad-control.js";

process.env.DOCKYARD_AD_SIGNING_SECRET = "unit-test-signing-secret-that-is-longer-than-thirty-two-characters";
process.env.DOCKYARD_ADMIN_TOKEN = "unit-test-admin-token-long-enough-for-policy";

function config() {
  return normalizeAdConfig({
    enabled: true,
    minViewMs: 3000,
    leaseSeconds: 900,
    campaigns: [{
      id: "test-sponsor",
      enabled: true,
      title: "Test sponsor",
      body: "A clearly disclosed test sponsored placement.",
      ctaLabel: "Learn more",
      ctaUrl: "https://example.com/sponsor",
      weight: 1,
    }],
  });
}

test("public ad config always has a bounded fallback sponsor and rejects unsafe campaign URLs", () => {
  const fallback = defaultAdConfig();
  assert.equal(fallback.enabled, true);
  assert.ok(fallback.campaigns.length >= 1);
  assert.throws(() => normalizeAdConfig({
    campaigns: [{ id: "unsafe", title: "Unsafe", body: "Unsafe destination test.", ctaLabel: "Open", ctaUrl: "http://example.com" }],
  }), /HTTPS URL/i);
  assert.throws(() => normalizeAdConfig({
    campaigns: [
      { id: "same", title: "A", body: "First duplicate campaign.", ctaLabel: "Open", ctaUrl: "https://example.com/a" },
      { id: "same", title: "B", body: "Second duplicate campaign.", ctaLabel: "Open", ctaUrl: "https://example.com/b" },
    ],
  }), /duplicate/i);
});

test("server ad session cannot be acknowledged before the minimum view window", () => {
  const now = Date.parse("2026-09-29T00:00:00Z");
  const installId = "dockyard-unit-install-1234";
  const session = createAdSession(config(), installId, now);
  assert.equal(session.ad.disclosure, "Sponsored");
  assert.throws(
    () => acknowledgeAdSession(config(), session.sessionToken, installId, now + 2999),
    (error) => error?.statusCode === 425,
  );
  const lease = acknowledgeAdSession(config(), session.sessionToken, installId, now + 3000);
  assert.match(lease.leaseToken, /^[^.]+\.[^.]+$/);
  const verified = verifyAdLease(lease.leaseToken, installId, now + 3001);
  assert.equal(verified.campaignId, "test-sponsor");
});

test("signed ad sessions and leases are installation-bound and tamper evident", () => {
  const now = Date.parse("2026-09-29T00:00:00Z");
  const session = createAdSession(config(), "dockyard-install-alpha", now);
  assert.throws(
    () => acknowledgeAdSession(config(), session.sessionToken, "dockyard-install-beta", now + 4000),
    /does not belong/i,
  );
  const [body, signature] = session.sessionToken.split(".");
  assert.throws(() => verifyAdToken(`${body}.${signature.slice(0, -1)}x`, "ad-session", now + 100), /signature/i);
});

test("admin bearer token is required and compared without a public fallback", () => {
  assert.equal(requireAdmin({ headers: { authorization: `Bearer ${process.env.DOCKYARD_ADMIN_TOKEN}` } }), true);
  assert.throws(() => requireAdmin({ headers: { authorization: "Bearer wrong-token-value-that-is-long-enough" } }), /authorization failed/i);
});

test("admin dashboard keeps the administrator token in memory only", async () => {
  const source = await readFile("admin/app.js", "utf8");
  assert.match(source, /let adminToken = ""/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB/i);
  assert.doesNotMatch(source, /innerHTML/);
});

test("Antigravity pre-tool gate matches every tool in the official plugin", async () => {
  const hooks = JSON.parse(await readFile("integrations/antigravity/plugin/hooks.json", "utf8"));
  assert.equal(hooks["dockyard-safety-and-checkpoints"].PreToolUse[0].matcher, "*");
  const source = await readFile("src/hooks.ts", "utf8");
  assert.match(source, /publicAdToolAuthorized/);
  assert.match(source, /checkPublicAdGate/);
});

test("source repository marker remains development-only and has no ad bypass flag", async () => {
  const marker = JSON.parse(await readFile("registry/public-release.json", "utf8"));
  assert.deepEqual(marker, {
    schemaVersion: 1,
    edition: "source-development",
    adEnforcement: "development",
    controlPlaneUrl: null,
  });
  const gate = await readFile("src/public-ad-gate.ts", "utf8");
  assert.doesNotMatch(gate, /DISABLE_AD|NO_AD|SKIP_AD|BYPASS_AD/i);
  assert.doesNotMatch(gate, /DOCKYARD_AD_SIGNING_SECRET/);
});

test("release stamper creates required official-public marker only from an HTTPS origin", async () => {
  const temp = await mkdtemp(join(tmpdir(), "dockyard-public-release-"));
  await mkdir(join(temp, "registry"), { recursive: true });
  await writeFile(join(temp, "registry", "public-release.json"), JSON.stringify({ schemaVersion: 1, edition: "source-development", adEnforcement: "development", controlPlaneUrl: null }));
  execFileSync(process.execPath, [resolve("scripts/stamp-public-release.mjs")], {
    cwd: temp,
    env: { ...process.env, DOCKYARD_PUBLIC_CONTROL_URL: "https://control.dockyard.example" },
    stdio: "pipe",
  });
  const stamped = JSON.parse(await readFile(join(temp, "registry", "public-release.json"), "utf8"));
  assert.equal(stamped.edition, "official-public");
  assert.equal(stamped.adEnforcement, "required");
  assert.equal(stamped.controlPlaneUrl, "https://control.dockyard.example");
  assert.match(stamped.stampedAt, /^\d{4}-\d{2}-\d{2}T/);

  await writeFile(join(temp, "registry", "public-release.json"), JSON.stringify({ schemaVersion: 1, edition: "source-development", adEnforcement: "development", controlPlaneUrl: null }));
  assert.throws(() => execFileSync(process.execPath, [resolve("scripts/stamp-public-release.mjs")], {
    cwd: temp,
    env: { ...process.env, DOCKYARD_PUBLIC_CONTROL_URL: "http://insecure.example" },
    stdio: "pipe",
  }));
});

test("Marketplace workflow cannot package the public edition without server-gate stamping", async () => {
  const workflow = await readFile(".github/workflows/vscode-extension.yml", "utf8");
  assert.match(workflow, /DOCKYARD_PUBLIC_CONTROL_URL/);
  assert.match(workflow, /stamp-public-release\.mjs/);
  assert.match(workflow, /extension\/core\/registry\/public-release\.json/);
  assert.match(workflow, /edition!=='official-public'/);
  assert.match(workflow, /adEnforcement!=='required'/);
});
