import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const dockyard = await import("../dist/index.js");
const { handlePackageTransparencyAnchorCommand } = await import("../dist/community-package-transparency-anchor-command.js");

function processResult(ok, stdout = "", stderr = "", status = ok ? 0 : 1) {
  return { ok, stdout, stderr, status, timedOut: false };
}

function anchorGhMock(options = {}) {
  let current = options.initialBytes ? Buffer.from(options.initialBytes) : undefined;
  let blobSha = "a".repeat(40);
  let puts = 0;
  const calls = [];
  const exec = (args) => {
    calls.push(args);
    const methodIndex = args.indexOf("--method");
    const method = methodIndex >= 0 ? args[methodIndex + 1] : "GET";
    const endpoint = args.find((arg) => arg.startsWith("/repos/")) ?? "";
    if (method === "GET" && !endpoint.includes("/branches/") && !endpoint.includes("/contents/")) {
      return processResult(true, JSON.stringify({
        full_name: "cassielxyz/public-package-transparency",
        private: options.privateRepo === true,
        archived: false,
        disabled: false,
      }));
    }
    if (method === "GET" && endpoint.includes("/branches/")) {
      return options.missingBranch
        ? processResult(false, "", "gh: Not Found (HTTP 404)", 1)
        : processResult(true, JSON.stringify({ name: "main" }));
    }
    if (method === "GET" && endpoint.includes("/contents/")) {
      if (!current) return processResult(false, "", "gh: Not Found (HTTP 404)", 1);
      return processResult(true, JSON.stringify({
        type: "file",
        encoding: "base64",
        content: options.malformedBase64 ? "%%%invalid%%%" : current.toString("base64"),
        size: current.length,
        sha: blobSha,
      }));
    }
    if (method === "PUT" && endpoint.includes("/contents/")) {
      const inputIndex = args.indexOf("--input");
      assert.ok(inputIndex >= 0);
      const request = JSON.parse(readFileSync(args[inputIndex + 1], "utf8"));
      assert.equal("sha" in request, false, "P25 public anchors must remain create-only");
      current = Buffer.from(request.content, "base64");
      blobSha = "b".repeat(40);
      puts += 1;
      if (options.omitMutationMetadata) return processResult(true, JSON.stringify({ content: {}, commit: {} }));
      return processResult(true, JSON.stringify({ content: { sha: blobSha }, commit: { sha: "c".repeat(40) } }));
    }
    return processResult(false, "", `unexpected P25 gh call: ${args.join(" ")}`, 1);
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
  const home = await mkdtemp(join(tmpdir(), "dockyard-p25-home-"));
  const root = await mkdtemp(join(tmpdir(), "dockyard-p25-root-"));
  process.env.DOCKYARD_HOME = home;
  await writeFile(join(root, "package.json"), `${JSON.stringify({ name: "dockyard-p25-fixture" })}\n`);
  await dockyard.appendTransparencyRecord({
    action: "install",
    packageId: "private-package-name",
    revision: "1".repeat(40),
    contentSha256: "2".repeat(64),
    detail: "private package installation detail that must never appear in the public anchor",
  });
  await dockyard.appendTransparencyRecord({
    action: "update",
    packageId: "another-private-package",
    revision: "3".repeat(40),
    contentSha256: "4".repeat(64),
    detail: "second private action detail",
  });
  const input = {
    anchorId: "cassiel-dockyard",
    repository: "cassielxyz/public-package-transparency",
    branch: "main",
    reviewedBy: "package-security-maintainer",
    rationale: "Reviewed the local package action chain before publishing a privacy-preserving public commitment.",
    reviewedAt: "2026-09-28T12:00:00.000Z",
  };
  return { home, root, input };
}

test("P25 plan publishes only privacy-preserving chain commitment fields", async () => {
  const { root, input } = await fixture();
  const gh = anchorGhMock();
  const plan = await dockyard.planPackageTransparencyAnchor(root, input, { ghExec: gh.exec });
  assert.equal(plan.operation, "package-action-transparency-anchor");
  assert.equal(plan.local.records, 2);
  assert.match(plan.local.headRecordHash, /^[a-f0-9]{64}$/);
  assert.match(plan.local.transparencyLogSha256, /^[a-f0-9]{64}$/);
  assert.match(plan.approvalSha256, /^[a-f0-9]{64}$/);
  assert.equal(plan.alreadyAnchored, false);
  assert.match(plan.target.path, /^dockyard-transparency\/package-actions\/cassiel-dockyard\/000000000002-[a-f0-9]{64}\.json$/);
  const publicJson = JSON.stringify(plan.anchorRecord);
  assert.doesNotMatch(publicJson, /private-package-name/);
  assert.doesNotMatch(publicJson, /another-private-package/);
  assert.doesNotMatch(publicJson, /private package installation detail/);
  assert.doesNotMatch(publicJson, /package-security-maintainer/);
  assert.doesNotMatch(publicJson, /Reviewed the local package action chain/);
  assert.equal(gh.puts, 0);
});

test("P25 requires explicit approval before mutation", async () => {
  const { root, input } = await fixture();
  const gh = anchorGhMock();
  const plan = await dockyard.planPackageTransparencyAnchor(root, input, { ghExec: gh.exec });
  await assert.rejects(
    () => dockyard.publishPackageTransparencyAnchor(root, input, {
      approveAnchor: false,
      expectedPlanSha256: plan.approvalSha256,
      ghExec: gh.exec,
    }),
    /approve-anchor/i,
  );
  assert.equal(gh.puts, 0);
});

test("P25 CLI run reaches explicit approval guard before external GitHub execution", async () => {
  const { root, input } = await fixture();
  await assert.rejects(
    () => handlePackageTransparencyAnchorCommand(root, [
      "run",
      "--anchor-id", input.anchorId,
      "--repository", input.repository,
      "--branch", input.branch,
      "--reviewed-by", input.reviewedBy,
      "--rationale", input.rationale,
      "--reviewed-at", input.reviewedAt,
      "--expected-plan-sha256", "a".repeat(64),
    ]),
    /approve-anchor/i,
  );
});

test("P25 rejects private or unavailable public witness repositories", async () => {
  const { root, input } = await fixture();
  await assert.rejects(
    () => dockyard.planPackageTransparencyAnchor(root, input, { ghExec: anchorGhMock({ privateRepo: true }).exec }),
    /publicly readable/i,
  );
  await assert.rejects(
    () => dockyard.planPackageTransparencyAnchor(root, input, { ghExec: anchorGhMock({ missingBranch: true }).exec }),
    /verify transparency anchor branch/i,
  );
});

test("P25 refuses a tampered local hash chain before public mutation", async () => {
  const { home, root, input } = await fixture();
  const path = join(home, "community", "transparency.json");
  const log = JSON.parse(await readFile(path, "utf8"));
  log.records[0].detail = "tampered after hashing";
  await writeFile(path, `${JSON.stringify(log, null, 2)}\n`);
  let calls = 0;
  await assert.rejects(
    () => dockyard.planPackageTransparencyAnchor(root, input, { ghExec: () => { calls += 1; throw new Error("GitHub must not be contacted"); } }),
    /transparency chain is invalid/i,
  );
  assert.equal(calls, 0);
});

test("P25 rejects a stale reviewed plan when the local action chain advances", async () => {
  const { root, input } = await fixture();
  const gh = anchorGhMock();
  const plan = await dockyard.planPackageTransparencyAnchor(root, input, { ghExec: gh.exec });
  await dockyard.appendTransparencyRecord({
    action: "rollback",
    packageId: "third-private-package",
    revision: "5".repeat(40),
    contentSha256: "6".repeat(64),
    detail: "chain advanced after review",
  });
  await assert.rejects(
    () => dockyard.publishPackageTransparencyAnchor(root, input, {
      approveAnchor: true,
      expectedPlanSha256: plan.approvalSha256,
      ghExec: gh.exec,
    }),
    /plan changed after review/i,
  );
  assert.equal(gh.puts, 0);
});

test("P25 creates a content-addressed public witness and local review audit", async () => {
  const { root, input } = await fixture();
  const gh = anchorGhMock();
  const plan = await dockyard.planPackageTransparencyAnchor(root, input, { ghExec: gh.exec });
  const result = await dockyard.publishPackageTransparencyAnchor(root, input, {
    approveAnchor: true,
    expectedPlanSha256: plan.approvalSha256,
    ghExec: gh.exec,
  });
  assert.equal(result.status, "complete");
  assert.equal(result.anchorSha256, plan.anchorSha256);
  assert.equal(result.blobSha, "b".repeat(40));
  assert.equal(result.commitSha, "c".repeat(40));
  assert.equal(gh.puts, 1);
  const publicRecord = JSON.parse(gh.current.toString("utf8"));
  assert.equal(publicRecord.kind, "dockyard-community-package-action-anchor");
  assert.equal(publicRecord.anchorId, input.anchorId);
  assert.equal(publicRecord.records, 2);
  assert.equal("reviewedBy" in publicRecord, false);
  assert.equal("rationale" in publicRecord, false);
  const audit = JSON.parse(await readFile(result.auditPath, "utf8"));
  assert.equal(audit.status, "complete");
  assert.equal(audit.reviewedBy, input.reviewedBy);
  assert.equal(audit.rationale, input.rationale);
});

test("P25 exact existing witness is idempotent and does not PUT twice", async () => {
  const { root, input } = await fixture();
  const gh = anchorGhMock();
  const firstPlan = await dockyard.planPackageTransparencyAnchor(root, input, { ghExec: gh.exec });
  const first = await dockyard.publishPackageTransparencyAnchor(root, input, {
    approveAnchor: true,
    expectedPlanSha256: firstPlan.approvalSha256,
    ghExec: gh.exec,
  });
  assert.equal(first.status, "complete");
  const secondPlan = await dockyard.planPackageTransparencyAnchor(root, input, { ghExec: gh.exec });
  assert.equal(secondPlan.alreadyAnchored, true);
  const second = await dockyard.publishPackageTransparencyAnchor(root, input, {
    approveAnchor: true,
    expectedPlanSha256: secondPlan.approvalSha256,
    ghExec: gh.exec,
  });
  assert.equal(second.status, "already-anchored");
  assert.equal(gh.puts, 1);
});

test("P25 fails closed on conflicting or malformed existing public witness bytes", async () => {
  const { root, input } = await fixture();
  const conflict = anchorGhMock({ initialBytes: Buffer.from("{}\n") });
  await assert.rejects(
    () => dockyard.planPackageTransparencyAnchor(root, input, { ghExec: conflict.exec }),
    /already exists with different bytes/i,
  );
  assert.equal(conflict.puts, 0);

  const malformed = anchorGhMock({ initialBytes: Buffer.from("{}\n"), malformedBase64: true });
  await assert.rejects(
    () => dockyard.planPackageTransparencyAnchor(root, input, { ghExec: malformed.exec }),
    /malformed Base64/i,
  );
  assert.equal(malformed.puts, 0);
});
