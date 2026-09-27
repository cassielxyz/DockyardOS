import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  MIN_INTERVAL_MINUTES,
  MAX_INTERVAL_MINUTES,
  DEFAULT_INTERVAL_MINUTES,
  STARTUP_GRACE_MS,
  normalizeScheduledUpdateConfig,
  nextScheduledDelay,
  summarizeUpdateChecks,
  summarizeApplyResults,
} = require("../integrations/vscode/community-update-scheduler.js");

test("scheduled update configuration is opt-in and interval bounded", () => {
  assert.deepEqual(normalizeScheduledUpdateConfig({}), {
    enabled: false,
    intervalMinutes: DEFAULT_INTERVAL_MINUTES,
    intervalMs: DEFAULT_INTERVAL_MINUTES * 60 * 1000,
    applySafeAutomatically: false,
    notifyWhenNoUpdates: false,
  });
  assert.equal(normalizeScheduledUpdateConfig({ intervalMinutes: 1 }).intervalMinutes, MIN_INTERVAL_MINUTES);
  assert.equal(normalizeScheduledUpdateConfig({ intervalMinutes: 999999 }).intervalMinutes, MAX_INTERVAL_MINUTES);
  assert.equal(normalizeScheduledUpdateConfig({ enabled: true, applySafeAutomatically: true }).applySafeAutomatically, true);
});

test("scheduled delay respects last successful attempt and startup grace", () => {
  const now = Date.parse("2026-09-27T12:00:00.000Z");
  const interval = 6 * 60 * 60 * 1000;
  assert.equal(nextScheduledDelay(undefined, interval, now), STARTUP_GRACE_MS);
  assert.equal(nextScheduledDelay("2026-09-27T05:00:00.000Z", interval, now), STARTUP_GRACE_MS);
  assert.equal(nextScheduledDelay("2026-09-27T10:00:00.000Z", interval, now), 4 * 60 * 60 * 1000);
});

test("update check summaries keep automatic updates separate from review-required states", () => {
  const summary = summarizeUpdateChecks([
    { state: "up-to-date" },
    { state: "update-available", assessment: "automatic" },
    { state: "approval-required" },
    { state: "quarantined" },
    { state: "manifest-missing" },
    { state: "error" },
  ]);
  assert.equal(summary.total, 6);
  assert.equal(summary.automatic, 1);
  assert.equal(summary.approvalRequired, 1);
  assert.equal(summary.quarantined, 1);
  assert.equal(summary.attention, 4);
});

test("safe-apply summaries never disguise skipped or error results", () => {
  const summary = summarizeApplyResults([
    { action: "updated" },
    { action: "unchanged" },
    { action: "skipped" },
    { action: "error" },
  ]);
  assert.equal(summary.updated, 1);
  assert.equal(summary.unchanged, 1);
  assert.equal(summary.skipped, 1);
  assert.equal(summary.errors, 1);
  assert.equal(summary.attention, 2);
});

test("VS Code scheduled updater is constrained to the existing safe CLI boundary", async () => {
  const extension = await readFile("integrations/vscode/extension.js", "utf8");
  assert.match(extension, /community", "updates", "check", "--json"/);
  assert.match(extension, /community", "updates", "apply-safe", "--json"/);
  assert.doesNotMatch(extension, /community", "install"[^\n]+scheduled/i);
  assert.match(extension, /workspace\.isTrusted/);
});
