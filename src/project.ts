import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { basename, resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import type { OperatingMode, ProjectConfig } from "./types.js";
import { readJson, writeJsonAtomic } from "./fs-utils.js";
import { run } from "./process.js";

export function dockyardHome(): string {
  return process.env.DOCKYARD_HOME ? resolve(process.env.DOCKYARD_HOME) : resolve(homedir(), ".dockyardos");
}

export function projectsHome(): string {
  return resolve(dockyardHome(), "projects");
}

export function normalizeRemote(remote: string): string {
  const value = remote.trim();
  if (!value) return "";

  const scpMatch = value.match(/^(?:[^@]+@)?([^:]+):(.+)$/);
  if (scpMatch && !value.includes("://")) {
    const host = scpMatch[1]!.toLowerCase();
    const path = scpMatch[2]!.replace(/^\/+/, "").replace(/\.git$/, "");
    return `${host}/${path}`;
  }

  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    const path = url.pathname.replace(/^\/+/, "").replace(/\.git$/, "");
    return `${url.hostname.toLowerCase()}/${path}`;
  } catch {
    return value.replace(/\.git$/, "");
  }
}

export function findWorkspaceRoot(start = process.cwd()): string {
  const candidate = resolve(start);
  const gitRoot = run("git", ["rev-parse", "--show-toplevel"], candidate);
  return gitRoot.ok && gitRoot.stdout ? resolve(gitRoot.stdout) : candidate;
}

export function projectSourceKey(root: string): string {
  const remote = run("git", ["config", "--get", "remote.origin.url"], root);
  const normalized = remote.ok ? normalizeRemote(remote.stdout) : "";
  return normalized ? `git:${normalized}` : `path:${resolve(root)}`;
}

export function projectIdForRoot(root: string): string {
  return createHash("sha256").update(`dockyardos:${projectSourceKey(root)}`).digest("hex").slice(0, 20);
}

export function projectDirectory(projectId: string): string {
  return resolve(projectsHome(), projectId);
}

export async function loadProject(root = findWorkspaceRoot()): Promise<ProjectConfig | undefined> {
  const id = projectIdForRoot(root);
  return readJson<ProjectConfig>(resolve(projectDirectory(id), "project.json"));
}

export async function initProject(
  root = findWorkspaceRoot(),
  options: { name?: string; mode?: OperatingMode } = {},
): Promise<ProjectConfig> {
  const canonicalRoot = resolve(root);
  const id = projectIdForRoot(canonicalRoot);
  const directory = projectDirectory(id);
  const existing = await readJson<ProjectConfig>(resolve(directory, "project.json"));
  const now = new Date().toISOString();
  const config: ProjectConfig = existing
    ? {
        ...existing,
        root: canonicalRoot,
        name: options.name ?? existing.name,
        mode: options.mode ?? existing.mode,
        updatedAt: now,
      }
    : {
        schemaVersion: 1,
        id,
        name: options.name ?? basename(canonicalRoot),
        root: canonicalRoot,
        sourceKey: projectSourceKey(canonicalRoot),
        createdAt: now,
        updatedAt: now,
        mode: options.mode ?? "balanced",
        checkpointIntervalMinutes: 5,
        maxCheckpoints: 100,
      };
  await mkdir(resolve(directory, "checkpoints"), { recursive: true });
  await writeJsonAtomic(resolve(directory, "project.json"), config);
  return config;
}

export async function requireProject(root = findWorkspaceRoot()): Promise<ProjectConfig> {
  const project = await loadProject(root);
  if (!project) throw new Error("DockyardOS is not initialized for this project. Run: dockyard init");
  return project;
}
