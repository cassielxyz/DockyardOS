import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const dockyard = await import("../dist/index.js");

test("security profiles use current DockyardOS OWASP baselines", () => {
  const versions = Object.fromEntries(dockyard.securityProfiles.map((profile) => [profile.id, profile.frameworkVersion]));
  assert.match(versions.web, /2025/);
  assert.match(versions.api, /2023/);
  assert.match(versions.mobile, /2024/);
  assert.match(versions.llm, /2026/);
  for (const profile of dockyard.securityProfiles.filter((item) => item.id !== "general")) assert.equal(profile.controls.length, 10);
});

test("security planning restricts source scans to the initialized project", async () => {
  const root = await mkdtemp(join(tmpdir(), "dockyard-security-scope-"));
  await dockyard.initProject(root, { name: "security-scope", mode: "balanced" });
  await assert.rejects(
    () => dockyard.createSecurityPlan(root, { profile: "web", target: { type: "source", value: "../" }, mode: "quick" }),
    /restricted to the initialized DockyardOS project root/,
  );
});

test("remote security planning requires explicit authorization", async () => {
  const root = await mkdtemp(join(tmpdir(), "dockyard-security-authz-"));
  await dockyard.initProject(root, { name: "security-authz", mode: "balanced" });
  await assert.rejects(
    () => dockyard.createSecurityPlan(root, { profile: "web", target: { type: "url", value: "https://example.com" }, mode: "quick" }),
    /explicit authorization/,
  );
});

test("security plan keeps dynamic testing opt-in and budget bounded", async () => {
  const root = await mkdtemp(join(tmpdir(), "dockyard-security-plan-"));
  await dockyard.initProject(root, { name: "security-plan", mode: "balanced" });
  const withoutStrix = await dockyard.createSecurityPlan(root, { profile: "web", target: { type: "source", value: "." }, mode: "quick" });
  assert.equal(withoutStrix.steps.some((step) => step.scanner === "strix"), false);
  await assert.rejects(
    () => dockyard.createSecurityPlan(root, { profile: "web", target: { type: "source", value: "." }, mode: "quick", includeStrix: true }),
    /explicit positive strixBudgetUsd/,
  );
  const withStrix = await dockyard.createSecurityPlan(root, { profile: "web", target: { type: "source", value: "." }, mode: "quick", includeStrix: true, strixBudgetUsd: 5 });
  const strix = withStrix.steps.find((step) => step.scanner === "strix");
  assert.ok(strix);
  assert.ok(strix.args.includes("-n"));
  assert.ok(strix.args.includes("--max-budget"));
});

test("scanner parsers normalize Gitleaks Semgrep and OSV findings", () => {
  const leaks = dockyard.parseGitleaks([{ RuleID: "generic-api-key", Description: "API key", File: "a.ts", StartLine: 4, Fingerprint: "fp" }]);
  assert.equal(leaks[0].severity, "high");
  assert.equal(leaks[0].file, "a.ts");

  const semgrep = dockyard.parseSemgrep({ results: [{ check_id: "ts.insecure", path: "b.ts", start: { line: 9 }, extra: { message: "Unsafe call", severity: "ERROR" } }] });
  assert.equal(semgrep[0].severity, "high");
  assert.equal(semgrep[0].line, 9);

  const osv = dockyard.parseOsv({ results: [{ source: { path: "package-lock.json" }, packages: [{ package: { name: "demo" }, vulnerabilities: [{ id: "GHSA-test", summary: "Known issue", database_specific: { severity: "HIGH" } }] }] }] });
  assert.equal(osv[0].advisory, "GHSA-test");
  assert.equal(osv[0].package, "demo");
});

test("missing required scanners produce an incomplete run rather than a false clean", async () => {
  const artifactDirectory = await mkdtemp(join(tmpdir(), "dockyard-security-run-"));
  const result = await dockyard.executeSecurityPlan({
    runId: "missing-tool",
    projectId: "test",
    root: artifactDirectory,
    artifactDirectory,
    request: { profile: "general", target: { type: "source", value: "." }, mode: "quick" },
    profile: dockyard.securityProfile("general"),
    steps: [{ id: "secret-scan", scanner: "gitleaks", required: true, command: "dockyard-command-that-does-not-exist-92741", args: [], cwd: artifactDirectory, reason: "test", longRunning: false, findingExitCodes: [1] }],
    gates: ["secret-scan"],
    createdAt: new Date().toISOString(),
  });
  assert.equal(result.status, "incomplete");
  assert.equal(result.steps[0].status, "skipped");
});

test("threat model persists outside the source repository with profile coverage", async () => {
  const root = await mkdtemp(join(tmpdir(), "dockyard-threat-model-"));
  await dockyard.initProject(root, { name: "threat-model", mode: "balanced" });
  const generated = await dockyard.createThreatModel(root, "api");
  assert.equal(generated.model.threats.length, 10);
  assert.ok(generated.model.trustBoundaries.length >= 4);
  const persisted = JSON.parse(await readFile(generated.path, "utf8"));
  assert.equal(persisted.profile, "api");
  assert.equal(generated.path.startsWith(root), false);
});

test("proof-fix-rerun comparison passes only after blocking findings are removed", () => {
  const finding = { scanner: "gitleaks", ruleId: "secret", title: "Secret", severity: "high", file: "a.ts", line: 1, fingerprint: "same" };
  const base = {
    profile: "web",
    target: { type: "source", value: "." },
    gates: [],
    artifactDirectory: "/tmp/security",
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
  };
  const before = { ...base, runId: "before", status: "findings", steps: [{ scanner: "gitleaks", status: "findings", exitCode: 1, findings: [finding], summary: "finding", startedAt: base.startedAt, finishedAt: base.finishedAt }] };
  const stillBroken = { ...base, runId: "still", status: "findings", steps: [{ scanner: "gitleaks", status: "findings", exitCode: 1, findings: [finding], summary: "finding", startedAt: base.startedAt, finishedAt: base.finishedAt }] };
  const fixed = { ...base, runId: "after", status: "clean", steps: [{ scanner: "gitleaks", status: "clean", exitCode: 0, findings: [], summary: "clean", startedAt: base.startedAt, finishedAt: base.finishedAt }] };
  assert.equal(dockyard.compareSecurityRuns(before, stillBroken).gate, "fail");
  const report = dockyard.compareSecurityRuns(before, fixed);
  assert.equal(report.gate, "pass");
  assert.equal(report.fixed.length, 1);
});
