import { spawnSync } from "node:child_process";

export interface ProcessResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  status: number | null;
}

export function run(command: string, args: string[], cwd?: string): ProcessResult {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
  });
  return {
    ok: result.status === 0,
    stdout: (result.stdout ?? "").trim(),
    stderr: (result.stderr ?? "").trim(),
    status: result.status,
  };
}

export function commandExists(command: string): boolean {
  const probe = process.platform === "win32" ? run("where", [command]) : run("sh", ["-lc", `command -v ${command}`]);
  return probe.ok;
}
