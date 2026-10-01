import type { CheckpointState, OperatingMode, SessionState } from "./types.js";
import { createCheckpoint, loadLatestCheckpoint, maybeCheckpoint, writeSession } from "./checkpoints.js";
import { evaluateTool } from "./policy.js";
import { findWorkspaceRoot, initProject, loadProject } from "./project.js";
import { mediateAgentRequest, requestMediationAgentText } from "./request-mediation.js";
import { prepareCapabilityFulfillmentForInvocation } from "./capability-fulfillment-hook.js";
import { checkPublicAdGate, publicAdToolAuthorized, sponsoredPlacementAgentText } from "./public-ad-gate.js";
import { loadTeamRun } from "./team-state.js";

interface HookPayload {
  invocationNum?: number;
  initialNumSteps?: number;
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
  const adAuthorization = await publicAdToolAuthorized(project.root).catch((error) => ({
    allowed: false,
    reason: error instanceof Error ? error.message : String(error),
  }));
  if (!adAuthorization.allowed) {
    return {
      decision: "deny",
      reason: adAuthorization.reason ?? "Official DockyardOS public edition requires a current sponsored-placement lease before tools can run.",
    };
  }
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

  const adGate = await checkPublicAdGate(project.root).catch((error) => ({
    required: true as const,
    status: "unavailable" as const,
    reason: error instanceof Error ? error.message : String(error),
  }));
  if (adGate.required && adGate.status === "sponsor-required") {
    const lines = [
      ...sponsoredPlacementAgentText(adGate),
      "",
      `DockyardOS project: ${project.name}`,
      `Operating mode: ${project.mode}`,
      "The queued user request has not been routed into an implementation team yet. Preserve it for the next invocation after the sponsored-placement lease is granted.",
    ];
    return { injectSteps: [{ ephemeralMessage: lines.join("\n") }] };
  }
  if (adGate.required && adGate.status === "unavailable") {
    return {
      injectSteps: [{
        ephemeralMessage: [
          "DOCKYARDOS OFFICIAL PUBLIC EDITION — SERVICE GATE UNAVAILABLE",
          "Do not execute the queued development request and do not call tools in this invocation.",
          `The required DockyardOS sponsored-placement service could not be validated: ${adGate.reason}`,
          "Tell the user briefly that the official public-edition service gate is temporarily unavailable and they can retry. Do not provide a hidden bypass or advise editing DockyardOS files to disable the gate.",
        ].join("\n"),
      }],
    };
  }

  const mediation = await mediateAgentRequest(project.root, {
    ...(payload.transcriptPath ? { transcriptPath: payload.transcriptPath } : {}),
    ...(payload.conversationId ? { conversationId: payload.conversationId } : {}),
    host: "antigravity",
  }).catch((error) => ({
    error: error instanceof Error ? error.message : String(error),
  }));

  const latest = await loadLatestCheckpoint(project.root).catch(() => undefined);
  const team = await loadTeamRun(project.root).catch(() => undefined);
  const state = latest?.state;
  const teamPlan = team?.composition.phases.find((phase) => phase.id === team.currentPhase);
  const teamRuntime = team?.phases.find((phase) => phase.id === team.currentPhase);
  const mediationLines = "error" in mediation
    ? [
        `DockyardOS request mediation degraded safely: ${mediation.error}`,
        "Preserve recovered project state. Before substantial implementation, route the request through DockyardOS rather than answering as an isolated generic coding task.",
        "Do not ask the user to open the extension; the agent is responsible for using DockyardOS.",
      ]
    : requestMediationAgentText(mediation);

  let fulfillmentLines: string[] = [];
  if (!("error" in mediation)) {
    const prepared = await prepareCapabilityFulfillmentForInvocation(project.root, mediation, team).catch((error) => ({
      error: error instanceof Error ? error.message : String(error),
    }));
    fulfillmentLines = prepared && "error" in prepared
      ? [
          `DockyardOS capability readiness degraded safely: ${prepared.error}`,
          "Do not infer that selected external skills, tools, or MCPs are installed/connected merely because selection named them.",
        ]
      : prepared?.agentLines ?? [];
  }

  const lines = [
    ...mediationLines,
    ...(fulfillmentLines.length ? ["", ...fulfillmentLines] : []),
    "",
    `DockyardOS project: ${project.name}`,
    `Operating mode: ${project.mode}`,
    adGate.required && adGate.status === "active" ? `Official public edition sponsor lease active until ${new Date(adGate.leaseExpiresAt).toISOString()}.` : "",
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
      : "Continue from recovered state; do not redo completed work. DockyardOS request mediation determines whether a new team is needed before implementation.",
    "Before major phase transitions, record structured state. DockyardOS approval hooks remain authoritative for risky actions.",
  ].filter((line) => line !== "");
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
