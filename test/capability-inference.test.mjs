import assert from "node:assert/strict";
import test from "node:test";

const dockyard = await import("../dist/index.js");

test("P30 infers practical capability and stack signals from a natural-language build request", () => {
  const task = "Build a Next.js dashboard from Figma using Supabase auth and object storage, Stripe subscriptions, Playwright browser QA, then deploy previews to Vercel.";
  const signals = dockyard.inferSelectionSignals(task);

  for (const capability of [
    "figma",
    "design-context",
    "auth",
    "object-storage",
    "supabase",
    "postgres",
    "payments",
    "billing",
    "browser-automation",
    "e2e",
    "vercel",
    "deployments",
  ]) {
    assert.ok(signals.capabilities.includes(capability), `missing inferred capability ${capability}`);
  }

  for (const stack of ["web", "react", "nextjs", "supabase", "postgres", "vercel"]) {
    assert.ok(signals.stacks.includes(stack), `missing inferred stack ${stack}`);
  }
});

test("P30 default selection merges explicit and inferred signals without duplicates", () => {
  const request = dockyard.defaultSelectionRequest({
    task: "Create a React UI from Figma and test it with Playwright",
    stack: ["React", "custom-runtime"],
    capabilities: ["figma", "custom-capability"],
    host: "antigravity",
  });

  assert.ok(request.stack.includes("react"));
  assert.ok(request.stack.includes("web"));
  assert.ok(request.stack.includes("custom-runtime"));
  assert.equal(request.stack.filter((item) => item === "react").length, 1);

  assert.ok(request.capabilities.includes("figma"));
  assert.ok(request.capabilities.includes("design-context"));
  assert.ok(request.capabilities.includes("browser-automation"));
  assert.ok(request.capabilities.includes("custom-capability"));
  assert.equal(request.capabilities.filter((item) => item === "figma").length, 1);
});

test("P30 inferred signals actually raise the relevant curated connector scores", () => {
  const request = dockyard.defaultSelectionRequest({
    task: "Use Figma design context and Playwright browser QA for this React interface",
    host: "antigravity",
  });
  const recipe = dockyard.chooseRecipe(request);

  const figma = dockyard.scoreCandidate(dockyard.requireCandidate("figma-mcp"), request, recipe);
  const playwright = dockyard.scoreCandidate(dockyard.requireCandidate("playwright-mcp"), request, recipe);
  assert.ok(figma);
  assert.ok(playwright);
  assert.ok(figma.reasons.some((reason) => reason.includes("capabilities") && reason.includes("figma")));
  assert.ok(playwright.reasons.some((reason) => reason.includes("capabilities") && reason.includes("browser-automation")));
});

test("P30 named alternatives can coexist as fallback signals without granting mutation authority", () => {
  const request = dockyard.defaultSelectionRequest({
    task: "Use Supabase for auth and storage, but keep Firebase or Appwrite as fallbacks if it is unavailable.",
    host: "antigravity",
  });
  const result = dockyard.selectCapabilities(request);
  const providers = result.providers.map((provider) => provider.id);

  for (const id of ["supabase", "firebase", "appwrite"]) {
    assert.ok(providers.includes(id), `expected provider fallback ${id}`);
  }
  assert.equal(result.request.maxMcps, 4);
  assert.equal(result.request.maxTools, 6);
  assert.equal(result.request.maxAgents, 7);
  assert.equal(result.request.maxSkills, 8);
});

test("P30 avoids common false-positive provider inference", () => {
  const pdf = dockyard.inferSelectionSignals("Create a 24-page PDF magazine and review every page for layout problems.");
  assert.ok(pdf.capabilities.includes("pdf"));
  assert.equal(pdf.capabilities.includes("cloudflare"), false);
  assert.equal(pdf.stacks.includes("cloudflare"), false);

  const worker = dockyard.inferSelectionSignals("Use a background worker queue to process email jobs.");
  assert.ok(worker.capabilities.includes("background-jobs"));
  assert.equal(worker.capabilities.includes("cloudflare"), false);
});
