import { createCheckpoint } from "./checkpoints.js";
import type { SelectionResult } from "./types.js";
import { composeTeamFromSelection } from "./team-composer.js";
import { createTeamRun } from "./team-state.js";
import { historicalAgentWeights, loadTeamMetrics } from "./team-metrics.js";

export async function startTeamForSelection(root: string, task: string, selection: SelectionResult) {
  const metrics = await loadTeamMetrics(root);
  const weights = historicalAgentWeights(metrics, selection.request.taskType);
  const adjusted: SelectionResult = {
    ...selection,
    agents: [...selection.agents].sort((a, b) => {
      const aScore = a.score + (weights[a.candidate.id] ?? 0);
      const bScore = b.score + (weights[b.candidate.id] ?? 0);
      return bScore - aScore;
    }),
  };
  const composition = composeTeamFromSelection(task, adjusted);
  const state = await createTeamRun(root, composition);
  await createCheckpoint(root, "team-start", {
    phase: state.currentPhase,
    activeTask: task,
    teamRunId: state.id,
    teamPhase: state.currentPhase,
    capabilities: [
      ...adjusted.skills.map((item) => item.candidate.id),
      ...adjusted.agents.map((item) => item.candidate.id),
      ...adjusted.tools.map((item) => item.candidate.id),
      ...adjusted.mcps.map((item) => item.candidate.id),
    ],
    next: composition.phases.find((phase) => phase.id === state.currentPhase)?.outputs ?? [],
  });
  return { composition, state, historicalWeights: weights };
}
