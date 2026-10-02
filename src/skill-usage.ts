import { resolve } from "node:path";
import { activeCommunityPackages } from "./community-runtime.js";
import { readJson, writeJsonAtomic } from "./fs-utils.js";
import { projectDirectory, projectIdForRoot } from "./project.js";
import { catalog } from "./registry.js";

export interface SkillUsageEntry {
  id: string;
  displayName: string;
  source: "bundled" | "global-package";
  revision?: string;
  firstUsedAt?: string;
  lastUsedAt?: string;
  uses: number;
}

export interface ProjectSkillUsageState {
  schemaVersion: 1;
  projectId: string;
  updatedAt: string;
  lastLoaded: string[];
  utilized: Record<string, SkillUsageEntry>;
}

export interface SkillDashboardState {
  schemaVersion: 1;
  projectId: string;
  generatedAt: string;
  installed: SkillUsageEntry[];
  loaded: SkillUsageEntry[];
  utilized: SkillUsageEntry[];
}

function usagePath(root: string): string {
  return resolve(projectDirectory(projectIdForRoot(root)), "skill-usage.json");
}

function bundledSkills(): SkillUsageEntry[] {
  return catalog
    .filter((candidate) => candidate.kind === "skill" && candidate.source.type === "dockyard")
    .map((candidate) => ({
      id: candidate.id,
      displayName: candidate.displayName,
      source: "bundled" as const,
      uses: 0,
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

async function globallyInstalledSkills(): Promise<SkillUsageEntry[]> {
  const bundled = bundledSkills();
  const active = await activeCommunityPackages();
  const packages = active
    .filter((item) => item.entrypoints.some((entrypoint) => entrypoint.type === "skill"))
    .map((item) => ({
      id: item.id,
      displayName: item.displayName,
      source: "global-package" as const,
      revision: item.revision,
      uses: 0,
    }));
  const byId = new Map<string, SkillUsageEntry>();
  for (const item of [...bundled, ...packages]) byId.set(item.id, item);
  return [...byId.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function loadProjectSkillUsage(root: string): Promise<ProjectSkillUsageState> {
  const projectId = projectIdForRoot(root);
  return (await readJson<ProjectSkillUsageState>(usagePath(root))) ?? {
    schemaVersion: 1,
    projectId,
    updatedAt: new Date(0).toISOString(),
    lastLoaded: [],
    utilized: {},
  };
}

export async function recordProjectSkillUsage(
  root: string,
  loadedSkillIds: string[],
): Promise<ProjectSkillUsageState> {
  const current = await loadProjectSkillUsage(root);
  const installed = await globallyInstalledSkills();
  const installedById = new Map(installed.map((entry) => [entry.id, entry]));
  const now = new Date().toISOString();
  const lastLoaded = [...new Set(loadedSkillIds.filter((id) => installedById.has(id)))];
  const utilized = { ...current.utilized };

  for (const id of lastLoaded) {
    const installedEntry = installedById.get(id)!;
    const previous = utilized[id];
    utilized[id] = {
      ...installedEntry,
      firstUsedAt: previous?.firstUsedAt ?? now,
      lastUsedAt: now,
      uses: (previous?.uses ?? 0) + 1,
    };
  }

  const next: ProjectSkillUsageState = {
    schemaVersion: 1,
    projectId: current.projectId,
    updatedAt: now,
    lastLoaded,
    utilized,
  };
  await writeJsonAtomic(usagePath(root), next);
  return next;
}

export async function skillDashboardState(root: string): Promise<SkillDashboardState> {
  const current = await loadProjectSkillUsage(root);
  const installed = await globallyInstalledSkills();
  const installedById = new Map(installed.map((entry) => [entry.id, entry]));
  const loaded = current.lastLoaded
    .map((id) => {
      const base = installedById.get(id);
      const used = current.utilized[id];
      return base ? { ...base, ...(used ?? {}) } : undefined;
    })
    .filter((entry): entry is SkillUsageEntry => Boolean(entry));
  const utilized = Object.values(current.utilized)
    .filter((entry) => installedById.has(entry.id))
    .sort((a, b) => (b.lastUsedAt ?? "").localeCompare(a.lastUsedAt ?? "") || a.displayName.localeCompare(b.displayName));

  return {
    schemaVersion: 1,
    projectId: current.projectId,
    generatedAt: new Date().toISOString(),
    installed,
    loaded,
    utilized,
  };
}
