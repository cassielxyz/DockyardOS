import assert from "node:assert/strict";
import test from "node:test";

const dockyard = await import("../dist/index.js");

function ids(items) {
  return items.map((item) => item.candidate?.id ?? item.id);
}

test("P30 mega-registry is broad, unique, and structurally valid", () => {
  assert.deepEqual(dockyard.validateCatalog(), []);
  assert.ok(dockyard.catalog.length >= 140, `expected >=140 candidates, got ${dockyard.catalog.length}`);
  assert.ok(dockyard.categoryNames.length >= 35, `expected >=35 categories, got ${dockyard.categoryNames.length}`);
  assert.ok(dockyard.providers.length >= 40, `expected >=40 providers, got ${dockyard.providers.length}`);
  assert.equal(new Set(dockyard.catalog.map((item) => item.id)).size, dockyard.catalog.length);
  assert.equal(new Set(dockyard.providers.map((item) => item.id)).size, dockyard.providers.length);
});

test("P30 exposes expanded official skills, specialist agents, and connector MCPs", () => {
  for (const id of [
    "anthropic-pdf",
    "microsoft-skill-catalog",
    "mongodb-agent-skills",
    "expo-router",
    "github-mcp-server",
    "vercel-mcp-server",
    "supabase-mcp-server",
    "neon-mcp-server",
    "playwright-mcp",
    "figma-mcp",
    "linear-mcp",
    "notion-mcp",
    "atlassian-rovo-mcp",
    "cloudflare-observability-mcp",
  ]) {
    assert.ok(dockyard.getCandidate(id), `expected mega-registry candidate ${id}`);
  }
  assert.ok(dockyard.expandedCatalog.some((item) => item.kind === "agent"), "expected expanded Dockyard specialist agents");
});

test("P30 website-backed remote connectors remain live metadata instead of executable pinned packages", () => {
  for (const id of ["vercel-mcp-server", "supabase-mcp-server", "figma-mcp", "linear-mcp", "notion-mcp", "atlassian-rovo-mcp"]) {
    const candidate = dockyard.getCandidate(id);
    assert.equal(candidate.source.type, "website", `${id} should be website metadata`);
    assert.equal(candidate.source.revisionStrategy, "live-metadata-only", `${id} should not be pin-on-install executable code`);
  }
});

test("P30 selects specialized official document and database capabilities when explicitly relevant", () => {
  const documentRequest = dockyard.defaultSelectionRequest({
    task: "Generate and review a production PDF document",
    capabilities: ["pdf", "pdf-generation"],
    host: "antigravity",
  });
  const documentSelection = dockyard.selectCapabilities(documentRequest);
  assert.ok(ids(documentSelection.skills).includes("anthropic-pdf"));

  const neonRequest = dockyard.defaultSelectionRequest({
    task: "Design and migrate a Neon Postgres database",
    stack: ["neon", "postgres"],
    capabilities: ["schema", "queries", "migrations"],
    host: "antigravity",
  });
  const neonSelection = dockyard.selectCapabilities(neonRequest);
  assert.ok(ids(neonSelection.mcps).includes("neon-mcp-server"));
});

test("P30 exposes practical provider alternatives instead of single-brand dependencies", () => {
  const auth = dockyard.providersFor("auth").map((item) => item.id);
  for (const id of ["supabase", "firebase", "appwrite", "pocketbase", "clerk", "auth0", "workos", "keycloak"]) {
    assert.ok(auth.includes(id), `expected auth provider ${id}`);
  }

  const storage = dockyard.providersFor("object-storage").map((item) => item.id);
  for (const id of ["cloudflare", "supabase", "firebase", "appwrite", "backblaze-b2", "minio", "aws", "azure", "gcp"]) {
    assert.ok(storage.includes(id), `expected storage provider ${id}`);
  }
});

test("P30 capability selection surfaces provider fallbacks from the expanded metadata", () => {
  const request = dockyard.defaultSelectionRequest({
    task: "Build authentication and object storage for a production web app",
    stack: ["web", "nextjs"],
    capabilities: ["auth", "object-storage"],
    host: "antigravity",
  });
  const result = dockyard.selectCapabilities(request);
  const providerIds = result.providers.map((item) => item.id);
  assert.ok(providerIds.includes("supabase"));
  assert.ok(providerIds.includes("clerk"));
  assert.ok(providerIds.includes("backblaze-b2"));
});
