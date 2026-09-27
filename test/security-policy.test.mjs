import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const dockyard = await import("../dist/index.js");

async function setup() {
  const home = await mkdtemp(join(tmpdir(), "dockyard-security-policy-home-"));
  const root = await mkdtemp(join(tmpdir(), "dockyard-security-policy-root-"));
  process.env.DOCKYARD_HOME = home;
  return { home, root };
}

function runResult(root, status, findings) {
  const runId = "20260927T120000-policy-test";
  const artifactDirectory = join(dockyard.projectDirectory(dockyard.projectIdForRoot(root)), "security", "runs", runId);
  return {
    runId,
    profile: "general",
    target: { type: "source", value: "." },
    status,
    steps: [{
      scanner: findings[0]?.scanner ?? "gitleaks",
      status: status === "error" ? "error" : status === "incomplete" ? "skipped" : findings.length ? "findings" : "clean",
      exitCode: status === "incomplete" ? null : 0,
      findings,
      summary: "synthetic test result",
      startedAt: "2026-09-27T12:00:00.000Z",
      finishedAt: "2026-09-27T12:00:01.000Z",
    }],
    gates: [],
    artifactDirectory,
    startedAt: "2026-09-27T12:00:00.000Z",
    finishedAt: "2026-09-27T12:00:01.000Z",
  };
}

test("secret baseline stores only a fingerprint and converts matching raw finding to accepted-risk", async () => {
  const { root } = await setup();
  await dockyard.addSecretBaseline(root, {
    id: "known-test-secret",
    fingerprint: "config/test.env:3:TEST_TOKEN:1",
    owner: "security-team",
    rationale: "Known inert fixture credential used only in tests.",
    expiresAt: "2027-01-15T00:00:00.000Z",
  });
  const policy = await dockyard.loadSecurityPolicy(root);
  assert.equal(policy.exceptions.length, 1);
  assert.equal(policy.exceptions[0].kind, "secret-baseline");
  assert.equal("secret" in policy.exceptions[0], false);

  const result = runResult(root, "findings", [{
    scanner: "gitleaks",
    ruleId: "generic-api-key",
    title: "Potential secret detected",
    severity: "high",
    file: "config/test.env",
    line: 3,
    fingerprint: "config/test.env:3:TEST_TOKEN:1",
  }]);
  const evaluation = await dockyard.evaluateSecurityPolicy(root, result, { persist: false, now: new Date("2026-09-28T00:00:00.000Z") });
  assert.equal(evaluation.gate, "accepted-risk");
  assert.equal(evaluation.rawFindingCount, 1);
  assert.equal(evaluation.acceptedFindingCount, 1);
  assert.equal(evaluation.blockingFindingCount, 0);
});

test("expired exceptions stop matching automatically", async () => {
  const { root } = await setup();
  await dockyard.addSecretBaseline(root, {
    id: "temporary-secret",
    fingerprint: "fixture:1:key:1",
    owner: "security-team",
    rationale: "Temporary compatibility fixture during migration.",
    expiresAt: "2027-01-01T00:00:00.000Z",
  });
  const result = runResult(root, "findings", [{
    scanner: "gitleaks",
    title: "Potential secret detected",
    severity: "high",
    fingerprint: "fixture:1:key:1",
  }]);
  const evaluation = await dockyard.evaluateSecurityPolicy(root, result, { persist: false, now: new Date("2027-01-02T00:00:00.000Z") });
  assert.equal(evaluation.gate, "fail");
  assert.deepEqual(evaluation.expiredExceptionIds, ["temporary-secret"]);
  assert.equal(evaluation.acceptedFindingCount, 0);
});

test("dependency exception binds to both advisory and package", async () => {
  const { root } = await setup();
  await dockyard.addDependencyException(root, {
    id: "osv-parser-fixture",
    advisory: "GHSA-AAAA-BBBB-CCCC",
    package: "example-lib",
    owner: "dependency-owner",
    rationale: "Temporary upstream incompatibility with the fixed release.",
    expiresAt: "2027-01-15T00:00:00.000Z",
  });
  const matched = runResult(root, "findings", [{
    scanner: "osv-scanner",
    ruleId: "GHSA-AAAA-BBBB-CCCC",
    title: "Known vulnerability",
    severity: "medium",
    advisory: "GHSA-AAAA-BBBB-CCCC",
    package: "example-lib",
  }]);
  const accepted = await dockyard.evaluateSecurityPolicy(root, matched, { persist: false, now: new Date("2026-10-01T00:00:00.000Z") });
  assert.equal(accepted.gate, "accepted-risk");

  const wrongPackage = runResult(root, "findings", [{
    scanner: "osv-scanner",
    ruleId: "GHSA-AAAA-BBBB-CCCC",
    title: "Known vulnerability",
    severity: "medium",
    advisory: "GHSA-AAAA-BBBB-CCCC",
    package: "different-lib",
  }]);
  const blocked = await dockyard.evaluateSecurityPolicy(root, wrongPackage, { persist: false, now: new Date("2026-10-01T00:00:00.000Z") });
  assert.equal(blocked.gate, "fail");
});

test("policy cannot convert incomplete scan into success even when its finding is excepted", async () => {
  const { root } = await setup();
  await dockyard.addSecretBaseline(root, {
    id: "known-fixture",
    fingerprint: "fixture:1:key:1",
    owner: "security-team",
    rationale: "Known fixture while another required scanner is unavailable.",
    expiresAt: "2027-01-15T00:00:00.000Z",
  });
  const result = runResult(root, "incomplete", [{
    scanner: "gitleaks",
    title: "Potential secret detected",
    severity: "high",
    fingerprint: "fixture:1:key:1",
  }]);
  const evaluation = await dockyard.evaluateSecurityPolicy(root, result, { persist: false, now: new Date("2026-10-01T00:00:00.000Z") });
  assert.equal(evaluation.gate, "incomplete");
  assert.equal(evaluation.acceptedFindingCount, 1);
  assert.match(evaluation.reasons[0], /cannot convert/i);
});

test("exception metadata requires meaningful rationale and bounded future expiry", async () => {
  const { root } = await setup();
  await assert.rejects(() => dockyard.addSecretBaseline(root, {
    id: "bad-rationale",
    fingerprint: "fixture:1:key:1",
    owner: "security-team",
    rationale: "short",
    expiresAt: "2027-01-15T00:00:00.000Z",
  }), /at least 8/);
  await assert.rejects(() => dockyard.addDependencyException(root, {
    id: "too-long",
    advisory: "GHSA-AAAA-BBBB-CCCC",
    package: "example-lib",
    owner: "dependency-owner",
    rationale: "Temporary upstream compatibility issue.",
    expiresAt: "2030-01-01T00:00:00.000Z",
  }), /365 days/);
});

test("SARIF preserves every raw finding and marks accepted exceptions as external suppressions", async () => {
  const { root } = await setup();
  await dockyard.addSecretBaseline(root, {
    id: "sarif-fixture",
    fingerprint: "fixture:1:key:1",
    owner: "security-team",
    rationale: "Known inert fixture credential for SARIF regression coverage.",
    expiresAt: "2027-01-15T00:00:00.000Z",
  });
  const result = runResult(root, "findings", [
    {
      scanner: "gitleaks",
      ruleId: "generic-api-key",
      title: "Potential secret detected",
      severity: "high",
      file: "fixture.env",
      line: 1,
      fingerprint: "fixture:1:key:1",
    },
    {
      scanner: "semgrep",
      ruleId: "typescript.lang.security.detect-child-process",
      title: "Review child process execution",
      severity: "medium",
      file: "src/example.ts",
      line: 10,
    },
  ]);
  const policy = await dockyard.evaluateSecurityPolicy(root, result, { persist: false, now: new Date("2026-10-01T00:00:00.000Z") });
  const sarif = dockyard.securityRunToSarif(result, policy);
  assert.equal(sarif.runs[0].results.length, 2);
  assert.equal(sarif.runs[0].results[0].suppressions[0].status, "accepted");
  assert.equal(sarif.runs[0].results[0].properties.dockyardPolicyDisposition, "accepted-risk");
  assert.equal(sarif.runs[0].results[1].properties.dockyardPolicyDisposition, "blocking");
});

test("SARIF invocation remains unsuccessful for incomplete scans", async () => {
  const { root } = await setup();
  const result = runResult(root, "incomplete", []);
  const policy = await dockyard.evaluateSecurityPolicy(root, result, { persist: false, now: new Date("2026-10-01T00:00:00.000Z") });
  const sarif = dockyard.securityRunToSarif(result, policy);
  assert.equal(sarif.runs[0].invocations[0].executionSuccessful, false);
  assert.equal(sarif.runs[0].invocations[0].properties.dockyardPolicyGate, "incomplete");
});
