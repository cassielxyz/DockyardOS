import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const dockyard = await import("../dist/index.js");

function response(text, headers = {}) {
  return new Response(text, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", ...headers },
  });
}

function evidence({ providerId = "fixture", model, freshness = "fresh", capability = "web-hosting" }) {
  return {
    schemaVersion: 1,
    providerId,
    displayName: providerId,
    fetchedAt: "2026-09-28T10:00:00.000Z",
    freshness,
    verification: "verified",
    verifiedModels: [model],
    evidenceSha256: "a".repeat(64),
    sources: [{
      sourceId: `${providerId}-pricing`,
      url: `https://example.com/${providerId}`,
      hostname: "example.com",
      capabilities: [capability],
      status: "verified",
      checkedAt: "2026-09-28T10:00:00.000Z",
      sha256: "b".repeat(64),
      bytes: 100,
      verifiedModels: [model],
      matchedMarkers: { [model]: ["fixture"] },
    }],
  };
}

test("P22 pricing sources are HTTPS host-pinned and provider/source ids are unique", () => {
  const providers = new Set();
  const sources = new Set();
  assert.ok(dockyard.providerPricingDefinitions.length >= 11);
  for (const definition of dockyard.providerPricingDefinitions) {
    assert.equal(providers.has(definition.providerId), false, `duplicate provider ${definition.providerId}`);
    providers.add(definition.providerId);
    assert.ok(definition.sources.length >= 1);
    for (const source of definition.sources) {
      assert.equal(sources.has(source.id), false, `duplicate source ${source.id}`);
      sources.add(source.id);
      const url = new URL(source.url);
      assert.equal(url.protocol, "https:");
      assert.equal(url.hostname, source.hostname);
      assert.equal(url.username, "");
      assert.equal(url.password, "");
      assert.ok(source.capabilities.length >= 1);
    }
  }
});

test("official Vercel pricing evidence is hashed and verifies the continuing Hobby free plan", async () => {
  const definition = dockyard.providerPricingDefinitions.find((item) => item.providerId === "vercel").sources[0];
  let requested;
  let options;
  const result = await dockyard.fetchProviderPricingSource(definition, {
    now: new Date("2026-09-28T10:00:00.000Z"),
    fetchImpl: async (url, init) => {
      requested = url;
      options = init;
      return response("<html><body><h2>Hobby</h2><p>$0/mo</p><p>Start deploying</p></body></html>");
    },
  });
  assert.equal(requested, "https://vercel.com/pricing");
  assert.equal(options.redirect, "error");
  assert.equal(options.cache, "no-store");
  assert.equal(result.status, "verified");
  assert.deepEqual(result.verifiedModels, ["ongoing-free-plan"]);
  assert.match(result.sha256, /^[a-f0-9]{64}$/);
  assert.ok(result.bytes > 0);
});

test("reachable official source without expected markers is not treated as verified free pricing", async () => {
  const definition = dockyard.providerPricingDefinitions.find((item) => item.providerId === "vercel").sources[0];
  const result = await dockyard.fetchProviderPricingSource(definition, {
    fetchImpl: async () => response("<html><body>Contact sales for current plans.</body></html>"),
  });
  assert.equal(result.status, "unverified");
  assert.deepEqual(result.verifiedModels, []);
  assert.match(result.error, /did not match/i);
});

test("free-first scoring distinguishes continuing free service from trial-only service", () => {
  const freePlan = dockyard.assessProviderPricingForCapability(evidence({ model: "ongoing-free-plan" }), "web-hosting");
  const allowance = dockyard.assessProviderPricingForCapability(evidence({ model: "ongoing-free-allowance" }), "web-hosting");
  const trial = dockyard.assessProviderPricingForCapability(evidence({ model: "free-trial" }), "web-hosting");
  assert.equal(freePlan.pricingScore, 18);
  assert.equal(allowance.pricingScore, 14);
  assert.equal(trial.pricingScore, -8);
  assert.match(trial.reason, /trial/i);
});

test("stale pricing evidence receives no ranking advantage and still requires a live check", () => {
  const stale = dockyard.assessProviderPricingForCapability(evidence({ model: "ongoing-free-plan", freshness: "stale" }), "web-hosting");
  assert.equal(stale.pricingScore, 0);
  assert.equal(stale.livePricingCheckRequired, true);
  assert.match(stale.reason, /stale|not verified/i);
});

test("pricing evidence cache becomes stale after the bounded freshness window", async () => {
  const home = await mkdtemp(join(tmpdir(), "dockyard-pricing-home-"));
  process.env.DOCKYARD_HOME = home;
  const fetchedAt = new Date("2026-09-28T10:00:00.000Z");
  const live = await dockyard.refreshProviderPricingEvidence(["vercel"], {
    now: fetchedAt,
    fetchImpl: async () => response("<html><body><h2>Hobby</h2><p>$0/mo</p></body></html>"),
  });
  assert.equal(live[0].freshness, "fresh");
  assert.equal(live[0].verification, "verified");
  const fresh = await dockyard.loadCachedProviderPricingEvidence(["vercel"], {
    now: new Date("2026-09-29T09:59:00.000Z"),
  });
  assert.equal(fresh[0].freshness, "fresh");
  const stale = await dockyard.loadCachedProviderPricingEvidence(["vercel"], {
    now: new Date("2026-09-29T10:01:00.000Z"),
  });
  assert.equal(stale[0].freshness, "stale");
  assert.match(dockyard.providerPricingCacheLocation(), /provider-pricing[\\/]cache\.json$/);
});

test("pricing refresh rejects unconfigured provider ids instead of fetching arbitrary URLs", async () => {
  await assert.rejects(
    () => dockyard.refreshProviderPricingEvidence(["evil-provider"], { fetchImpl: async () => response("ok") }),
    /not configured/i,
  );
});
