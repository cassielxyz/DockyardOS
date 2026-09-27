#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import { createCheckpoint } from "./checkpoints.js";
import { buildPortableHostContext } from "./host-runtime.js";
import type { DockyardHostId } from "./host-types.js";
import { evaluateCommand } from "./policy.js";
import { findWorkspaceRoot, requireProject } from "./project.js";
import { defaultSelectionRequest, selectCapabilities, selectionSummary } from "./selection.js";
import { startTeamForSelection } from "./team-routing.js";
import { completeTeamPhase, loadTeamRun, teamRunSummary } from "./team-state.js";
import type { HostId, SecurityLevel } from "./types.js";

const HOSTS = ["antigravity", "gemini-cli", "codex", "claude-code", "cursor", "opencode", "vscode"] as const;
const SELECTION_HOSTS = new Set<HostId>(["antigravity", "gemini-cli", "codex", "claude-code", "cursor", "opencode", "universal"]);

function root(): string {
  return findWorkspaceRoot(process.cwd());
}

function result(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

function selectionHost(host: DockyardHostId): HostId {
  if (host === "vscode") return "universal";
  return SELECTION_HOSTS.has(host as HostId) ? host as HostId : "universal";
}

serveStdio(() => {
  const server = new McpServer({ name: "dockyardos", version: "0.1.0" });

  server.registerTool(
    "dockyard_context",
    {
      description: "Read the latest DockyardOS project checkpoint, active team phase, specialists, gates, worktrees, and continuity instructions.",
      inputSchema: z.object({ host: z.enum(HOSTS).default("codex") }),
    },
    async ({ host }) => result(await buildPortableHostContext(root(), host as DockyardHostId)),
  );

  server.registerTool(
    "dockyard_recommend",
    {
      description: "Select a bounded best-fit set of skills, specialist agents, tools, MCPs, providers, security gates, and workflow recipe for a task.",
      inputSchema: z.object({
        task: z.string().min(1),
        stack: z.array(z.string()).default([]),
        capabilities: z.array(z.string()).default([]),
        security: z.enum(["standard", "high"]).default("standard"),
        host: z.enum(HOSTS).default("codex"),
      }),
    },
    async ({ task, stack, capabilities, security, host }) => {
      const selection = selectCapabilities(defaultSelectionRequest({
        task,
        stack,
        capabilities,
        security: security as SecurityLevel,
        host: selectionHost(host as DockyardHostId),
      }));
      return result(selectionSummary(selection));
    },
  );

  server.registerTool(
    "dockyard_team_start",
    {
      description: "Start a persistent phase-aware DockyardOS specialist team for substantial work and save an initial checkpoint.",
      inputSchema: z.object({
        task: z.string().min(1),
        stack: z.array(z.string()).default([]),
        capabilities: z.array(z.string()).default([]),
        security: z.enum(["standard", "high"]).default("standard"),
        host: z.enum(HOSTS).default("codex"),
      }),
    },
    async ({ task, stack, capabilities, security, host }) => {
      const selection = selectCapabilities(defaultSelectionRequest({
        task,
        stack,
        capabilities,
        security: security as SecurityLevel,
        host: selectionHost(host as DockyardHostId),
      }));
      const started = await startTeamForSelection(root(), task, selection);
      return result({ selection: selectionSummary(selection), team: teamRunSummary(started.state) });
    },
  );

  server.registerTool(
    "dockyard_team_status",
    {
      description: "Read the active DockyardOS team run and current phase without replaying previous chat history.",
      inputSchema: z.object({}),
    },
    async () => {
      const team = await loadTeamRun(root());
      return result(team ? teamRunSummary(team) : { active: false });
    },
  );

  server.registerTool(
    "dockyard_team_advance",
    {
      description: "Complete the active team phase with evidence/decisions and advance to the next phase, creating a checkpointed compact handoff.",
      inputSchema: z.object({
        notes: z.string().optional(),
        artifacts: z.array(z.string()).default([]),
        decisions: z.array(z.string()).default([]),
        unresolved: z.array(z.string()).default([]),
      }),
    },
    async ({ notes, artifacts, decisions, unresolved }) => result(await completeTeamPhase(root(), {
      ...(notes ? { notes } : {}),
      artifacts,
      decisions,
      unresolved,
    })),
  );

  server.registerTool(
    "dockyard_checkpoint",
    {
      description: "Create a structured DockyardOS checkpoint outside the application repository for later resume/continue.",
      inputSchema: z.object({
        reason: z.string().min(1).default("mcp-milestone"),
        phase: z.string().optional(),
        task: z.string().optional(),
        completed: z.array(z.string()).default([]),
        blocked: z.array(z.string()).default([]),
        next: z.array(z.string()).default([]),
        capabilities: z.array(z.string()).default([]),
      }),
    },
    async ({ reason, phase, task, completed, blocked, next, capabilities }) => result(await createCheckpoint(root(), reason, {
      ...(phase ? { phase } : {}),
      ...(task ? { activeTask: task } : {}),
      completed,
      blocked,
      next,
      capabilities,
    })),
  );

  server.registerTool(
    "dockyard_policy",
    {
      description: "Evaluate a shell command against the current DockyardOS Safe/Balanced/Autonomous policy before execution.",
      inputSchema: z.object({ command: z.string().min(1) }),
    },
    async ({ command }) => {
      const project = await requireProject(root());
      return result(evaluateCommand(command, project.mode));
    },
  );

  return server;
});
