import { projectIdForRoot } from "./project.js";
import { loadSecurityPolicy, type SecurityPolicyException, type SecurityPolicyFile } from "./security-policy.js";

const DAY_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_SECURITY_POLICY_REMINDER_WINDOW_DAYS = 30;
export const MAX_SECURITY_POLICY_REMINDER_WINDOW_DAYS = 90;

export type SecurityPolicyReminderStatus = "expired" | "expiring-soon";

export interface SecurityPolicyReminder {
  exceptionId: string;
  kind: SecurityPolicyException["kind"];
  owner: string;
  rationale: string;
  createdAt: string;
  expiresAt: string;
  status: SecurityPolicyReminderStatus;
  daysUntilExpiry: number;
  scanner: SecurityPolicyException["scanner"];
  fingerprint?: string;
  advisory?: string;
  package?: string;
}

export interface SecurityPolicyReminderReport {
  schemaVersion: 1;
  projectId: string;
  generatedAt: string;
  windowDays: number;
  owner?: string;
  needsReview: boolean;
  summary: {
    totalExceptions: number;
    activeOutsideWindow: number;
    expiringSoon: number;
    expired: number;
  };
  reminders: SecurityPolicyReminder[];
}

export function normalizeSecurityPolicyReminderWindowDays(value: number | string | undefined): number {
  if (value === undefined || value === "") return DEFAULT_SECURITY_POLICY_REMINDER_WINDOW_DAYS;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_SECURITY_POLICY_REMINDER_WINDOW_DAYS) {
    throw new Error(`Security policy reminder window must be an integer from 1 to ${MAX_SECURITY_POLICY_REMINDER_WINDOW_DAYS} days.`);
  }
  return parsed;
}

function daysUntilExpiry(expiresAt: string, nowMs: number): number {
  const delta = Date.parse(expiresAt) - nowMs;
  if (delta === 0) return 0;
  if (delta > 0) return Math.ceil(delta / DAY_MS);
  return -Math.ceil(Math.abs(delta) / DAY_MS);
}

function reminder(exception: SecurityPolicyException, status: SecurityPolicyReminderStatus, nowMs: number): SecurityPolicyReminder {
  return {
    exceptionId: exception.id,
    kind: exception.kind,
    owner: exception.owner,
    rationale: exception.rationale,
    createdAt: exception.createdAt,
    expiresAt: exception.expiresAt,
    status,
    daysUntilExpiry: daysUntilExpiry(exception.expiresAt, nowMs),
    scanner: exception.scanner,
    ...(exception.kind === "secret-baseline" ? { fingerprint: exception.fingerprint } : {}),
    ...(exception.kind === "dependency-exception" ? { advisory: exception.advisory, package: exception.package } : {}),
  };
}

function ownerFilter(owner: string | undefined): string | undefined {
  if (owner === undefined) return undefined;
  const normalized = owner.trim();
  if (!normalized || normalized.length > 128 || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new Error("Security policy reminder owner filter is empty, too long, or contains control characters.");
  }
  return normalized;
}

export function buildSecurityPolicyReminderReport(
  policy: SecurityPolicyFile,
  options: { withinDays?: number | string; owner?: string; now?: Date } = {},
): SecurityPolicyReminderReport {
  const windowDays = normalizeSecurityPolicyReminderWindowDays(options.withinDays);
  const owner = ownerFilter(options.owner);
  const now = options.now ?? new Date();
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) throw new Error("Security policy reminder timestamp is invalid.");
  const thresholdMs = nowMs + (windowDays * DAY_MS);
  const considered = owner
    ? policy.exceptions.filter((item) => item.owner.toLowerCase() === owner.toLowerCase())
    : policy.exceptions;
  const reminders: SecurityPolicyReminder[] = [];
  let activeOutsideWindow = 0;

  for (const exception of considered) {
    const expiryMs = Date.parse(exception.expiresAt);
    if (!Number.isFinite(expiryMs)) throw new Error(`Security exception expiry is invalid: ${exception.id}`);
    if (expiryMs <= nowMs) reminders.push(reminder(exception, "expired", nowMs));
    else if (expiryMs <= thresholdMs) reminders.push(reminder(exception, "expiring-soon", nowMs));
    else activeOutsideWindow += 1;
  }

  reminders.sort((a, b) => {
    if (a.status !== b.status) return a.status === "expired" ? -1 : 1;
    const expiryOrder = Date.parse(a.expiresAt) - Date.parse(b.expiresAt);
    return expiryOrder || a.exceptionId.localeCompare(b.exceptionId);
  });

  const expired = reminders.filter((item) => item.status === "expired").length;
  const expiringSoon = reminders.length - expired;
  return {
    schemaVersion: 1,
    projectId: policy.projectId,
    generatedAt: now.toISOString(),
    windowDays,
    ...(owner ? { owner } : {}),
    needsReview: reminders.length > 0,
    summary: {
      totalExceptions: considered.length,
      activeOutsideWindow,
      expiringSoon,
      expired,
    },
    reminders,
  };
}

export async function securityPolicyReminders(
  root: string,
  options: { withinDays?: number | string; owner?: string; now?: Date } = {},
): Promise<SecurityPolicyReminderReport> {
  const policy = await loadSecurityPolicy(root);
  if (policy.projectId !== projectIdForRoot(root)) throw new Error("Security policy project identity does not match the current project.");
  return buildSecurityPolicyReminderReport(policy, options);
}
