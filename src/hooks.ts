import type { CheckpointState, OperatingMode, SessionState } from "./types.js";
import { createCheckpoint, loadLatestCheckpoint, maybeCheckpoint, writeSession } from "./checkpoints.js";
import { evaluateTool } from "./policy.js";
import { findWorkspaceRoot, initProject, loadProject } from "./project.js";

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
  if (mutating) await maybeCheckpoint(project.root, "antigravity-auto");
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
  const state = latest?.state;
  const lines = [
    `DockyardOS project: ${project.name}`,
    `Operating mode: ${project.mode}`,
    latest ? `Recovered checkpoint: ${latest.id} (${latest.reason}, ${latest.createdAt})` : "No prior checkpoint. Treat this as the first DockyardOS session for the project.",
    state?.phase ? `Phase: ${state.phase}` : "",
    state?.activeTask ? `Active task: ${state.activeTask}` : "",
    state?.completed.length ? `Completed: ${state.completed.join("; ")}` : "",
    state?.blocked.length ? `Blocked: ${state.blocked.join("; ")}` : "",
    state?.next.length ? `Next: ${state.next.join("; ")}` : "",
    "Continue from recovered state; do not redo completed work. Before major phase transitions, record a structured checkpoint with `dockyard checkpoint`. Use specialist skills/subagents and security verification when relevant. DockyardOS approval hooks remain authoritative for risky actions.",
  ].filter(Boolean);
  return { injectSteps: [{ ephemeralMessage: lines.join("\n") }] };
}

export async function handleStop(payload: HookPayload): Promise<Record<string, unknown>> {
  const project = await projectForPayload(payload);
  const latest = await loadLatestCheckpoint(project.root).catch(() => undefined);
  const state: Partial<CheckpointState> | undefined = latest ? latest.state : undefined;
  await createCheckpoint(project.root, "antigravity-stop", state);
  return {};
}
