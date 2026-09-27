import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const dockyard = await import("../dist/index.js");
const main = resolve("dist/main.js");

function policyFixture() {
  return {
    schemaVersion: 1,
    projectId: "policy-reminder-fixture",
    updatedAt: "2026-10-01T00:00:00.000Z",
    exceptions: [
      {
        id: "expired-secret",
        kind: "secret-baseline",
        scanner: "gitleaks",
        fingerprint: "fixture.env:1:TOKEN:1",
        owner: "security-team",
        rationale: "Known inert secret fixture pending cleanup.",
        createdAt: "2026-09-01T00:00:00.000Z",
        expiresAt: "2026-10-08T00:00:00.000Z",
      },
      {
        id: "soon-dependency",
        kind: "dependency-exception",
        scanner: "osv-scanner",
        advisory: "GHSA-AAAA-BBBB-CCCC",
        package: "example-lib",
        owner: "dependency-team",
        rationale: "Upstream fix is being validated before rollout.",
        createdAt: "2026-09-05T00:00:00.000Z",
        expiresAt: "2026-10-20T00:00:00.000Z",
      },
      {
        id: "later-secret",
        kind: "secret-baseline",
        scanner: "gitleaks",
        fingerprint: "later.env:2:TOKEN:1",
        owner: "security-team",
        rationale: "Longer migration window approved for this fixture.",
        createdAt: "2026-09-10T00:00:00.000Z",
        expiresAt: "2026-12-31T00:00:00.000Z",
      },
    ],
  };
}

test("policy reminders surface expired and near-expiry exceptions without mutating policy", () => {
  const policy = policyFixture();
  const before = JSON.stringify(policy);
  const report = dockyard.buildSecurityPolicyReminderReport(policy, {
    withinDays: 14,
    now: new Date("2026-10-10T00:00:00.000Z"),
  });

  assert.equal(report.needsReview, true);
  assert.deepEqual(report.summary, {
    totalExceptions: 3,
    activeOutsideWindow: 1,
    expiringSoon: 1,
    expired: 1,
  });
  assert.deepEqual(report.reminders.map((item) => item.exceptionId), ["expired-secret", "soon-dependency"]);
  assert.equal(report.reminders[0].status, "expired");
  assert.equal(report.reminders[0].daysUntilExpiry, -2);
  assert.equal(report.reminders[0].fingerprint, "fixture.env:1:TOKEN:1");
  assert.equal(report.reminders[1].status, "expiring-soon");
  assert.equal(report.reminders[1].daysUntilExpiry, 10);
  assert.equal(report.reminders[1].advisory, "GHSA-AAAA-BBBB-CCCC");
  assert.equal(report.reminders[1].package, "example-lib");
  assert.equal(JSON.stringify(policy), before);
});

test("policy reminders can be scoped to one owner case-insensitively", () => {
  const report = dockyard.buildSecurityPolicyReminderReport(policyFixture(), {
    withinDays: 30,
    owner: "DEPENDENCY-TEAM",
    now: new Date("2026-10-10T00:00:00.000Z"),
  });
  assert.equal(report.summary.totalExceptions, 1);
  assert.equal(report.summary.expiringSoon, 1);
  assert.equal(report.summary.expired, 0);
  assert.deepEqual(report.reminders.map((item) => item.exceptionId), ["soon-dependency"]);
});

test("reminder window is defaulted and strictly bounded", () => {
  assert.equal(dockyard.normalizeSecurityPolicyReminderWindowDays(undefined), 30);
  assert.equal(dockyard.normalizeSecurityPolicyReminderWindowDays("1"), 1);
  assert.equal(dockyard.normalizeSecurityPolicyReminderWindowDays(90), 90);
  assert.throws(() => dockyard.normalizeSecurityPolicyReminderWindowDays("0"), /1 to 90/);
  assert.throws(() => dockyard.normalizeSecurityPolicyReminderWindowDays("91"), /1 to 90/);
  assert.throws(() => dockyard.normalizeSecurityPolicyReminderWindowDays("2.5"), /1 to 90/);
  assert.throws(() => dockyard.normalizeSecurityPolicyReminderWindowDays("abc"), /1 to 90/);
});

test("empty project policy produces a stable no-review report", async () => {
  const home = await mkdtemp(join(tmpdir(), "dockyard-security-reminder-home-"));
  const root = await mkdtemp(join(tmpdir(), "dockyard-security-reminder-root-"));
  process.env.DOCKYARD_HOME = home;
  const report = await dockyard.securityPolicyReminders(root, {
    withinDays: 7,
    now: new Date("2026-10-10T00:00:00.000Z"),
  });
  assert.equal(report.projectId, dockyard.projectIdForRoot(root));
  assert.equal(report.needsReview, false);
  assert.deepEqual(report.summary, { totalExceptions: 0, activeOutsideWindow: 0, expiringSoon: 0, expired: 0 });
  assert.deepEqual(report.reminders, []);
});

test("security policy reminders CLI is read-only and validates its window", async () => {
  const home = await mkdtemp(join(tmpdir(), "dockyard-security-reminder-cli-home-"));
  const root = await mkdtemp(join(tmpdir(), "dockyard-security-reminder-cli-root-"));
  const env = { ...process.env, DOCKYARD_HOME: home };
  const result = spawnSync(process.execPath, [main, "security", "policy", "reminders", "--within-days", "14"], {
    cwd: root,
    env,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.windowDays, 14);
  assert.equal(parsed.needsReview, false);
  assert.deepEqual(parsed.reminders, []);

  const invalid = spawnSync(process.execPath, [main, "security", "policy", "reminders", "--within-days", "0"], {
    cwd: root,
    env,
    encoding: "utf8",
  });
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /1 to 90/);
});
