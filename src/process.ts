import { spawnSync } from "node:child_process";

export interface ProcessResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  status: number | null;
  timedOut: boolean;
}

export interface RunOptions {
  cwd?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
}

const SECRET_PATTERNS = [
  /(?:token|api[_-]?key|secret|password|passwd|authorization|bearer)\s*[=:]\s*[^\s,;]+/gi,
  /(?:ghp|github_pat|glpat|sk_live|sk_test|sbp|cf|vercel)_[A-Za-z0-9_\-.]{12,}/g,
];

export function redactSensitiveOutput(value: string): string {
  let output = value;
  for (const pattern of SECRET_PATTERNS) output = output.replace(pattern, "[REDACTED]");
  return output;
}

function bounded(value: string, maxOutputBytes: number): string {
  const clean = redactSensitiveOutput(value.trim());
  if (Buffer.byteLength(clean, "utf8") <= maxOutputBytes) return clean;
  return `${Buffer.from(clean, "utf8").subarray(0, maxOutputBytes).toString("utf8")}\n[output truncated]`;
}

export function run(command: string, args: string[], cwdOrOptions?: string | RunOptions): ProcessResult {
  const options: RunOptions = typeof cwdOrOptions === "string" ? { cwd: cwdOrOptions } : (cwdOrOptions ?? {});
  const maxOutputBytes = options.maxOutputBytes ?? 32_768;
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    windowsHide: true,
    timeout: options.timeoutMs ?? 15_000,
    maxBuffer: Math.max(maxOutputBytes * 2, 65_536),
  });
  const errorCode = (result.error as NodeJS.ErrnoException | undefined)?.code;
  return {
    ok: result.status === 0,
    stdout: bounded(result.stdout ?? "", maxOutputBytes),
    stderr: bounded(result.stderr ?? "", maxOutputBytes),
    status: result.status,
    timedOut: errorCode === "ETIMEDOUT",
  };
}

export function commandExists(command: string): boolean {
  if (!/^[A-Za-z0-9._+-]+$/.test(command)) return false;
  const locator = process.platform === "win32" ? "where" : "which";
  return run(locator, [command], { timeoutMs: 3_000, maxOutputBytes: 4_096 }).ok;
}
