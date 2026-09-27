import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const dockyard = await import("../dist/index.js");

async function setupSarif() {
  const home = await mkdtemp(join(tmpdir(), "dockyard-sarif-upload-home-"));
  const root = await mkdtemp(join(tmpdir(), "dockyard-sarif-upload-root-"));
  process.env.DOCKYARD_HOME = home;
  const runId = "20260928T001500-sarif-upload-test";
  const artifactDirectory = join(dockyard.projectDirectory(dockyard.projectIdForRoot(root)), "security", "runs", runId);
  await mkdir(artifactDirectory, { recursive: true });
  const sarifPath = join(artifactDirectory, "dockyard.sarif");
  const sarif = {
    version: "2.1.0",
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    runs: [{
      tool: { driver: { name: "DockyardOS", rules: [] } },
      invocations: [{
        executionSuccessful: true,
        properties: {
          dockyardRunId: runId,
          dockyardRunStatus: "clean",
          dockyardPolicyGate: "pass",
          rawFindingCount: 0,
          acceptedFindingCount: 0,
          blockingFindingCount: 0,
        },
      }],
      results: [],
    }],
  };
  await writeFile(sarifPath, `${JSON.stringify(sarif, null, 2)}\n`, "utf8");
  return { root, runId, sarifPath };
}

function target(sarifPath) {
  return {
    sarifPath,
    repository: "cassielxyz/DockyardOS",
    commitSha: "a".repeat(40),
    ref: "refs/heads/main",
  };
}

test("SARIF upload plan binds the exact DockyardOS artifact and target", async () => {
  const { root, runId, sarifPath } = await setupSarif();
  const plan = await dockyard.planSecuritySarifUpload(root, target(sarifPath));
  assert.equal(plan.provider, "github");
  assert.equal(plan.runId, runId);
  assert.equal(plan.repository, "cassielxyz/DockyardOS");
  assert.equal(plan.commitSha, "a".repeat(40));
  assert.equal(plan.ref, "refs/heads/main");
  assert.equal(plan.mutating, true);
  assert.equal(plan.approvalRequired, true);
  assert.equal(plan.expectedSha256Required, true);
  assert.match(plan.sarifSha256, /^[a-f0-9]{64}$/);
  assert.ok(plan.rawBytes > 0);
  assert.ok(plan.gzipBytes > 0);
  assert.equal(plan.endpoint, "/repos/cassielxyz/DockyardOS/code-scanning/sarifs");
});

test("SARIF upload refuses artifacts outside the current project run layout", async () => {
  const { root, sarifPath } = await setupSarif();
  const outside = join(root, "dockyard.sarif");
  await writeFile(outside, await readFile(sarifPath));
  await assert.rejects(
    () => dockyard.planSecuritySarifUpload(root, target(outside)),
    /inside this project's DockyardOS security run directory/i,
  );
});

test("SARIF upload refuses forged run identity even inside a run directory", async () => {
  const { root, sarifPath } = await setupSarif();
  const parsed = JSON.parse(await readFile(sarifPath, "utf8"));
  parsed.runs[0].invocations[0].properties.dockyardRunId = "different-run";
  await writeFile(sarifPath, `${JSON.stringify(parsed)}\n`, "utf8");
  await assert.rejects(
    () => dockyard.planSecuritySarifUpload(root, target(sarifPath)),
    /run identity does not match/i,
  );
});

test("SARIF upload requires explicit approval before checking external tooling", async () => {
  const { root, sarifPath } = await setupSarif();
  const plan = await dockyard.planSecuritySarifUpload(root, target(sarifPath));
  await assert.rejects(
    () => dockyard.uploadSecuritySarif(root, target(sarifPath), { approve: false, expectedSha256: plan.sarifSha256 }),
    /requires explicit --approve/i,
  );
});

test("SARIF upload rejects stale reviewed digest before invoking GitHub", async () => {
  const { root, sarifPath } = await setupSarif();
  const plan = await dockyard.planSecuritySarifUpload(root, target(sarifPath));
  await writeFile(sarifPath, `${await readFile(sarifPath, "utf8")}\n`, "utf8");
  await assert.rejects(
    () => dockyard.uploadSecuritySarif(root, target(sarifPath), { approve: true, expectedSha256: plan.sarifSha256 }),
    /changed after review/i,
  );
});

test("SARIF upload validates explicit GitHub repository, commit, and ref", async () => {
  const { root, sarifPath } = await setupSarif();
  await assert.rejects(
    () => dockyard.planSecuritySarifUpload(root, { ...target(sarifPath), repository: "https://github.com/cassielxyz/DockyardOS" }),
    /OWNER\/REPO/i,
  );
  await assert.rejects(
    () => dockyard.planSecuritySarifUpload(root, { ...target(sarifPath), commitSha: "abc123" }),
    /40-character/i,
  );
  await assert.rejects(
    () => dockyard.planSecuritySarifUpload(root, { ...target(sarifPath), ref: "main" }),
    /refs\/heads/i,
  );
  const prPlan = await dockyard.planSecuritySarifUpload(root, { ...target(sarifPath), ref: "refs/pull/20/head" });
  assert.equal(prPlan.ref, "refs/pull/20/head");
});

test("SARIF uploader source uses an ephemeral request file and never accepts token arguments", async () => {
  const source = await readFile("src/security-sarif-upload.ts", "utf8");
  assert.match(source, /--input/);
  assert.match(source, /mode: 0o600/);
  assert.match(source, /await rm\(requestPath/);
  assert.doesNotMatch(source, /--token/);
  assert.doesNotMatch(source, /GITHUB_TOKEN/);
});
