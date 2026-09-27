import { access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadLatestCheckpoint } from "./checkpoints.js";
import { hostAdapter, hostAdapters } from "./host-adapters.js";
import type { DockyardHostId, HostProbeResult, PortableHostContext } from "./host-types.js";
import { commandExists } from "./process.js";
import { requireProject } from "./project.js";
import { loadTeamRun } from "./team-state.js";

function packageRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..");
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function inspectHosts(ids?: string[]): Promise<HostProbeResult[]> {
  const selected = ids?.length ? hostAdapters.filter((adapter) => ids.includes(adapter.id)) : hostAdapters;
  return Promise.all(selected.map(async (adapter) => {
    const installed = adapter.command ? commandExists(adapter.command) : false;
    const integrationPath = resolve(packageRoot(), adapter.integrationDirectory);
    const integrationAvailable = await exists(integrationPath);
    const readiness: HostProbeResult["readiness"] = installed && integrationAvailable
      ? "ready"
      : installed
        ? "installed"
        : integrationAvailable
          ? "integration-available"
          : "unavailable";
    return {
      id: adapter.id,
      displayName: adapter.displayName,
      installed,
      integrationAvailable,
      readiness,
      integrationDirectory: integrationPath,
      installHint: adapter.installHint,
      verifyHint: adapter.verifyHint,
      notes: adapter.notes,
    };
  }));
}

export async function buildPortableHostContext(root: string, host: DockyardHostId): Promise<PortableHostContext> {
  const adapter = hostAdapter(host);
  if (!adapter) throw new Error(`Unknown DockyardOS host: ${host}`);
  const project = await requireProject(root);
  const checkpoint = await loadLatestCheckpoint(project.root).catch(() => undefined);
  const team = await loadTeamRun(project.root).catch(() => undefined);
  const activeTeam = team && (team.status === "active" || team.status === "blocked") ? team : undefined;
  const phaseRuntime = activeTeam?.phases.find((phase) => phase.id === activeTeam.currentPhase);
  const phasePlan = activeTeam?.composition.phases.find((phase) => phase.id === activeTeam.currentPhase);

  const instructions = [
    "Treat DockyardOS state as the continuity source for this project; do not restart completed work.",
    "Before substantial implementation, use the DockyardOS recommendation/team workflow so only phase-relevant skills, agents, tools, and MCPs are activated.",
    "Preserve native host permission prompts and DockyardOS approval gates. Never bypass force-ask/deny decisions.",
    "Record a structured checkpoint after major milestones and before risky transitions; team phase transitions create checkpoints automatically.",
    "For high-security work, preserve OWASP, secret/dependency/static-analysis, independent review, and authorized Strix proof-fix-rerun gates.",
  ];

  return {
    schemaVersion: 1,
    host,
    project: { id: project.id, name: project.name, root: project.root, mode: project.mode },
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
        activeAgents: phaseRuntime?.activeAgents ?? [],
        gates: phasePlan?.gates ?? [],
        expectedOutputs: phasePlan?.outputs ?? [],
        worktrees: phaseRuntime?.worktrees ?? [],
        recentDecisions: activeTeam.decisions.slice(-10),
        failures: activeTeam.failures.slice(-5),
      },
    } : {}),
    instructions,
    generatedAt: new Date().toISOString(),
  };
}

export function renderPortableHostContext(context: PortableHostContext): string {
  const lines = [
    `DockyardOS host: ${context.host}`,
    `Project: ${context.project.name} (${context.project.id})`,
    `Mode: ${context.project.mode}`,
  ];
  if (context.checkpoint) {
    lines.push(`Checkpoint: ${context.checkpoint.id} (${context.checkpoint.reason}, ${context.checkpoint.createdAt})`);
    if (context.checkpoint.phase) lines.push(`Phase: ${context.checkpoint.phase}`);
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
    if (context.team.gates.length) lines.push(`Required gates: ${context.team.gates.join(", ")}`);
  }
  lines.push("Instructions:", ...context.instructions.map((instruction) => `- ${instruction}`));
  return lines.join("\n");
}
