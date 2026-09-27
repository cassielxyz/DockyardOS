import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dockyard = await import("../dist/index.js");

function definition(id = "github") {
  const found = dockyard.providerHealthDefinitions.find((item) => item.providerId === id);
  assert.ok(found, `missing health definition: ${id}`);
  return found;
}

function payload(def, indicator = "none", overrides = {}) {
  return {
    page: {
      name: def.displayName,
      url: `https://${def.hostname}`,
      updated_at: "2026-09-28T00:00:00.000Z",
    },
    status: {
      indicator,
      description: indicator === "none" ? "All Systems Operational" : "Partial System Outage",
    },
    components: [
      { status: "operational" },
      { status: indicator === "none" ? "operational" : "degraded_performance" },
    ],
    incidents: indicator === "none" ? [] : [{ status: "investigating", impact: "major" }],
    ...overrides,
  };
}

test("P18 pins the four official provider status summary endpoints", () => {
  assert.deepEqual(dockyard.providerHealthDefinitions.map((item) => [item.providerId, item.endpoint]), [
    ["github", "https://www.githubstatus.com/api/v2/summary.json"],
    ["vercel", "https://www.vercel-status.com/api/v2/summary.json"],
    ["cloudflare", "https://www.cloudflarestatus.com/api/v2/summary.json"],
    ["supabase", "https://status.supabase.com/api/v2/summary.json"],
  ]);
});

test("Statuspage indicators map to explicit healthy, degraded, and outage states", () => {
  const def = definition();
  assert.equal(dockyard.providerHealthFromSummary(def, payload(def, "none")).health, "healthy");
  assert.equal(dockyard.providerHealthFromSummary(def, payload(def, "minor")).health, "degraded");
  assert.equal(dockyard.providerHealthFromSummary(def, payload(def, "major")).health, "outage");
  assert.equal(dockyard.providerHealthFromSummary(def, payload(def, "critical")).health, "outage");
});

test("Provider health preserves unresolved incident and affected component evidence", () => {
  const def = definition("cloudflare");
  const result = dockyard.providerHealthFromSummary(def, payload(def, "minor", {
    components: [
      { status: "operational" },
      { status: "degraded_performance" },
      { status: "partial_outage" },
      { status: "major_outage" },
    ],
    incidents: [
      { status: "investigating", impact: "minor" },
      { status: "monitoring", impact: "major" },
      { status: "resolved", impact: "major" },
    ],
  }), new Date("2026-09-28T00:10:00Z"));
  assert.equal(result.health, "degraded");
  assert.equal(result.unresolvedIncidentCount, 2);
  assert.equal(result.affectedComponentCount, 3);
  assert.equal(result.sourceUpdatedAt, "2026-09-28T00:00:00.000Z");
  assert.equal(result.checkedAt, "2026-09-28T00:10:00.000Z");
});

test("Provider health rejects malformed indicators and mismatched status-page provenance", () => {
  const def = definition("vercel");
  const unknown = dockyard.providerHealthFromSummary(def, payload(def, "mystery"));
  assert.equal(unknown.health, "invalid");
  assert.match(unknown.error, /indicator/i);

  const wrongHost = dockyard.providerHealthFromSummary(def, payload(def, "none", {
    page: { name: "Vercel", url: "https://example.com", updated_at: "2026-09-28T00:00:00Z" },
  }));
  assert.equal(wrongHost.health, "invalid");
  assert.match(wrongHost.error, /pinned provider status host/i);
});

test("Live checker refuses redirects, identifies DockyardOS, and bounds output", async () => {
  const def = definition("supabase");
  let captured;
  const result = await dockyard.checkProviderHealth(def, {
    now: new Date("2026-09-28T00:15:00Z"),
    fetchImpl: async (url, init) => {
      captured = { url, init };
      return new Response(JSON.stringify(payload(def, "none")), {
        status: 200,
        headers: { "content-type": "application/json", "content-length": "500" },
      });
    },
  });
  assert.equal(result.health, "healthy");
  assert.equal(captured.url, def.endpoint);
  assert.equal(captured.init.method, "GET");
  assert.equal(captured.init.redirect, "error");
  assert.equal(captured.init.cache, "no-store");
  assert.match(captured.init.headers["User-Agent"], /^DockyardOS\//);
});

test("Oversized and unavailable official status responses fail closed as unavailable", async () => {
  const def = definition("github");
  const oversized = await dockyard.checkProviderHealth(def, {
    fetchImpl: async () => new Response("{}", { status: 200, headers: { "content-length": String(600 * 1024) } }),
  });
  assert.equal(oversized.health, "unavailable");
  assert.match(oversized.error, /512 KiB/i);

  const failed = await dockyard.checkProviderHealth(def, {
    fetchImpl: async () => { throw new Error("network unavailable"); },
  });
  assert.equal(failed.health, "unavailable");
  assert.match(failed.error, /network unavailable/i);
});

test("Provider health selection rejects unknown providers and preserves requested order", async () => {
  const mockFetch = async (url) => {
    const def = dockyard.providerHealthDefinitions.find((item) => item.endpoint === url);
    return new Response(JSON.stringify(payload(def, "none")), { status: 200 });
  };
  const selected = await dockyard.checkProviderHealthSet({ ids: ["supabase", "github", "supabase"], fetchImpl: mockFetch });
  assert.deepEqual(selected.map((item) => item.providerId), ["supabase", "github"]);
  await assert.rejects(() => dockyard.checkProviderHealthSet({ ids: ["unknown"], fetchImpl: mockFetch }), /not configured/i);
});

test("Provider health exit codes distinguish service trouble from unverifiable status", () => {
  const healthy = { health: "healthy" };
  const degraded = { health: "degraded" };
  const outage = { health: "outage" };
  const unavailable = { health: "unavailable" };
  const invalid = { health: "invalid" };
  assert.equal(dockyard.providerHealthExitCode([healthy]), 0);
  assert.equal(dockyard.providerHealthExitCode([healthy, degraded]), 1);
  assert.equal(dockyard.providerHealthExitCode([outage]), 1);
  assert.equal(dockyard.providerHealthExitCode([outage, unavailable]), 2);
  assert.equal(dockyard.providerHealthExitCode([invalid]), 2);
});

test("CLI routing exposes provider health without approval or mutation flags", async () => {
  const main = await readFile("src/main.ts", "utf8");
  const command = await readFile("src/provider-command.ts", "utf8");
  assert.match(main, /args\[0\] === "health"/);
  assert.match(command, /checkProviderHealthSet/);
  const healthBlock = command.slice(command.indexOf('if (subcommand === "health")'), command.indexOf('if (subcommand === "actions")'));
  assert.doesNotMatch(healthBlock, /--approve/);
  assert.doesNotMatch(healthBlock, /executeProviderAction/);
});
