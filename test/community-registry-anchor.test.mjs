import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import test from "node:test";

const dockyard = await import("../dist/index.js");
const { handleCommunityMaintainerCommand } = await import("../dist/community-maintainer-command.js");

function processResult(ok, stdout = "", stderr = "", status = ok ? 0 : 1) {
  return { ok, stdout, stderr, status, timedOut: false };
}

function publicationGhMock() {
  let current;
  let blobSha = "a".repeat(40);
  const exec = (args) => {
    const methodIndex = args.indexOf("--method");
    const method = methodIndex >= 0 ? args[methodIndex + 1] : "GET";
    const endpoint = args.find((arg) => arg.startsWith("/repos/")) ?? "";
    if (method === "GET" && endpoint.includes("/branches/")) return processResult(true, JSON.stringify({ name: "registry" }));
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
      const request = JSON.parse(readFileSync(args[inputIndex + 1], "utf8"));
      current = Buffer.from(request.content, "base64");
      blobSha = "b".repeat(40);
      return processResult(true, JSON.stringify({ content: { sha: blobSha }, commit: { sha: "c".repeat(40) } }));
    }
    return processResult(false, "", `unexpected publication gh call: ${args.join(" ")}`, 1);
  };
  return { exec };
}

function anchorGhMock(options = {}) {
  let current = options.initialBytes ? Buffer.from(options.initialBytes) : undefined;
  let blobSha = "d".repeat(40);
  let puts = 0;
  const calls = [];
  const exec = (args) => {
    calls.push(args);
    const methodIndex = args.indexOf("--method");
    const method = methodIndex >= 0 ? args[methodIndex + 1] : "GET";
    const endpoint = args.find((arg) => arg.startsWith("/repos/")) ?? "";
    if (method === "GET" && !endpoint.includes("/branches/") && !endpoint.includes("/contents/")) {
      return processResult(true, JSON.stringify({
        full_name: "cassielxyz/public-transparency",
        private: options.privateRepo === true,
        archived: false,
        disabled: false,
      }));
    }
    if (method === "GET" && endpoint.includes("/branches/")) return processResult(true, JSON.stringify({ name: "main" }));
    if (method === "GET" && endpoint.includes("/contents/")) {
      if (!current) return processResult(false, "", "gh: Not Found (HTTP 404)", 1);
      return processResult(true, JSON.stringify({
        type: "file",
        encoding: "base64",
        content: options.malformedBase64 ? "%%%bad%%%" : current.toString("base64"),
        size: current.length,
        sha: blobSha,
      }));
    }
    if (method === "PUT" && endpoint.includes("/contents/")) {
      const inputIndex = args.indexOf("--input");
      assert.ok(inputIndex >= 0);
      const request = JSON.parse(readFileSync(args[inputIndex + 1], "utf8"));
      assert.equal("sha" in request, false, "P20 anchors must remain create-only");
      current = Buffer.from(request.content, "base64");
      blobSha = "e".repeat(40);
      puts += 1;
      if (options.omitMutationMetadata) return processResult(true, JSON.stringify({ content: {}, commit: {} }));
      return processResult(true, JSON.stringify({ content: { sha: blobSha }, commit: { sha: "f".repeat(40) } }));
    }
    return processResult(false, "", `unexpected anchor gh call: ${args.join(" ")}`, 1);
  };
  return {
    exec,
    calls,
    get puts() { return puts; },
    get current() { return current; },
    setCurrent(value) { current = value ? Buffer.from(value) : undefined; },
  };
}

async function fixture() {
  const home = await mkdtemp(join(tmpdir(), "dockyard-p20-home-"));
  const root = await mkdtemp(join(tmpdir(), "dockyard-p20-root-"));
  process.env.DOCKYARD_HOME = home;
  await mkdir(join(root, "registry", "remote-publications"), { recursive: true });
  await writeFile(join(root, "package.json"), `${JSON.stringify({ name: "dockyardos" })}\n`);

  const registryId = "dockyard-community";
  const keyId = "dockyard-community-key-1";
  const signing = await dockyard.createSigningKey("registry", registryId, keyId);
  await writeFile(join(root, "registry", "registry-keys.json"), `${JSON.stringify({
    schemaVersion: 1,
    updatedAt: "2026-09-28T00:00:00.000Z",
    keys: [dockyard.remoteRegistryTrustKeySnippet(signing)],
  }, null, 2)}\n`);

  const indexPath = join(root, "registry", "remote-publications", "reviewed-index.json");
  await writeFile(indexPath, `${JSON.stringify({
    schemaVersion: 1,
    updatedAt: "2026-09-28T00:00:00.000Z",
    packages: [],
    discoverySources: [],
  }, null, 2)}\n`);

  const publicationInput = {
    indexPath,
    registryId,
    keyId,
    sequence: 9,
    expiresAt: "2026-10-05T00:00:00.000Z",
    repository: "cassielxyz/registry-publication",
    targetPath: "registry/community.json",
    branch: "registry",
    reviewedBy: "publication-maintainer",
    rationale: "Reviewed P19 publication used as P20 transparency anchor evidence.",
    reviewedAt: "2026-09-28T00:00:00.000Z",
  };
  const publicationGh = publicationGhMock();
  const publicationPlan = await dockyard.planRegistryPublication(root, publicationInput, { ghExec: publicationGh.exec });
  const publication = await dockyard.publishRegistryEnvelope(root, publicationInput, {
    approvePublication: true,
    expectedPlanSha256: publicationPlan.approvalSha256,
    ghExec: publicationGh.exec,
  });
  assert.equal(publication.status, "complete");

  const anchorInput = {
    auditPath: publication.auditPath,
    repository: "cassielxyz/public-transparency",
    branch: "main",
    reviewedBy: "anchor-maintainer",
    rationale: "Reviewed the complete P19 evidence before external public transparency anchoring.",
    reviewedAt: "2026-09-28T01:00:00.000Z",
  };
  return { home, root, publication, publicationInput, anchorInput };
}

test("P20 plan verifies complete P19 evidence and keeps reviewer details out of the public record", async () => {
  const { root, anchorInput } = await fixture();
  const gh = anchorGhMock();
  const plan = await dockyard.planRegistryTransparencyAnchor(root, anchorInput, { ghExec: gh.exec });
  assert.equal(plan.operation, "registry-public-transparency-anchor");
  assert.equal(plan.alreadyAnchored, false);
  assert.equal(plan.target.public, true);
  assert.match(plan.target.path, /^dockyard-transparency\/registry-publications\/dockyard-community\/000000000009-[a-f0-9]{64}\.json$/);
  assert.match(plan.anchorSha256, /^[a-f0-9]{64}$/);
  const publicJson = JSON.stringify(plan.anchorRecord);
  assert.doesNotMatch(publicJson, /anchor-maintainer/);
  assert.doesNotMatch(publicJson, /Reviewed the complete P19 evidence/);
  assert.equal(gh.puts, 0);
});

test("P20 maintainer CLI routes run into the explicit approval guard before mutation", async () => {
  const { root, anchorInput } = await fixture();
  await assert.rejects(
    () => handleCommunityMaintainerCommand(root, [
      "registry-anchor", "run",
      "--audit", anchorInput.auditPath,
      "--repository", anchorInput.repository,
      "--branch", anchorInput.branch,
      "--reviewed-by", anchorInput.reviewedBy,
      "--rationale", anchorInput.rationale,
      "--reviewed-at", anchorInput.reviewedAt,
      "--expected-plan-sha256", "a".repeat(64),
    ]),
    /approve-anchor/i,
  );
});

test("P20 requires a different public repository from the registry publication", async () => {
  const { root, anchorInput, publicationInput } = await fixture();
  const gh = anchorGhMock();
  await assert.rejects(
    () => dockyard.planRegistryTransparencyAnchor(root, { ...anchorInput, repository: publicationInput.repository }, { ghExec: gh.exec }),
    /must differ from the registry publication repository/i,
  );
  assert.equal(gh.puts, 0);
});

test("P20 rejects a private transparency repository", async () => {
  const { root, anchorInput } = await fixture();
  const gh = anchorGhMock({ privateRepo: true });
  await assert.rejects(
    () => dockyard.planRegistryTransparencyAnchor(root, anchorInput, { ghExec: gh.exec }),
    /must be publicly readable/i,
  );
  assert.equal(gh.puts, 0);
});

test("P20 refuses a P19 publication that is not complete", async () => {
  const { root, anchorInput, publication } = await fixture();
  const audit = JSON.parse(await readFile(publication.auditPath, "utf8"));
  audit.status = "published-unverified";
  await writeFile(publication.auditPath, `${JSON.stringify(audit, null, 2)}\n`);
  const gh = anchorGhMock();
  await assert.rejects(
    () => dockyard.planRegistryTransparencyAnchor(root, anchorInput, { ghExec: gh.exec }),
    /status complete/i,
  );
  assert.equal(gh.puts, 0);
});

test("P20 rejects tampered signed publication evidence before contacting GitHub", async () => {
  const { root, anchorInput, publication } = await fixture();
  const envelope = JSON.parse(await readFile(publication.envelopePath, "utf8"));
  envelope.sequence += 1;
  await writeFile(publication.envelopePath, `${JSON.stringify(envelope, null, 2)}\n`);
  let calls = 0;
  await assert.rejects(
    () => dockyard.planRegistryTransparencyAnchor(root, anchorInput, { ghExec: () => { calls += 1; throw new Error("gh must not run"); } }),
    /SHA-256 does not match/i,
  );
  assert.equal(calls, 0);
});

test("P20 requires explicit approval and the exact reviewed plan", async () => {
  const { root, anchorInput } = await fixture();
  const gh = anchorGhMock();
  const plan = await dockyard.planRegistryTransparencyAnchor(root, anchorInput, { ghExec: gh.exec });
  await assert.rejects(
    () => dockyard.publishRegistryTransparencyAnchor(root, anchorInput, {
      approveAnchor: false,
      expectedPlanSha256: plan.approvalSha256,
      ghExec: gh.exec,
    }),
    /approve-anchor/i,
  );
  await assert.rejects(
    () => dockyard.publishRegistryTransparencyAnchor(root, { ...anchorInput, branch: "witness" }, {
      approveAnchor: true,
      expectedPlanSha256: plan.approvalSha256,
      ghExec: gh.exec,
    }),
    /plan changed after review/i,
  );
  assert.equal(gh.puts, 0);
});

test("P20 creates one content-addressed anchor and verifies the exact public bytes", async () => {
  const { root, anchorInput } = await fixture();
  const gh = anchorGhMock();
  const plan = await dockyard.planRegistryTransparencyAnchor(root, anchorInput, { ghExec: gh.exec });
  const result = await dockyard.publishRegistryTransparencyAnchor(root, anchorInput, {
    approveAnchor: true,
    expectedPlanSha256: plan.approvalSha256,
    ghExec: gh.exec,
  });
  assert.equal(result.status, "complete");
  assert.equal(result.anchorSha256, plan.anchorSha256);
  assert.equal(result.blobSha, "e".repeat(40));
  assert.equal(result.commitSha, "f".repeat(40));
  assert.equal(gh.puts, 1);
  const publicRecord = JSON.parse(gh.current.toString("utf8"));
  assert.equal(publicRecord.kind, "dockyard-registry-publication-anchor");
  assert.equal(publicRecord.registryId, "dockyard-community");
  assert.equal(publicRecord.sequence, 9);
  const localAudit = JSON.parse(await readFile(result.auditPath, "utf8"));
  assert.equal(localAudit.status, "complete");
  assert.equal(localAudit.reviewedBy, anchorInput.reviewedBy);
  assert.equal(localAudit.rationale, anchorInput.rationale);
});

test("P20 treats an exact existing anchor as idempotent and performs no second PUT", async () => {
  const { root, anchorInput } = await fixture();
  const gh = anchorGhMock();
  const firstPlan = await dockyard.planRegistryTransparencyAnchor(root, anchorInput, { ghExec: gh.exec });
  const first = await dockyard.publishRegistryTransparencyAnchor(root, anchorInput, {
    approveAnchor: true,
    expectedPlanSha256: firstPlan.approvalSha256,
    ghExec: gh.exec,
  });
  assert.equal(first.status, "complete");
  const secondPlan = await dockyard.planRegistryTransparencyAnchor(root, anchorInput, { ghExec: gh.exec });
  assert.equal(secondPlan.alreadyAnchored, true);
  const second = await dockyard.publishRegistryTransparencyAnchor(root, anchorInput, {
    approveAnchor: true,
    expectedPlanSha256: secondPlan.approvalSha256,
    ghExec: gh.exec,
  });
  assert.equal(second.status, "already-anchored");
  assert.equal(gh.puts, 1);
});

test("P20 fails closed when the derived content-addressed anchor path has different bytes", async () => {
  const { root, anchorInput } = await fixture();
  const gh = anchorGhMock({ initialBytes: Buffer.from("{}\n") });
  await assert.rejects(
    () => dockyard.planRegistryTransparencyAnchor(root, anchorInput, { ghExec: gh.exec }),
    /already exists with different bytes/i,
  );
  assert.equal(gh.puts, 0);
});

test("P20 rejects malformed Base64 from an existing public anchor", async () => {
  const { root, anchorInput } = await fixture();
  const gh = anchorGhMock({ initialBytes: Buffer.from("{}\n"), malformedBase64: true });
  await assert.rejects(
    () => dockyard.planRegistryTransparencyAnchor(root, anchorInput, { ghExec: gh.exec }),
    /malformed Base64/i,
  );
  assert.equal(gh.puts, 0);
});

test("P20 reports successful mutation with incomplete response metadata as anchored-unverified", async () => {
  const { root, anchorInput } = await fixture();
  const gh = anchorGhMock({ omitMutationMetadata: true });
  const plan = await dockyard.planRegistryTransparencyAnchor(root, anchorInput, { ghExec: gh.exec });
  const result = await dockyard.publishRegistryTransparencyAnchor(root, anchorInput, {
    approveAnchor: true,
    expectedPlanSha256: plan.approvalSha256,
    ghExec: gh.exec,
  });
  assert.equal(result.status, "anchored-unverified");
  assert.match(result.verificationError, /valid content blob SHA/i);
  const localAudit = JSON.parse(await readFile(result.auditPath, "utf8"));
  assert.equal(localAudit.status, "anchored-unverified");
});

test("P20 rejects publication audits reached through a symlinked parent escape", async (t) => {
  if (process.platform === "win32") {
    t.skip("directory symlink creation may require elevated privileges on Windows");
    return;
  }
  const { root, home, anchorInput, publication } = await fixture();
  const outside = await mkdtemp(join(tmpdir(), "dockyard-p20-outside-"));
  const copiedAudit = join(outside, "copy.audit.json");
  await writeFile(copiedAudit, await readFile(publication.auditPath));
  const publicationBase = join(home, "community", "publications");
  await symlink(outside, join(publicationBase, "linked"), "dir");
  const gh = anchorGhMock();
  await assert.rejects(
    () => dockyard.planRegistryTransparencyAnchor(root, { ...anchorInput, auditPath: join(publicationBase, "linked", "copy.audit.json") }, { ghExec: gh.exec }),
    /resolves outside its allowed directory/i,
  );
  assert.equal(gh.puts, 0);
});
