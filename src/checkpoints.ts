import { randomUUID } from "node:crypto";
import { mkdir, readdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import type { Checkpoint, CheckpointState, SessionState } from "./types.js";
import { captureGitSnapshot } from "./git.js";
import { projectDirectory, requireProject } from "./project.js";
import { readJson, writeJsonAtomic } from "./fs-utils.js";

function checkpointId(now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:.]/g, "").replace("Z", "Z");
  return `${stamp}-${randomUUID().slice(0, 8)}`;
}

function emptyState(): CheckpointState {
  return { completed: [], blocked: [], next: [], capabilities: [] };
}

export async function readSession(projectId: string): Promise<SessionState | undefined> {
  return readJson<SessionState>(resolve(projectDirectory(projectId), "session.json"));
}

export async function writeSession(projectId: string, session: SessionState): Promise<void> {
  await writeJsonAtomic(resolve(projectDirectory(projectId), "session.json"), session);
}

export async function loadLatestCheckpoint(root?: string): Promise<Checkpoint | undefined> {
  const project = await requireProject(root);
  const pointer = await readJson<{ id: string }>(resolve(projectDirectory(project.id), "latest.json"));
  if (!pointer) return undefined;
  return readJson<Checkpoint>(resolve(projectDirectory(project.id), "checkpoints", pointer.id, "checkpoint.json"));
}

export async function createCheckpoint(
  root: string | undefined,
  reason: string,
  state?: Partial<CheckpointState>,
): Promise<Checkpoint> {
  const project = await requireProject(root);
  const id = checkpointId();
  const dir = resolve(projectDirectory(project.id), "checkpoints", id);
  await mkdir(dir, { recursive: true });

  const previous = await loadLatestCheckpoint(project.root).catch(() => undefined);
  const previousState = previous?.state ?? emptyState();
  const mergedState: CheckpointState = {
    ...previousState,
    ...state,
    completed: state?.completed ?? previousState.completed,
    blocked: state?.blocked ?? previousState.blocked,
    next: state?.next ?? previousState.next,
    capabilities: state?.capabilities ?? previousState.capabilities,
  };
  const git = await captureGitSnapshot(project.root, resolve(dir, "workspace.patch"));
  const session = await readSession(project.id);
  const checkpoint: Checkpoint = {
    schemaVersion: 1,
    id,
    projectId: project.id,
    createdAt: new Date().toISOString(),
    reason,
    git,
    state: mergedState,
    ...(session ? { session } : {}),
  };
  await writeJsonAtomic(resolve(dir, "checkpoint.json"), checkpoint);
  await writeJsonAtomic(resolve(projectDirectory(project.id), "latest.json"), { id, createdAt: checkpoint.createdAt });
  await pruneCheckpoints(project.id, project.maxCheckpoints);
  return checkpoint;
}

export async function maybeCheckpoint(root: string | undefined, reason: string): Promise<Checkpoint | undefined> {
  const project = await requireProject(root).catch(() => undefined);
  if (!project) return undefined;
  const latest = await loadLatestCheckpoint(project.root).catch(() => undefined);
  const elapsed = latest ? Date.now() - Date.parse(latest.createdAt) : Number.POSITIVE_INFINITY;
  if (elapsed < project.checkpointIntervalMinutes * 60_000) return undefined;
  return createCheckpoint(project.root, reason);
}

async function pruneCheckpoints(projectId: string, max: number): Promise<void> {
  const base = resolve(projectDirectory(projectId), "checkpoints");
  const entries = (await readdir(base, { withFileTypes: true }))
    .filter((entry: any) => entry.isDirectory())
    .map((entry: any) => entry.name as string)
    .sort();
  const excess = entries.slice(0, Math.max(0, entries.length - max));
  await Promise.all(excess.map((name: string) => rm(resolve(base, name), { recursive: true, force: true })));
}
