import { loadLatestCheckpoint } from "./checkpoints.js";
import { requireProject } from "./project.js";
import { loadTeamRun } from "./team-state.js";
import type { HostId } from "./types.js";

export interface DockyardPortableContext {
  schemaVersion: 1;
  host: HostId | "vscode";
  project: {
    id: string;
    name: string;
    root: string;
    mode: string;
  };
  checkpoint?: {
    id: string;
    createdAt: string;
    reason: string;
    phase?: string;
    activeTask?: string;
    completed: string[];
    blocked: string[];
    next: string[];
    capabilities: string[];
    git: {
      branch?: string;
      head?: string;
      dirty: boolean;
    };
  };
  team?: {
    id: string;
    status: string;
    currentPhase: string;
    activeAgents: string[];
    requiredGates: string[];
    expectedOutputs: string[];
    worktrees: Array<{ taskId: string; agentId: string; branch: string; path: string }>;
    recentDecisions: string[];
    recentFailures: Array<{ phase: string; agentId?: string; summary: string; at: string }>;
  };
  instructions: string[];
  generatedAt: string;
}

export async function buildDockyardContext(root: string, host: HostId | "vscode" = "universal"): Promise<DockyardPortableContext> {
  const project = await requireProject(root);
  const checkpoint = await loadLatestCheckpoint(project.root).catch(() => undefined);
  const team = await loadTeamRun(project.root).catch(() => undefined);
  const activeTeam = team && (team.status === "active" || team.status === "blocked") ? team : undefined;
  const runtime = activeTeam?.phases.find((phase) => phase.id === activeTeam.currentPhase);
  const phase = activeTeam?.composition.phases.find((item) => item.id === activeTeam.currentPhase);

  return {
    schemaVersion: 1,
    host,
    project: {
      id: project.id,
      name: project.name,
      root: project.root,
      mode: project.mode,
    },
    ...(checkpoint ? {
      checkpoint: {
        id: checkpoint.id,
        createdAt: checkpoint.createdAt,
        reason: checkpoint.reason,
        ...(checkpoint.state.phase ? { phase: checkpoint.state.phase } : {}),
        ...(checkpoint.state.activeTask ? { activeTask: checkpoint.state.activeTask } : {}),
        completed: checkpoint.state.completed,
        blocked: checkpoint.state.blocked,
        next: checkpoint.state.next,
        capabilities: checkpoint.state.capabilities,
        git: {
          ...(checkpoint.git.branch ? { branch: checkpoint.git.branch } : {}),
          ...(checkpoint.git.head ? { head: checkpoint.git.head } : {}),
          dirty: checkpoint.git.dirty,
        },
      },
    } : {}),
    ...(activeTeam ? {
      team: {
        id: activeTeam.id,
        status: activeTeam.status,
        currentPhase: activeTeam.currentPhase,
        activeAgents: runtime?.activeAgents ?? [],
        requiredGates: phase?.gates ?? [],
        expectedOutputs: phase?.outputs ?? [],
        worktrees: runtime?.worktrees ?? [],
        recentDecisions: activeTeam.decisions.slice(-10),
        recentFailures: activeTeam.failures.slice(-5),
      },
    } : {}),
    instructions: [
      "Treat DockyardOS project state as the durable continuity source. Do not restart completed work unless repository verification proves it is broken.",
      "For substantial work, use DockyardOS capability selection and phase-aware teams so only phase-relevant skills, agents, tools, MCPs, and providers are active.",
      "Preserve the host's native permission model and DockyardOS approval policy. Never bypass force-ask or deny decisions.",
      "Keep implementation writers isolated when parallel and keep QA/security/release reviewers independent from implementation write context.",
      "For high-security work preserve threat modeling, OWASP coverage, secret/dependency/static analysis, independent review, and explicitly authorized budget-bounded Strix verification when selected.",
      "Create a structured checkpoint at major milestones and before risky transitions; team phase transitions also checkpoint automatically.",
    ],
    generatedAt: new Date().toISOString(),
  };
}

export function renderDockyardContext(context: DockyardPortableContext): string {
  const lines = [
    `DockyardOS host: ${context.host}`,
    `Project: ${context.project.name} (${context.project.id})`,
    `Mode: ${context.project.mode}`,
  ];
  if (context.checkpoint) {
    lines.push(`Checkpoint: ${context.checkpoint.id} (${context.checkpoint.reason}, ${context.checkpoint.createdAt})`);
    if (context.checkpoint.phase) lines.push(`Checkpoint phase: ${context.checkpoint.phase}`);
    if (context.checkpoint.activeTask) lines.push(`Active task: ${context.checkpoint.activeTask}`);
    if (context.checkpoint.completed.length) lines.push(`Completed: ${context.checkpoint.completed.join("; ")}`);
    if (context.checkpoint.blocked.length) lines.push(`Blocked: ${context.checkpoint.blocked.join("; ")}`);
    if (context.checkpoint.next.length) lines.push(`Next: ${context.checkpoint.next.join("; ")}`);
  } else {
    lines.push("Checkpoint: none");
  }
  if (context.team) {
    lines.push(`Team run: ${context.team.id} (${context.team.status})`);
    lines.push(`Team phase: ${context.team.currentPhase}`);
    if (context.team.activeAgents.length) lines.push(`Active specialists: ${context.team.activeAgents.join(", ")}`);
    if (context.team.requiredGates.length) lines.push(`Required gates: ${context.team.requiredGates.join(", ")}`);
    if (context.team.expectedOutputs.length) lines.push(`Expected outputs: ${context.team.expectedOutputs.join(", ")}`);
  }
  lines.push("Instructions:", ...context.instructions.map((instruction) => `- ${instruction}`));
  return lines.join("\n");
}
