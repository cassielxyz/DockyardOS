import { resolve } from "node:path";
import { readJson, writeJsonAtomic } from "./fs-utils.js";
import { projectDirectory, requireProject } from "./project.js";
import type { TeamRunState } from "./team-types.js";

export interface TeamMetricCounter {
  runs: number;
  successes: number;
  failures: number;
  blockedRuns: number;
  lastUpdatedAt: string;
}

export interface TeamMetrics {
  schemaVersion: 1;
  recipes: Record<string, TeamMetricCounter>;
  agents: Record<string, Record<string, TeamMetricCounter>>;
}

function emptyCounter(now: string): TeamMetricCounter {
  return { runs: 0, successes: 0, failures: 0, blockedRuns: 0, lastUpdatedAt: now };
}

function metricsPath(projectId: string): string {
  return resolve(projectDirectory(projectId), "team-metrics.json");
}

export async function loadTeamMetrics(root: string): Promise<TeamMetrics> {
  const project = await requireProject(root);
  return (await readJson<TeamMetrics>(metricsPath(project.id))) ?? { schemaVersion: 1, recipes: {}, agents: {} };
}

function updateCounter(counter: TeamMetricCounter, outcome: "success" | "failure", blocked: boolean, now: string): void {
  counter.runs += 1;
  if (outcome === "success") counter.successes += 1;
  else counter.failures += 1;
  if (blocked) counter.blockedRuns += 1;
  counter.lastUpdatedAt = now;
}

export async function recordTeamOutcome(root: string, state: TeamRunState, outcome: "success" | "failure"): Promise<TeamMetrics> {
  const project = await requireProject(root);
  const metrics = await loadTeamMetrics(project.root);
  const now = new Date().toISOString();
  const recipeKey = state.composition.recipeId ?? `task:${state.composition.taskType}`;
  metrics.recipes[recipeKey] ??= emptyCounter(now);
  updateCounter(metrics.recipes[recipeKey]!, outcome, state.failures.length > 0, now);

  const agents = new Set(state.composition.phases.flatMap((phase) => phase.assignments.map((item) => item.agentId)));
  for (const agentId of agents) {
    metrics.agents[agentId] ??= {};
    metrics.agents[agentId]![state.composition.taskType] ??= emptyCounter(now);
    updateCounter(metrics.agents[agentId]![state.composition.taskType]!, outcome, state.failures.some((failure) => failure.agentId === agentId), now);
  }
  await writeJsonAtomic(metricsPath(project.id), metrics);
  return metrics;
}

export function agentHistoryAdjustment(metrics: TeamMetrics, agentId: string, taskType: string): number {
  const counter = metrics.agents[agentId]?.[taskType];
  if (!counter || counter.runs < 2) return 0;
  // Bayesian prior prevents one lucky run from dominating routing.
  const successRate = (counter.successes + 2) / (counter.runs + 4);
  const reliability = (successRate - 0.5) * 20;
  const blockPenalty = Math.min(6, (counter.blockedRuns / counter.runs) * 8);
  return Math.round(reliability - blockPenalty);
}

export function historicalAgentWeights(metrics: TeamMetrics, taskType: string): Record<string, number> {
  return Object.fromEntries(Object.keys(metrics.agents).map((agentId) => [agentId, agentHistoryAdjustment(metrics, agentId, taskType)]));
}

export function teamMetricsSummary(metrics: TeamMetrics): Record<string, unknown> {
  const recipes = Object.entries(metrics.recipes).map(([id, counter]) => ({ id, ...counter, successRate: counter.runs ? counter.successes / counter.runs : 0 }));
  const agents = Object.entries(metrics.agents).flatMap(([agentId, tasks]) => Object.entries(tasks).map(([taskType, counter]) => ({ agentId, taskType, ...counter, successRate: counter.runs ? counter.successes / counter.runs : 0 })));
  return { recipes, agents };
}
