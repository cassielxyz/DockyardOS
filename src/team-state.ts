import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { createCheckpoint } from "./checkpoints.js";
import { readJson, writeJsonAtomic } from "./fs-utils.js";
import { projectDirectory, requireProject } from "./project.js";
import { recordTeamOutcome } from "./team-metrics.js";
import type { TeamComposition, TeamHandoff, TeamPhaseId, TeamRunState } from "./team-types.js";

function runPath(projectId: string, runId: string): string {
  return resolve(projectDirectory(projectId), "teams", `${runId}.json`);
}

function activePath(projectId: string): string {
  return resolve(projectDirectory(projectId), "teams", "active.json");
}

function firstRunnablePhase(composition: TeamComposition): TeamPhaseId {
  return composition.phases.find((phase) => phase.status !== "skipped")?.id ?? "implementation";
}

export async function createTeamRun(root: string, composition: TeamComposition): Promise<TeamRunState> {
  const project = await requireProject(root);
  const now = new Date().toISOString();
  const currentPhase = firstRunnablePhase(composition);
  const state: TeamRunState = {
    schemaVersion: 1,
    id: `${now.replace(/[-:.]/g, "")}-${randomUUID().slice(0, 8)}`,
    projectId: project.id,
    task: composition.task,
    createdAt: now,
    updatedAt: now,
    status: "active",
    currentPhase,
    composition,
    phases: composition.phases.map((phase) => ({
      id: phase.id,
      status: phase.status === "skipped" ? "skipped" : phase.id === currentPhase ? "active" : "pending",
      ...(phase.id === currentPhase ? { startedAt: now } : {}),
      artifactRefs: [],
      activeAgents: phase.id === currentPhase ? phase.assignments.map((item) => item.agentId) : [],
      worktrees: [],
    })),
    decisions: [],
    failures: [],
  };
  await writeJsonAtomic(runPath(project.id, state.id), state);
  await writeJsonAtomic(activePath(project.id), { runId: state.id, updatedAt: now });
  return state;
}

export async function loadTeamRun(root: string, runId?: string): Promise<TeamRunState | undefined> {
  const project = await requireProject(root);
  let id = runId;
  if (!id) id = (await readJson<{ runId: string }>(activePath(project.id)))?.runId;
  return id ? readJson<TeamRunState>(runPath(project.id, id)) : undefined;
}

async function saveTeamRun(state: TeamRunState): Promise<void> {
  state.updatedAt = new Date().toISOString();
  await writeJsonAtomic(runPath(state.projectId, state.id), state);
  if (state.status === "active" || state.status === "blocked") {
    await writeJsonAtomic(activePath(state.projectId), { runId: state.id, updatedAt: state.updatedAt });
  }
}

function nextPhase(state: TeamRunState, current: TeamPhaseId): TeamPhaseId | undefined {
  const index = state.composition.phases.findIndex((phase) => phase.id === current);
  return state.composition.phases.slice(index + 1).find((phase) => phase.status !== "skipped")?.id;
}

export async function completeTeamPhase(
  root: string,
  options: { runId?: string; notes?: string; artifacts?: string[]; decisions?: string[]; unresolved?: string[] } = {},
): Promise<{ state: TeamRunState; handoff?: TeamHandoff }> {
  const state = await loadTeamRun(root, options.runId);
  if (!state) throw new Error("No active DockyardOS team run.");
  if (state.status === "completed" || state.status === "cancelled") throw new Error(`Team run is already ${state.status}.`);
  const now = new Date().toISOString();
  const runtime = state.phases.find((phase) => phase.id === state.currentPhase);
  if (!runtime) throw new Error(`Missing runtime for phase ${state.currentPhase}.`);
  runtime.status = "completed";
  runtime.completedAt = now;
  runtime.activeAgents = [];
  if (options.notes) runtime.notes = options.notes;
  runtime.artifactRefs.push(...(options.artifacts ?? []));
  state.decisions.push(...(options.decisions ?? []));

  const upcoming = nextPhase(state, state.currentPhase);
  if (!upcoming) {
    state.status = "completed";
    await saveTeamRun(state);
    await recordTeamOutcome(root, state, "success");
    await createCheckpoint(root, "team-complete", {
      phase: "completed",
      activeTask: state.task,
      teamRunId: state.id,
      teamPhase: state.currentPhase,
      next: [],
    });
    return { state };
  }

  const previous = state.currentPhase;
  state.currentPhase = upcoming;
  const nextRuntime = state.phases.find((phase) => phase.id === upcoming)!;
  nextRuntime.status = "active";
  nextRuntime.startedAt = now;
  nextRuntime.activeAgents = state.composition.phases.find((phase) => phase.id === upcoming)?.assignments.map((item) => item.agentId) ?? [];
  state.status = (options.unresolved?.length ?? 0) > 0 ? "blocked" : "active";
  await saveTeamRun(state);

  const nextPlan = state.composition.phases.find((phase) => phase.id === upcoming)!;
  await createCheckpoint(root, "team-phase-transition", {
    phase: upcoming,
    activeTask: state.task,
    teamRunId: state.id,
    teamPhase: upcoming,
    blocked: options.unresolved ?? [],
    next: nextPlan.outputs,
  });

  const handoff: TeamHandoff = {
    runId: state.id,
    fromPhase: previous,
    toPhase: upcoming,
    task: state.task,
    completedOutputs: runtime.artifactRefs,
    decisions: state.decisions.slice(-20),
    unresolved: options.unresolved ?? [],
    activeAgents: nextRuntime.activeAgents,
    requiredGates: nextPlan.gates,
    instruction: `Continue DockyardOS team run ${state.id} in ${upcoming}. Use only the compact handoff plus phase-relevant repository context; do not replay the full prior transcript.`,
  };
  return { state, handoff };
}

export async function unblockTeamRun(root: string, runId?: string): Promise<TeamRunState> {
  const state = await loadTeamRun(root, runId);
  if (!state) throw new Error("No active DockyardOS team run.");
  if (state.status === "blocked") state.status = "active";
  await saveTeamRun(state);
  await createCheckpoint(root, "team-unblocked", { phase: state.currentPhase, activeTask: state.task, teamRunId: state.id, teamPhase: state.currentPhase, blocked: [] });
  return state;
}

export async function recordTeamFailure(root: string, input: { runId?: string; agentId?: string; summary: string }): Promise<TeamRunState> {
  const state = await loadTeamRun(root, input.runId);
  if (!state) throw new Error("No active DockyardOS team run.");
  state.failures.push({ phase: state.currentPhase, ...(input.agentId ? { agentId: input.agentId } : {}), summary: input.summary, at: new Date().toISOString() });
  state.status = "blocked";
  const runtime = state.phases.find((phase) => phase.id === state.currentPhase);
  if (runtime) runtime.status = "blocked";
  await saveTeamRun(state);
  await createCheckpoint(root, "team-blocked", {
    phase: state.currentPhase,
    activeTask: state.task,
    teamRunId: state.id,
    teamPhase: state.currentPhase,
    blocked: [input.summary],
  });
  return state;
}

export async function failTeamRun(root: string, input: { runId?: string; summary: string }): Promise<TeamRunState> {
  const state = await loadTeamRun(root, input.runId);
  if (!state) throw new Error("No active DockyardOS team run.");
  if (state.status === "completed") throw new Error("Cannot fail a completed team run.");
  state.failures.push({ phase: state.currentPhase, summary: input.summary, at: new Date().toISOString() });
  state.status = "cancelled";
  const runtime = state.phases.find((phase) => phase.id === state.currentPhase);
  if (runtime) {
    runtime.status = "blocked";
    runtime.activeAgents = [];
  }
  await saveTeamRun(state);
  await recordTeamOutcome(root, state, "failure");
  await createCheckpoint(root, "team-failed", {
    phase: state.currentPhase,
    activeTask: state.task,
    teamRunId: state.id,
    teamPhase: state.currentPhase,
    blocked: [input.summary],
  });
  return state;
}

export async function attachWorktree(root: string, input: { runId?: string; taskId: string; agentId: string; branch: string; path: string }): Promise<TeamRunState> {
  const state = await loadTeamRun(root, input.runId);
  if (!state) throw new Error("No active DockyardOS team run.");
  const phase = state.phases.find((item) => item.id === state.currentPhase);
  if (!phase) throw new Error(`Missing runtime for phase ${state.currentPhase}.`);
  if (!phase.worktrees.some((item) => item.taskId === input.taskId)) phase.worktrees.push({ taskId: input.taskId, agentId: input.agentId, branch: input.branch, path: input.path });
  await saveTeamRun(state);
  return state;
}

export function teamRunSummary(state: TeamRunState): Record<string, unknown> {
  const phasePlan = state.composition.phases.find((phase) => phase.id === state.currentPhase);
  const runtime = state.phases.find((phase) => phase.id === state.currentPhase);
  return {
    id: state.id,
    task: state.task,
    status: state.status,
    currentPhase: state.currentPhase,
    activeAgents: runtime?.activeAgents ?? [],
    gates: phasePlan?.gates ?? [],
    inputs: phasePlan?.inputs ?? [],
    expectedOutputs: phasePlan?.outputs ?? [],
    worktrees: runtime?.worktrees ?? [],
    recentDecisions: state.decisions.slice(-10),
    failures: state.failures.slice(-5),
    updatedAt: state.updatedAt,
  };
}
