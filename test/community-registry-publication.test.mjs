import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readFileSync, symlink, writeFile } from "node:fs";
import { mkdtemp as mkdtempAsync, mkdir as mkdirAsync, readFile as readFileAsync, symlink as symlinkAsync, writeFile as writeFileAsync } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const dockyard = await import("../dist/index.js");

function processResult(ok, stdout = "", stderr = "", status = ok ? 0 : 1) {
  return { ok, stdout, stderr, status, timedOut: false };
}

function ghMock(initialBytes) {
  let current = initialBytes ? Buffer.from(initialBytes) : undefined;
  let blobSha = "a".repeat(40);
  let puts = 0;
  const calls = [];
  const exec = (args) => {
    calls.push(args);
    const methodIndex = args.indexOf("--method");
    const method = methodIndex >= 0 ? args[methodIndex + 1] : "GET";
    const endpoint = args.find((arg) => arg.startsWith("/repos/")) ?? "";
    if (method === "GET" && endpoint.includes("/branches/")) {
      return processResult(true, JSON.stringify({ name: "registry" }));
    }
    if (method === "GET" && endpoint.includes("/contents/")) {
      if (!current) return processResult(false, "", "gh: Not Found (HTTP 404)", 1);
      return processResult(true, JSON.stringify({
        type: "file",
        encoding: "base64",
        content: current.toString("base64"),
        size: current.length,
        sha: blobSha,
      }));
    }
    if (method === "PUT" && endpoint.includes("/contents/")) {
      const inputIndex = args.indexOf("--input");
      assert.ok(inputIndex >= 0);
      const request = JSON.parse(readFileSync(args[inputIndex + 1], "utf8"));
      current = Buffer.from(request.content, "base64");
      blobSha = "b".repeat(40);
      puts += 1;
      return processResult(true, JSON.stringify({ content: { sha: blobSha }, commit: { sha: "c".repeat(40) } }));
    }
    return processResult(false, "", `unexpected gh call: ${args.join(" ")}`, 1);
  };
  return { exec, calls, get puts() { return puts; }, get current() { return current; } };
}

async function fixture() {
  const home = await mkdtempAsync(join(tmpdir(), "dockyard-p19-home-"));
  const root = await mkdtempAsync(join(tmpdir(), "dockyard-p19-root-"));
  process.env.DOCKYARD_HOME = home;
  await mkdirAsync(join(root, "registry", "remote-publications"), { recursive: true });
  await writeFileAsync(join(root, "package.json"), `${JSON.stringify({ name: "dockyardos" })}\n`);
  const indexPath = join(root, "registry", "remote-publications", "reviewed-index.json");
  const index = {
    schemaVersion: 1,
    updatedAt: "2026-09-28T00:00:00.000Z",
    packages: [],
    discoverySources: [],
  };
  await writeFileAsync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
  const info = await dockyard.createSigningKey("registry", "dockyard-community", "dockyard-community-key-1");
  const trustStorePath = join(root, "registry", "registry-keys.json");
  await writeFileAsync(trustStorePath, `${JSON.stringify({
    schemaVersion: 1,
    updatedAt: "2026-09-28T00:00:00.000Z",
    keys: [dockyard.remoteRegistryTrustKeySnippet(info)],
  }, null, 2)}\n`);
  const input = {
    indexPath,
    registryId: "dockyard-community",
    keyId: "dockyard-community-key-1",
    sequence: 7,
    expiresAt: "2026-10-05T00:00:00.000Z",
    repository: "cassielxyz/registry-test",
    targetPath: "registry/community.json",
    branch: "registry",
    reviewedBy: "maintainer-1",
    rationale: "Reviewed publication fixture for deterministic P19 regression coverage.",
    reviewedAt: "2026-09-28T00:00:00.000Z",
  };
  return { home, root, indexPath, trustStorePath, input };
}

test("P19 plan is read-only and binds target, remote state, review, key, sequence, and index", async () => {
  const { root, trustStorePath, input } = await fixture();
  const gh = ghMock();
  const plan = await dockyard.planRegistryPublication(root, input, { ghExec: gh.exec, trustStorePath });
  assert.equal(plan.operation, "registry-envelope-publish");
  assert.equal(plan.remote.exists, false);
  assert.equal(plan.target.repository, input.repository);
  assert.equal(plan.target.path, input.targetPath);
  assert.equal(plan.target.branch, input.branch);
  assert.match(plan.approvalSha256, /^[0-9a-f]{64}$/);
  assert.equal(gh.puts, 0);
});

test("P19 publication requires explicit approval and exact reviewed plan binding", async () => {
  const { root, trustStorePath, input } = await fixture();
  const gh = ghMock();
  const plan = await dockyard.planRegistryPublication(root, input, { ghExec: gh.exec, trustStorePath });

  await assert.rejects(
    () => dockyard.publishRegistryEnvelope(root, input, {
      approvePublication: false,
      expectedPlanSha256: plan.approvalSha256,
      ghExec: gh.exec,
      trustStorePath,
    }),
    /approve-publication/i,
  );
  assert.equal(gh.puts, 0);

  await assert.rejects(
    () => dockyard.publishRegistryEnvelope(root, { ...input, targetPath: "registry/other.json" }, {
      approvePublication: true,
      expectedPlanSha256: plan.approvalSha256,
      ghExec: gh.exec,
      trustStorePath,
    }),
    /plan changed after review/i,
  );
  assert.equal(gh.puts, 0);
});

test("P19 signs with the local key, publishes once, and verifies exact remote bytes", async () => {
  const { root, trustStorePath, input } = await fixture();
  const gh = ghMock();
  const plan = await dockyard.planRegistryPublication(root, input, { ghExec: gh.exec, trustStorePath });
  const result = await dockyard.publishRegistryEnvelope(root, input, {
    approvePublication: true,
    expectedPlanSha256: plan.approvalSha256,
    ghExec: gh.exec,
    trustStorePath,
  });
  assert.equal(result.status, "complete");
  assert.equal(result.sequence, input.sequence);
  assert.equal(result.blobSha, "b".repeat(40));
  assert.equal(result.commitSha, "c".repeat(40));
  assert.equal(gh.puts, 1);
  assert.ok(gh.current);
  const published = JSON.parse(gh.current.toString("utf8"));
  assert.equal(published.registryId, input.registryId);
  assert.equal(published.sequence, input.sequence);
  assert.equal(published.signature.keyId, input.keyId);
  assert.ok(published.signature.value.length > 20);
  assert.ok((await readFileAsync(result.envelopePath, "utf8")).includes(published.signature.value));
  const audit = JSON.parse(await readFileAsync(result.auditPath, "utf8"));
  assert.equal(audit.status, "complete");
  assert.equal(audit.approvalSha256, plan.approvalSha256);
});

test("P19 refuses sequence rollback or replay before signing/publication", async () => {
  const { root, trustStorePath, input } = await fixture();
  const existing = Buffer.from(`${JSON.stringify({
    schemaVersion: 1,
    registryId: input.registryId,
    issuedAt: "2026-09-20T00:00:00.000Z",
    expiresAt: "2026-10-01T00:00:00.000Z",
    sequence: 7,
    index: { schemaVersion: 1, updatedAt: "2026-09-20T00:00:00.000Z", packages: [], discoverySources: [] },
    signature: { algorithm: "ed25519", keyId: input.keyId, value: "historical" },
  }, null, 2)}\n`);
  const gh = ghMock(existing);
  await assert.rejects(
    () => dockyard.planRegistryPublication(root, input, { ghExec: gh.exec, trustStorePath }),
    /must advance the remote sequence/i,
  );
  assert.equal(gh.puts, 0);
});

test("P19 rejects symlinked review indexes", async (t) => {
  if (process.platform === "win32") {
    t.skip("symlink creation may require elevated privileges on Windows");
    return;
  }
  const { root, indexPath, trustStorePath, input } = await fixture();
  const backing = join(root, "registry", "remote-publications", "backing.json");
  await writeFileAsync(backing, await readFileAsync(indexPath));
  await import("node:fs/promises").then(({ rm }) => rm(indexPath));
  await symlinkAsync(backing, indexPath);
  const gh = ghMock();
  await assert.rejects(
    () => dockyard.planRegistryPublication(root, input, { ghExec: gh.exec, trustStorePath }),
    /regular non-symlink review file/i,
  );
  assert.equal(gh.puts, 0);
});
