import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { writeJsonAtomic } from "./fs-utils.js";
import { commandExists, run } from "./process.js";
import { dockyardHome } from "./project.js";

export type CommunityCanaryBackend = "docker" | "podman";
export type CommunityCanaryStatus = "pass" | "fail" | "unavailable" | "error";

export interface CommunityCanaryRequest {
  packageId: string;
  packagePath: string;
  image: string;
  command: string;
  args?: string[];
  backend?: CommunityCanaryBackend;
  timeoutSeconds?: number;
}

export interface CommunityCanaryPlan {
  runId: string;
  packageId: string;
  backend: CommunityCanaryBackend;
  packagePath: string;
  image: string;
  command: string;
  args: string[];
  timeoutSeconds: number;
  runnerArgs: string[];
  artifactPath: string;
}

export interface CommunityCanaryResult {
  runId: string;
  packageId: string;
  backend: CommunityCanaryBackend;
  image: string;
  status: CommunityCanaryStatus;
  exitCode: number | null;
  startedAt: string;
  finishedAt: string;
  summary: string;
  stdout: string;
  stderr: string;
  artifactPath: string;
}

const SAFE_ID = /^[a-z0-9][a-z0-9._-]{1,79}$/;
const PINNED_IMAGE = /^[A-Za-z0-9._/:+-]+@sha256:[a-f0-9]{64}$/i;
const SAFE_COMMAND = /^[A-Za-z0-9._/+:-]{1,256}$/;

function isInside(root: string, candidate: string): boolean {
  const rel = relative(resolve(root), resolve(candidate));
  return rel === "" || (!rel.startsWith("..") && !rel.startsWith("/") && !rel.startsWith("\\"));
}

function quarantineRoot(): string {
  return resolve(dockyardHome(), "community", "quarantine");
}

function selectBackend(preferred?: CommunityCanaryBackend): CommunityCanaryBackend {
  if (preferred) return preferred;
  if (commandExists("docker")) return "docker";
  if (commandExists("podman")) return "podman";
  return "docker";
}

function validateRequest(request: CommunityCanaryRequest): { packagePath: string; timeoutSeconds: number; args: string[] } {
  if (!SAFE_ID.test(request.packageId)) throw new Error("Invalid community package id for canary.");
  const packagePath = resolve(request.packagePath);
  if (!isInside(quarantineRoot(), packagePath)) throw new Error("Community canary packagePath must be inside DockyardOS quarantine storage.");
  if (packagePath.includes(",")) throw new Error("Community canary package path may not contain commas because the container mount syntax would become ambiguous.");
  if (!PINNED_IMAGE.test(request.image)) throw new Error("Community canary image must be digest-pinned (name@sha256:<64 hex>). DockyardOS refuses floating image tags.");
  if (!SAFE_COMMAND.test(request.command) || request.command.includes("..")) throw new Error("Community canary command must be a bounded direct executable path/name without traversal or shell syntax.");
  const args = request.args ?? [];
  if (args.length > 64) throw new Error("Community canary supports at most 64 command arguments.");
  for (const arg of args) {
    if (arg.includes("\0") || arg.length > 4096) throw new Error("Community canary argument is invalid or too large.");
  }
  const timeoutSeconds = request.timeoutSeconds ?? 60;
  if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 300) throw new Error("Community canary timeoutSeconds must be an integer between 1 and 300.");
  return { packagePath, timeoutSeconds, args };
}

export function planCommunityCanary(request: CommunityCanaryRequest): CommunityCanaryPlan {
  const validated = validateRequest(request);
  const backend = selectBackend(request.backend);
  const runId = `${new Date().toISOString().replace(/[-:.]/g, "")}-${randomUUID().slice(0, 8)}`;
  const artifactPath = resolve(dockyardHome(), "community", "canary", request.packageId, `${runId}.json`);
  const runnerArgs = [
    "run",
    "--rm",
    "--pull=never",
    "--network=none",
    "--read-only",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges:true",
    "--pids-limit=128",
    "--memory=256m",
    "--cpus=1",
    "--user=65534:65534",
    "--tmpfs=/tmp:rw,noexec,nosuid,size=64m",
    `--mount=type=bind,src=${validated.packagePath},dst=/workspace,readonly`,
    "--workdir=/workspace",
    "--env=HOME=/tmp",
    request.image,
    request.command,
    ...validated.args,
  ];
  return {
    runId,
    packageId: request.packageId,
    backend,
    packagePath: validated.packagePath,
    image: request.image,
    command: request.command,
    args: validated.args,
    timeoutSeconds: validated.timeoutSeconds,
    runnerArgs,
    artifactPath,
  };
}

export async function executeCommunityCanary(plan: CommunityCanaryPlan): Promise<CommunityCanaryResult> {
  const startedAt = new Date().toISOString();
  await mkdir(resolve(plan.artifactPath, ".."), { recursive: true, mode: 0o700 });

  if (!commandExists(plan.backend)) {
    const result: CommunityCanaryResult = {
      runId: plan.runId,
      packageId: plan.packageId,
      backend: plan.backend,
      image: plan.image,
      status: "unavailable",
      exitCode: null,
      startedAt,
      finishedAt: new Date().toISOString(),
      summary: `Required isolated canary backend is unavailable: ${plan.backend}. DockyardOS will not execute community code directly on the host.`,
      stdout: "",
      stderr: "",
      artifactPath: plan.artifactPath,
    };
    await writeJsonAtomic(plan.artifactPath, result);
    return result;
  }

  const inspected = run(plan.backend, ["image", "inspect", plan.image], { timeoutMs: 10_000, maxOutputBytes: 16_384 });
  if (!inspected.ok) {
    const result: CommunityCanaryResult = {
      runId: plan.runId,
      packageId: plan.packageId,
      backend: plan.backend,
      image: plan.image,
      status: "unavailable",
      exitCode: inspected.status,
      startedAt,
      finishedAt: new Date().toISOString(),
      summary: "Pinned canary image is not already available locally. DockyardOS refuses to auto-pull images during community canary execution.",
      stdout: inspected.stdout,
      stderr: inspected.stderr,
      artifactPath: plan.artifactPath,
    };
    await writeJsonAtomic(plan.artifactPath, result);
    return result;
  }

  const executed = run(plan.backend, plan.runnerArgs, {
    timeoutMs: plan.timeoutSeconds * 1000,
    maxOutputBytes: 64 * 1024,
  });
  const status: CommunityCanaryStatus = executed.timedOut ? "error" : executed.status === 0 ? "pass" : "fail";
  const result: CommunityCanaryResult = {
    runId: plan.runId,
    packageId: plan.packageId,
    backend: plan.backend,
    image: plan.image,
    status,
    exitCode: executed.status,
    startedAt,
    finishedAt: new Date().toISOString(),
    summary: executed.timedOut
      ? "Sandboxed community canary exceeded its timeout."
      : executed.status === 0
        ? "Sandboxed community canary completed successfully."
        : "Sandboxed community canary exited unsuccessfully; activation must remain blocked until reviewed/fixed.",
    stdout: executed.stdout,
    stderr: executed.stderr,
    artifactPath: plan.artifactPath,
  };
  await writeJsonAtomic(plan.artifactPath, result);
  return result;
}
