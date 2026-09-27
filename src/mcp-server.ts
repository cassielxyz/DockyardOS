#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import { createCheckpoint } from "./checkpoints.js";
import { buildDockyardContext } from "./dockyard-context.js";
import { evaluateCommand } from "./policy.js";
import { findWorkspaceRoot, requireProject } from "./project.js";
import { defaultSelectionRequest, selectCapabilities, selectionSummary } from "./selection.js";
import { startTeamForSelection } from "./team-routing.js";
import { completeTeamPhase, loadTeamRun, teamRunSummary } from "./team-state.js";
import type { HostId, SecurityLevel } from "./types.js";

const HOSTS = ["antigravity", "gemini-cli", "codex", "claude-code", "cursor", "opencode", "universal", "vscode"] as const;
const workspace = z.string().min(1).optional().describe("Project workspace path. Pass this when the MCP process was launched outside the project directory.");

function workspaceRoot(value?: string): string {
  return findWorkspaceRoot(value ?? process.cwd());
}

function mcpHost(value: typeof HOSTS[number]): HostId {
  return value === "vscode" ? "universal" : value;
}

function result(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

serveStdio(() => {
  const server = new McpServer({ name: "dockyardos", version: "0.1.0" });

  server.registerTool(
    "dockyard_context",
    {
      description: "Read the latest DockyardOS checkpoint, active team phase, specialists, gates, worktrees, and continuity instructions for a workspace.",
      inputSchema: z.object({ host: z.enum(HOSTS).default("universal"), workspace }),
    },
    async ({ host, workspace: value }) => result(await buildDockyardContext(workspaceRoot(value), host)),
  );

  server.registerTool(
    "dockyard_recommend",
    {
      description: "Choose a bounded best-fit set of skills, agents, tools, MCPs, providers, security gates, and workflow recipe for a task.",
      inputSchema: z.object({
        task: z.string().min(1),
        stack: z.array(z.string()).default([]),
        capabilities: z.array(z.string()).default([]),
        security: z.enum(["standard", "high"]).default("standard"),
        host: z.enum(HOSTS).default("universal"),
        workspace,
      }),
    },
    async ({ task, stack, capabilities, security, host, workspace: value }) => {
      const root = workspaceRoot(value);
      await requireProject(root);
      const selection = selectCapabilities(defaultSelectionRequest({
        task,
        stack,
        capabilities,
        security: security as SecurityLevel,
        host: mcpHost(host),
      }));
      return result(selectionSummary(selection));
    },
  );

  server.registerTool(
    "dockyard_team_start",
    {
      description: "Start a persistent phase-aware DockyardOS specialist team for substantial work and checkpoint the initial state.",
      inputSchema: z.object({
        task: z.string().min(1),
        stack: z.array(z.string()).default([]),
        capabilities: z.array(z.string()).default([]),
        security: z.enum(["standard", "high"]).default("standard"),
        host: z.enum(HOSTS).default("universal"),
        workspace,
      }),
    },
    async ({ task, stack, capabilities, security, host, workspace: value }) => {
      const root = workspaceRoot(value);
      const selection = selectCapabilities(defaultSelectionRequest({
        task,
        stack,
        capabilities,
        security: security as SecurityLevel,
        host: mcpHost(host),
      }));
      const started = await startTeamForSelection(root, task, selection);
      return result({ selection: selectionSummary(selection), team: teamRunSummary(started.state) });
    },
  );

  server.registerTool(
    "dockyard_team_status",
    {
      description: "Read the active DockyardOS team run and current phase without replaying prior chat history.",
      inputSchema: z.object({ workspace }),
    },
    async ({ workspace: value }) => {
      const team = await loadTeamRun(workspaceRoot(value));
      return result(team ? teamRunSummary(team) : { active: false });
    },
  );

  server.registerTool(
    "dockyard_team_advance",
    {
      description: "Complete the active team phase with durable evidence/decisions and advance to the next checkpointed phase.",
      inputSchema: z.object({
        notes: z.string().optional(),
        artifacts: z.array(z.string()).default([]),
        decisions: z.array(z.string()).default([]),
        unresolved: z.array(z.string()).default([]),
        workspace,
      }),
    },
    async ({ notes, artifacts, decisions, unresolved, workspace: value }) => result(await completeTeamPhase(workspaceRoot(value), {
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
        workspace,
      }),
    },
    async ({ reason, phase, task, completed, blocked, next, capabilities, workspace: value }) => result(await createCheckpoint(workspaceRoot(value), reason, {
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
      inputSchema: z.object({ command: z.string().min(1), workspace }),
    },
    async ({ command, workspace: value }) => {
      const project = await requireProject(workspaceRoot(value));
      return result(evaluateCommand(command, project.mode));
    },
  );

  return server;
});
