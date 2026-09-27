import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

const dockyard = await import("../dist/index.js");

async function setupSarif() {
  const home = await mkdtemp(join(tmpdir(), "dockyard-sarif-hardening-home-"));
  const root = await mkdtemp(join(tmpdir(), "dockyard-sarif-hardening-root-"));
  process.env.DOCKYARD_HOME = home;
  const runId = "20260928T010000-sarif-hardening-test";
  const artifactDirectory = join(dockyard.projectDirectory(dockyard.projectIdForRoot(root)), "security", "runs", runId);
  await mkdir(artifactDirectory, { recursive: true });
  const sarifPath = join(artifactDirectory, "dockyard.sarif");
  const sarif = {
    version: "2.1.0",
    runs: [{
      tool: { driver: { name: "DockyardOS", rules: [] } },
      invocations: [{ properties: { dockyardRunId: runId } }],
      results: [],
    }],
  };
  await writeFile(sarifPath, `${JSON.stringify(sarif)}\n`, "utf8");
  return { root, sarifPath };
}

function target(sarifPath) {
  return {
    sarifPath,
    repository: "cassielxyz/DockyardOS",
    commitSha: "a".repeat(40),
    ref: "refs/heads/main",
  };
}

test("SARIF upload rejects symlink artifacts before hashing or upload", async () => {
  const { root, sarifPath } = await setupSarif();
  const backing = join(dirname(sarifPath), "backing.sarif");
  await writeFile(backing, await readFile(sarifPath));
  await rm(sarifPath);
  await symlink(backing, sarifPath);
  await assert.rejects(
    () => dockyard.planSecuritySarifUpload(root, target(sarifPath)),
    /regular non-symlink file/i,
  );
});

test("GitHub SARIF upload IDs are bounded and path-safe before verification reuse", async () => {
  const documentedStyle = "47177e22-5596-11eb-80a1-c1e54ef945c6";
  assert.equal(dockyard.validateGitHubSarifUploadId(documentedStyle), documentedStyle);
  assert.equal(dockyard.validateGitHubSarifUploadId("abc_123.DEF-456"), "abc_123.DEF-456");
  assert.equal(dockyard.validateGitHubSarifUploadId("../escape"), undefined);
  assert.equal(dockyard.validateGitHubSarifUploadId("id/child"), undefined);
  assert.equal(dockyard.validateGitHubSarifUploadId(" id"), undefined);
  assert.equal(dockyard.validateGitHubSarifUploadId("a".repeat(129)), undefined);
  assert.equal(dockyard.validateGitHubSarifUploadId(123), undefined);

  const source = await readFile("src/security-sarif-upload.ts", "utf8");
  assert.match(source, /validateGitHubSarifUploadId\(uploadResponse\?\.id\)/);
  assert.match(source, /encodeURIComponent\(sarifId\)/);
});
