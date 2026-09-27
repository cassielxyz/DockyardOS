const MIN_INTERVAL_MINUTES = 60;
const MAX_INTERVAL_MINUTES = 7 * 24 * 60;
const DEFAULT_INTERVAL_MINUTES = 6 * 60;
const STARTUP_GRACE_MS = 15 * 1000;

function boundedNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function normalizeScheduledUpdateConfig(input = {}) {
  const intervalMinutes = boundedNumber(
    input.intervalMinutes,
    DEFAULT_INTERVAL_MINUTES,
    MIN_INTERVAL_MINUTES,
    MAX_INTERVAL_MINUTES,
  );
  return {
    enabled: input.enabled === true,
    intervalMinutes,
    intervalMs: intervalMinutes * 60 * 1000,
    applySafeAutomatically: input.applySafeAutomatically === true,
    notifyWhenNoUpdates: input.notifyWhenNoUpdates === true,
  };
}

function nextScheduledDelay(lastCheckAt, intervalMs, now = Date.now()) {
  const last = Date.parse(lastCheckAt || "");
  if (!Number.isFinite(last)) return STARTUP_GRACE_MS;
  const remaining = last + intervalMs - now;
  return remaining <= 0 ? STARTUP_GRACE_MS : remaining;
}

function summarizeUpdateChecks(checks) {
  const summary = {
    total: 0,
    upToDate: 0,
    automatic: 0,
    approvalRequired: 0,
    quarantined: 0,
    unavailable: 0,
    errors: 0,
    attention: 0,
  };
  for (const item of Array.isArray(checks) ? checks : []) {
    summary.total += 1;
    if (item?.state === "up-to-date") summary.upToDate += 1;
    else if (item?.state === "update-available" && item?.assessment === "automatic") summary.automatic += 1;
    else if (item?.state === "approval-required") summary.approvalRequired += 1;
    else if (item?.state === "quarantined") summary.quarantined += 1;
    else if (item?.state === "manifest-missing") summary.unavailable += 1;
    else if (item?.state === "error") summary.errors += 1;
    else summary.unavailable += 1;
  }
  summary.attention = summary.approvalRequired + summary.quarantined + summary.unavailable + summary.errors;
  return summary;
}

function summarizeApplyResults(results) {
  const summary = { total: 0, updated: 0, unchanged: 0, skipped: 0, errors: 0, attention: 0 };
  for (const item of Array.isArray(results) ? results : []) {
    summary.total += 1;
    if (item?.action === "updated") summary.updated += 1;
    else if (item?.action === "unchanged") summary.unchanged += 1;
    else if (item?.action === "skipped") summary.skipped += 1;
    else summary.errors += 1;
  }
  summary.attention = summary.skipped + summary.errors;
  return summary;
}

module.exports = {
  MIN_INTERVAL_MINUTES,
  MAX_INTERVAL_MINUTES,
  DEFAULT_INTERVAL_MINUTES,
  STARTUP_GRACE_MS,
  normalizeScheduledUpdateConfig,
  nextScheduledDelay,
  summarizeUpdateChecks,
  summarizeApplyResults,
};
