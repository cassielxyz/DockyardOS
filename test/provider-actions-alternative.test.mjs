import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const dockyard = await import("../dist/index.js");

async function root() {
  return mkdtemp(join(tmpdir(), "dockyard-p21-provider-actions-"));
}

function plan(workspace, providerId, actionId, environment, params = {}) {
  return dockyard.planRoutedProviderAction(workspace, { providerId, actionId, environment, params });
}

function providerArgs(result, command, npmPackage) {
  if (result.command === command) return result.args;
  assert.equal(result.command, "npx");
  assert.deepEqual(result.args.slice(0, 2), ["-y", npmPackage]);
  return result.args.slice(2);
}

function verificationArgs(result, command, npmPackage) {
  if (result.verification.command === command) return result.verification.args;
  assert.equal(result.verification.command, "npx");
  assert.deepEqual(result.verification.args.slice(0, 2), ["-y", npmPackage]);
  return result.verification.args.slice(2);
}

test("provider action router exposes primary and alternative actions", async () => {
  const firebase = dockyard.listRoutedProviderActions("firebase");
  assert.ok(firebase.some((item) => item.id === "hosting-preview-deploy"));
  assert.ok(firebase.some((item) => item.id === "hosting-production-deploy"));
  assert.ok(firebase.every((item) => item.requiresAuthenticated === true));

  const vercel = dockyard.listRoutedProviderActions("vercel");
  assert.ok(vercel.some((item) => item.id === "preview-deploy"));
});

test("Neon preview branch plan is explicit, non-production, and strips secret output", async () => {
  const workspace = await root();
  const result = plan(workspace, "neon", "preview-branch-create", "preview", {
    project: "quiet-snow-1234",
    branch: "preview/pr-42",
  });
  assert.deepEqual(providerArgs(result, "neon", "neon@latest"), [
    "branches", "create",
    "--project-id", "quiet-snow-1234",
    "--name", "preview/pr-42",
    "--output", "json",
    "--no-secrets",
  ]);
  assert.equal(result.productionApprovalRequired, false);
  assert.deepEqual(verificationArgs(result, "neon", "neon@latest"), ["branches", "list", "--project-id", "quiet-snow-1234", "--output", "json"]);

  assert.throws(
    () => plan(workspace, "neon", "preview-branch-create", "production", { project: "quiet-snow-1234", branch: "release" }),
    /does not support production/i,
  );
  assert.throws(
    () => plan(workspace, "neon", "preview-branch-create", "preview", { project: "quiet-snow-1234", branch: "production" }),
    /refuses a common production/i,
  );
  assert.throws(
    () => plan(workspace, "neon", "preview-branch-create", "preview", { project: "quiet-snow-1234", branch: "preview/pr-42", parent: "main" }),
    /unknown parameter/i,
  );
});

test("Firebase preview and production Hosting plans pin an explicit project", async () => {
  const workspace = await root();
  const preview = plan(workspace, "firebase", "hosting-preview-deploy", "preview", {
    project: "dockyard-preview",
    channel: "pr-42",
    target: "web",
  });
  assert.deepEqual(providerArgs(preview, "firebase", "firebase-tools@latest"), [
    "hosting:channel:deploy", "pr-42",
    "--project", "dockyard-preview",
    "--json",
    "--only", "web",
  ]);
  assert.equal(preview.productionApprovalRequired, false);

  const production = plan(workspace, "firebase", "hosting-production-deploy", "production", {
    project: "dockyard-prod",
    target: "web",
  });
  assert.deepEqual(providerArgs(production, "firebase", "firebase-tools@latest"), ["deploy", "--project", "dockyard-prod", "--only", "hosting:web", "--json"]);
  assert.equal(production.productionApprovalRequired, true);

  assert.throws(
    () => plan(workspace, "firebase", "hosting-preview-deploy", "preview", { project: "dockyard-preview", channel: "live" }),
    /refuses a common production/i,
  );
});

test("Railway deploy plan confines source path and uses one explicit target", async () => {
  const workspace = await root();
  const result = plan(workspace, "railway", "service-deploy", "preview", {
    project: "abc123",
    "railway-environment": "preview",
    service: "web",
    path: "apps/web",
  });
  assert.deepEqual(providerArgs(result, "railway", "@railway/cli@latest"), [
    "up", "apps/web",
    "--project", "abc123",
    "--environment", "preview",
    "--service", "web",
    "--ci", "--json",
  ]);
  assert.deepEqual(verificationArgs(result, "railway", "@railway/cli@latest"), [
    "logs",
    "--project", "abc123",
    "--environment", "preview",
    "--service", "web",
    "--lines", "1",
  ]);
  assert.equal(result.productionApprovalRequired, false);

  assert.throws(
    () => plan(workspace, "railway", "service-deploy", "preview", { project: "abc123", "railway-environment": "production", service: "web" }),
    /refuses a common production/i,
  );
  assert.throws(
    () => plan(workspace, "railway", "service-deploy", "preview", { project: "abc123", "railway-environment": "preview" }),
    /missing required.*service/i,
  );
  assert.throws(
    () => plan(workspace, "railway", "service-deploy", "preview", { project: "abc123", "railway-environment": "preview", service: "web", path: "../outside" }),
    /inside the current project root/i,
  );
});

test("Render plan requires an explicit service and full commit SHA", async () => {
  const workspace = await root();
  const commit = "a".repeat(40);
  const result = plan(workspace, "render", "service-deploy", "preview", {
    service: "srv-cafe123",
    commit,
  });
  assert.deepEqual(result.args, ["deploys", "create", "srv-cafe123", "--wait", "--output", "json", "--confirm", "--commit", commit]);
  assert.deepEqual(result.verification.args, ["deploys", "list", "srv-cafe123", "--output", "json"]);
  assert.throws(
    () => plan(workspace, "render", "service-deploy", "preview", { service: "srv-cafe123", commit: "abc123" }),
    /40-character/i,
  );
});

test("Appwrite function deploy is linked-project scoped and single-function only", async () => {
  const workspace = await root();
  const result = plan(workspace, "appwrite", "function-deploy", "preview", {
    "function-id": "function_123",
  });
  assert.equal(result.requiresLinked, true);
  assert.deepEqual(providerArgs(result, "appwrite", "appwrite-cli@latest"), ["push", "functions", "--function-id", "function_123", "--force", "--json"]);
  assert.deepEqual(verificationArgs(result, "appwrite", "appwrite-cli@latest"), ["functions", "list", "--json"]);
});

test("alternative provider mutation approval fails closed before provider tooling", async () => {
  const workspace = await root();
  const preview = plan(workspace, "firebase", "hosting-preview-deploy", "preview", {
    project: "dockyard-preview",
    channel: "pr-42",
  });
  await assert.rejects(
    () => dockyard.executeRoutedProviderAction(workspace, preview, { approve: false }),
    /requires explicit --approve/i,
  );

  const production = plan(workspace, "render", "service-deploy", "production", { service: "srv-cafe123" });
  await assert.rejects(
    () => dockyard.executeRoutedProviderAction(workspace, production, { approve: true, approveProduction: false }),
    /requires explicit --approve-production/i,
  );
});

test("alternative action plans never accept credential or arbitrary secret parameters", async () => {
  const workspace = await root();
  assert.throws(
    () => plan(workspace, "firebase", "hosting-preview-deploy", "preview", {
      project: "dockyard-preview",
      channel: "pr-42",
      token: "secret",
    }),
    /unknown parameter/i,
  );
  assert.throws(
    () => plan(workspace, "render", "service-deploy", "preview", {
      service: "srv-cafe123",
      deployHook: "https://example.invalid/secret",
    }),
    /unknown parameter/i,
  );
});
