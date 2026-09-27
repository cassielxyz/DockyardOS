import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const dockyard = await import("../dist/index.js");

async function projectRoot() {
  return mkdtemp(join(tmpdir(), "dockyard-preview-plan-"));
}

test("preview planner composes Supabase before Vercel so dependencies provision first", async () => {
  const root = await projectRoot();
  const plan = dockyard.planPreviewEnvironment(root, {
    web: "vercel",
    database: "supabase",
    params: {
      "vercel.prebuilt": "true",
      "supabase.project-ref": "abcdefghijklmnopqrst",
      "supabase.branch": "feature-login",
    },
  });
  assert.equal(plan.environment, "preview");
  assert.equal(plan.approvalRequired, true);
  assert.deepEqual(plan.steps.map((step) => `${step.providerId}/${step.actionId}`), [
    "supabase/preview-branch-create",
    "vercel/preview-deploy",
  ]);
  assert.ok(plan.steps.every((step) => step.productionApprovalRequired === false));
});

test("preview planner can compose Cloudflare Pages plus GitHub workflow with scoped params", async () => {
  const root = await projectRoot();
  const plan = dockyard.planPreviewEnvironment(root, {
    web: "cloudflare-pages",
    workflow: "github",
    params: {
      "cloudflare.directory": "dist",
      "cloudflare.project": "docs-site",
      "cloudflare.branch": "feature-docs",
      "github.workflow": "preview.yml",
      "github.ref": "feature/docs",
    },
  });
  assert.deepEqual(plan.steps[0].args, ["pages", "deploy", "dist", "--project-name", "docs-site", "--branch", "feature-docs"]);
  assert.deepEqual(plan.steps[1].args, ["workflow", "run", "preview.yml", "--ref", "feature/docs"]);
});

test("preview planner rejects unscoped parameters and unsupported production values", async () => {
  const root = await projectRoot();
  assert.throws(() => dockyard.planPreviewEnvironment(root, {
    web: "vercel",
    params: { prebuilt: "true" },
  }), /namespaces/);
  assert.throws(() => dockyard.planPreviewEnvironment(root, {
    web: "cloudflare-pages",
    params: {
      "cloudflare.directory": "dist",
      "cloudflare.project": "docs-site",
      "cloudflare.branch": "main",
    },
  }), /production branch/);
});

test("preview execution requires explicit approval before any provider mutation", async () => {
  const root = await projectRoot();
  const plan = dockyard.planPreviewEnvironment(root, { web: "vercel" });
  await assert.rejects(() => dockyard.executePreviewEnvironment(root, plan, {}), /--approve/);
});

test("preview planner refuses an empty environment", async () => {
  const root = await projectRoot();
  assert.throws(() => dockyard.planPreviewEnvironment(root, {}), /at least one/);
});
