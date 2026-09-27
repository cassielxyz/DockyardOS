import type { CheckpointState, OperatingMode, SessionState } from "./types.js";
import { createCheckpoint, loadLatestCheckpoint, maybeCheckpoint, writeSession } from "./checkpoints.js";
import { evaluateTool } from "./policy.js";
import { findWorkspaceRoot, initProject, loadProject } from "./project.js";
import { loadTeamRun } from "./team-state.js";

interface HookPayload {
  conversationId?: string;
  workspacePaths?: string[];
  transcriptPath?: string;
  artifactDirectoryPath?: string;
  modelName?: string;
  error?: string;
  toolCall?: {
    name?: string;
    args?: Record<string, unknown>;
  };
}

async function projectForPayload(payload: HookPayload) {
  const candidate = payload.workspacePaths?.[0] ?? process.cwd();
  const root = findWorkspaceRoot(candidate);
  return (await loadProject(root)) ?? initProject(root);
}

export async function handlePreTool(payload: HookPayload): Promise<Record<string, unknown>> {
  const project = await projectForPayload(payload);
  const toolName = payload.toolCall?.name ?? "unknown";
  const decision = evaluateTool(toolName, payload.toolCall?.args, project.mode as OperatingMode);
  return { ...decision };
}

export async function handlePostTool(payload: HookPayload): Promise<Record<string, unknown>> {
  if (payload.error) return {};
  const project = await projectForPayload(payload);
  const mutating = ["run_command", "write_to_file", "replace_file_content", "multi_replace_file_content"].includes(payload.toolCall?.name ?? "");
  if (mutating) {
    const team = await loadTeamRun(project.root).catch(() => undefined);
    await maybeCheckpoint(project.root, "antigravity-auto");
    if (team && team.status !== "completed" && team.status !== "cancelled") {
      const latest = await loadLatestCheckpoint(project.root).catch(() => undefined);
      if (latest && (latest.state.teamRunId !== team.id || latest.state.teamPhase !== team.currentPhase)) {
        await createCheckpoint(project.root, "antigravity-team-phase", { teamRunId: team.id, teamPhase: team.currentPhase, phase: team.currentPhase, activeTask: team.task });
      }
    }
  }
  return {};
}

export async function handlePreInvocation(payload: HookPayload): Promise<Record<string, unknown>> {
  const project = await projectForPayload(payload);
  const session: SessionState = {
    ...(payload.conversationId ? { conversationId: payload.conversationId } : {}),
    ...(payload.transcriptPath ? { transcriptPath: payload.transcriptPath } : {}),
    ...(payload.artifactDirectoryPath ? { artifactDirectoryPath: payload.artifactDirectoryPath } : {}),
    ...(payload.modelName ? { modelName: payload.modelName } : {}),
    updatedAt: new Date().toISOString(),
  };
  await writeSession(project.id, session);
  const latest = await loadLatestCheckpoint(project.root).catch(() => undefined);
  const team = await loadTeamRun(project.root).catch(() => undefined);
  const state = latest?.state;
  const teamPlan = team?.composition.phases.find((phase) => phase.id === team.currentPhase);
  const teamRuntime = team?.phases.find((phase) => phase.id === team.currentPhase);
  const lines = [
    `DockyardOS project: ${project.name}`,
    `Operating mode: ${project.mode}`,
    latest ? `Recovered checkpoint: ${latest.id} (${latest.reason}, ${latest.createdAt})` : "No prior checkpoint. Treat this as the first DockyardOS session for the project.",
    state?.phase ? `Checkpoint phase: ${state.phase}` : "",
    state?.activeTask ? `Checkpoint task: ${state.activeTask}` : "",
    state?.completed.length ? `Completed: ${state.completed.join("; ")}` : "",
    state?.blocked.length ? `Blocked: ${state.blocked.join("; ")}` : "",
    state?.next.length ? `Next: ${state.next.join("; ")}` : "",
    team && team.status !== "completed" && team.status !== "cancelled" ? `Active team run: ${team.id} (${team.status})` : "",
    team && team.status !== "completed" && team.status !== "cancelled" ? `Team phase: ${team.currentPhase}` : "",
    teamRuntime?.activeAgents.length ? `Phase agents: ${teamRuntime.activeAgents.join(", ")}` : "",
    teamPlan?.gates.length ? `Phase gates: ${teamPlan.gates.join(", ")}` : "",
    teamPlan?.inputs.length ? `Use inputs: ${teamPlan.inputs.join(", ")}` : "",
    teamPlan?.outputs.length ? `Expected outputs: ${teamPlan.outputs.join(", ")}` : "",
    teamRuntime?.worktrees.length ? `Active isolated worktrees: ${teamRuntime.worktrees.map((item) => `${item.agentId}=${item.path}`).join("; ")}` : "",
    team?.status === "blocked" ? "Team run is blocked. Resolve the recorded blocker before advancing phases." : "",
    team && team.status !== "completed" && team.status !== "cancelled"
      ? "Continue only the active DockyardOS team phase. Use compact handoffs and phase-relevant context; do not reactivate every specialist or replay the full previous transcript. Independent reviewers must remain separate from implementation writers."
      : "Continue from recovered state; do not redo completed work. For substantial work, use DockyardOS team composition before implementation.",
    "Before major phase transitions, record structured state. DockyardOS approval hooks remain authoritative for risky actions.",
  ].filter(Boolean);
  return { injectSteps: [{ ephemeralMessage: lines.join("\n") }] };
}

export async function handleStop(payload: HookPayload): Promise<Record<string, unknown>> {
  const project = await projectForPayload(payload);
  const latest = await loadLatestCheckpoint(project.root).catch(() => undefined);
  const team = await loadTeamRun(project.root).catch(() => undefined);
  const state: Partial<CheckpointState> = {
    ...(latest?.state ?? {}),
    ...(team && team.status !== "completed" && team.status !== "cancelled"
      ? { teamRunId: team.id, teamPhase: team.currentPhase, phase: team.currentPhase, activeTask: team.task }
      : {}),
  };
  await createCheckpoint(project.root, "antigravity-stop", state);
  return {};
}
