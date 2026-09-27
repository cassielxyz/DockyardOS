import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const dockyard = await import("../dist/index.js");

async function projectRoot() {
  return mkdtemp(join(tmpdir(), "dockyard-provider-actions-"));
}

test("P9 exposes authenticated actions for the four initial providers", () => {
  const providers = new Set(dockyard.listProviderActions().map((item) => item.providerId));
  for (const id of ["github", "vercel", "cloudflare", "supabase"]) assert.ok(providers.has(id), `missing ${id}`);
});

test("Vercel preview deployment is explicit mutation with post-deploy inspection", async () => {
  const root = await projectRoot();
  const plan = dockyard.planProviderAction(root, {
    providerId: "vercel",
    actionId: "preview-deploy",
    environment: "preview",
    params: { prebuilt: "true" },
  });
  assert.deepEqual(plan.args, ["deploy", "--yes", "--prebuilt"]);
  assert.equal(plan.approvalRequired, true);
  assert.equal(plan.productionApprovalRequired, false);
  assert.equal(plan.verification.strategy, "vercel-deployment-url");
});

test("production provider actions require two explicit approvals", async () => {
  const root = await projectRoot();
  const plan = dockyard.planProviderAction(root, {
    providerId: "vercel",
    actionId: "production-deploy",
    environment: "production",
  });
  assert.throws(() => dockyard.assertProviderActionApproval(plan, {}), /--approve/);
  assert.throws(() => dockyard.assertProviderActionApproval(plan, { approve: true }), /--approve-production/);
  assert.doesNotThrow(() => dockyard.assertProviderActionApproval(plan, { approve: true, approveProduction: true }));
  assert.ok(plan.args.includes("--prod"));
});

test("Cloudflare Pages preview refuses common production branches and path escape", async () => {
  const root = await projectRoot();
  assert.throws(() => dockyard.planProviderAction(root, {
    providerId: "cloudflare",
    actionId: "pages-preview-deploy",
    environment: "preview",
    params: { directory: "dist", project: "site", branch: "main" },
  }), /production branch/);
  assert.throws(() => dockyard.planProviderAction(root, {
    providerId: "cloudflare",
    actionId: "pages-preview-deploy",
    environment: "preview",
    params: { directory: "../outside", project: "site", branch: "feature/test" },
  }), /inside the current project root/);
});

test("Cloudflare Worker preview uploads a version instead of deploying production traffic", async () => {
  const root = await projectRoot();
  const plan = dockyard.planProviderAction(root, {
    providerId: "cloudflare",
    actionId: "worker-preview-upload",
    environment: "preview",
    params: { name: "my-worker", alias: "review-42" },
  });
  assert.deepEqual(plan.args, ["versions", "upload", "--name", "my-worker", "--preview-alias", "review-42"]);
  assert.deepEqual(plan.verification.args, ["versions", "list", "--name", "my-worker", "--json"]);
  assert.equal(plan.args.includes("deploy"), false);
});

test("Supabase preview branch creation never clones data or creates a persistent branch implicitly", async () => {
  const root = await projectRoot();
  const plan = dockyard.planProviderAction(root, {
    providerId: "supabase",
    actionId: "preview-branch-create",
    environment: "preview",
    params: { "project-ref": "abcdefghijklmnopqrst", branch: "feature-login" },
  });
  assert.deepEqual(plan.args, ["branches", "create", "feature-login", "--project-ref", "abcdefghijklmnopqrst"]);
  assert.equal(plan.args.includes("--with-data"), false);
  assert.equal(plan.args.includes("--persistent"), false);
  assert.deepEqual(plan.verification.args, ["branches", "get", "feature-login", "--project-ref", "abcdefghijklmnopqrst"]);
});

test("Supabase function deployment requires an explicit target project and rejects destructive extras", async () => {
  const root = await projectRoot();
  const plan = dockyard.planProviderAction(root, {
    providerId: "supabase",
    actionId: "functions-deploy",
    environment: "preview",
    params: { "project-ref": "abcdefghijklmnopqrst", function: "hello-world", "use-api": "true" },
  });
  assert.deepEqual(plan.args, ["functions", "deploy", "hello-world", "--project-ref", "abcdefghijklmnopqrst", "--use-api"]);
  assert.equal(plan.args.includes("--prune"), false);
  assert.equal(plan.args.includes("--no-verify-jwt"), false);
  assert.throws(() => dockyard.planProviderAction(root, {
    providerId: "supabase",
    actionId: "functions-deploy",
    environment: "preview",
    params: { function: "hello-world" },
  }), /project-ref/);
});

test("GitHub workflow dispatch rejects option/ref injection and does not accept arbitrary workflow fields", async () => {
  const root = await projectRoot();
  const plan = dockyard.planProviderAction(root, {
    providerId: "github",
    actionId: "workflow-dispatch",
    environment: "preview",
    params: { workflow: "preview.yml", ref: "feature/login" },
  });
  assert.deepEqual(plan.args, ["workflow", "run", "preview.yml", "--ref", "feature/login"]);
  assert.throws(() => dockyard.planProviderAction(root, {
    providerId: "github",
    actionId: "workflow-dispatch",
    environment: "preview",
    params: { workflow: "preview.yml", ref: "--repo=evil/repo" },
  }), /unsafe/);
  assert.throws(() => dockyard.planProviderAction(root, {
    providerId: "github",
    actionId: "workflow-dispatch",
    environment: "preview",
    params: { workflow: "preview.yml", ref: "feature/login", token: "secret" },
  }), /Unknown parameter/);
});
