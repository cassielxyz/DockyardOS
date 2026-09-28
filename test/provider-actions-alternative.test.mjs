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
  return dockyard.planProviderAction(workspace, { providerId, actionId, environment, params });
}

test("provider action router exposes primary and alternative actions", async () => {
  const firebase = dockyard.listProviderActions("firebase");
  assert.ok(firebase.some((item) => item.id === "hosting-preview-deploy"));
  assert.ok(firebase.some((item) => item.id === "hosting-production-deploy"));
  assert.ok(firebase.every((item) => item.requiresAuthenticated === true));

  const vercel = dockyard.listProviderActions("vercel");
  assert.ok(vercel.some((item) => item.id === "preview-deploy"));
});

test("Neon preview branch plan is explicit, non-production, and verified", async () => {
  const workspace = await root();
  const result = plan(workspace, "neon", "preview-branch-create", "preview", {
    project: "quiet-snow-1234",
    branch: "preview/pr-42",
    parent: "main",
  });
  assert.equal(result.command, "neon");
  assert.deepEqual(result.args, [
    "branches", "create",
    "--project-id", "quiet-snow-1234",
    "--name", "preview/pr-42",
    "--parent", "main",
    "--output", "json",
  ]);
  assert.equal(result.productionApprovalRequired, false);
  assert.deepEqual(result.verification.args, ["branches", "list", "--project-id", "quiet-snow-1234", "--output", "json"]);

  assert.throws(
    () => plan(workspace, "neon", "preview-branch-create", "production", { project: "quiet-snow-1234", branch: "release" }),
    /does not support production/i,
  );
  assert.throws(
    () => plan(workspace, "neon", "preview-branch-create", "preview", { project: "quiet-snow-1234", branch: "production" }),
    /refuses a common production/i,
  );
});

test("Firebase preview and production Hosting plans pin an explicit project", async () => {
  const workspace = await root();
  const preview = plan(workspace, "firebase", "hosting-preview-deploy", "preview", {
    project: "dockyard-preview",
    channel: "pr-42",
    target: "web",
  });
  assert.deepEqual(preview.args, [
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
  assert.deepEqual(production.args, ["deploy", "--project", "dockyard-prod", "--only", "hosting:web", "--json"]);
  assert.equal(production.productionApprovalRequired, true);

  assert.throws(
    () => plan(workspace, "firebase", "hosting-preview-deploy", "preview", { project: "dockyard-preview", channel: "live" }),
    /refuses a common production/i,
  );
});

test("Railway deploy plan confines source path and protects preview environments", async () => {
  const workspace = await root();
  const result = plan(workspace, "railway", "service-deploy", "preview", {
    project: "abc123",
    "railway-environment": "preview",
    service: "web",
    path: "apps/web",
  });
  assert.deepEqual(result.args, [
    "up", "apps/web",
    "--project", "abc123",
    "--environment", "preview",
    "--ci", "--json",
    "--service", "web",
  ]);
  assert.equal(result.productionApprovalRequired, false);

  assert.throws(
    () => plan(workspace, "railway", "service-deploy", "preview", { project: "abc123", "railway-environment": "production" }),
    /refuses a common production/i,
  );
  assert.throws(
    () => plan(workspace, "railway", "service-deploy", "preview", { project: "abc123", "railway-environment": "preview", path: "../outside" }),
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
  assert.deepEqual(result.args, ["push", "functions", "--function-id", "function_123", "--force", "--json"]);
  assert.deepEqual(result.verification.args, ["functions", "list", "--json"]);
});

test("alternative provider mutation approval fails closed before provider tooling", async () => {
  const workspace = await root();
  const preview = plan(workspace, "firebase", "hosting-preview-deploy", "preview", {
    project: "dockyard-preview",
    channel: "pr-42",
  });
  await assert.rejects(
    () => dockyard.executeProviderAction(workspace, preview, { approve: false }),
    /requires explicit --approve/i,
  );

  const production = plan(workspace, "render", "service-deploy", "production", { service: "srv-cafe123" });
  await assert.rejects(
    () => dockyard.executeProviderAction(workspace, production, { approve: true, approveProduction: false }),
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
