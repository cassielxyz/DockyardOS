#!/usr/bin/env node
import type { Candidate, CheckpointState, HostId, OperatingMode, SecurityLevel, UpdateChannel, WorkflowProfile } from "./types.js";
import { initProject, findWorkspaceRoot, loadProject } from "./project.js";
import { createCheckpoint, loadLatestCheckpoint } from "./checkpoints.js";
import { runDoctor } from "./doctor.js";
import { composeWorkflow } from "./workflow.js";
import { evaluateCommand } from "./policy.js";
import { catalogSearch, categoryNames, providersFor, validateCatalog } from "./registry.js";
import { recipes, recipeById } from "./recipes.js";
import { defaultSelectionRequest, selectCapabilities, selectionSummary } from "./selection.js";
import { handlePostTool, handlePreInvocation, handlePreTool, handleStop } from "./hooks.js";

function values(args: string[], name: string): string[] {
  const result: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === name && args[i + 1]) result.push(...args[i + 1]!.split(",").map((v) => v.trim()).filter(Boolean));
  }
  return result;
}

function value(args: string[], name: string): string | undefined {
  return values(args, name)[0];
}

function has(args: string[], name: string): boolean {
  return args.includes(name);
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

function print(data: unknown, json = false): void {
  if (json) console.log(JSON.stringify(data, null, 2));
  else if (typeof data === "string") console.log(data);
  else console.log(JSON.stringify(data, null, 2));
}

function usage(): void {
  console.log(`DockyardOS CLI\n\nCommands:\n  init [--name NAME] [--mode safe|balanced|autonomous]\n  status [--json]\n  checkpoint [--reason TEXT] [--phase NAME] [--task TEXT] [--next TEXT] [--completed TEXT] [--blocked TEXT] [--capability ID]\n  resume [--json]\n  doctor [--json]\n  plan --profile fast|standard|full --stack nextjs,supabase --security standard|high [--json]\n  recommend --task \"build a SaaS dashboard\" --stack nextjs,supabase [--security high] [--host antigravity]\n  catalog [--query TEXT] [--category NAME] [--kind skill|agent|tool|mcp] [--stack NAME] [--host NAME]\n  categories\n  recipes [--id RECIPE]\n  registry verify\n  providers --capability CAPABILITY [--json]\n  policy --command \"...\" [--mode MODE] [--json]\n  hook pre-tool|post-tool|pre-invocation|stop\n`);
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  const json = has(args, "--json");
  const root = findWorkspaceRoot();

  switch (command) {
    case "init": {
      const mode = (value(args, "--mode") ?? "balanced") as OperatingMode;
      if (!["safe", "balanced", "autonomous"].includes(mode)) throw new Error(`Invalid mode: ${mode}`);
      const name = value(args, "--name");
      const project = await initProject(root, name ? { name, mode } : { mode });
      print(json ? project : `Initialized DockyardOS for ${project.name}\nProject ID: ${project.id}\nMode: ${project.mode}`, json);
      break;
    }
    case "status": {
      const project = await loadProject(root);
      const latest = project ? await loadLatestCheckpoint(root).catch(() => undefined) : undefined;
      if (json) print({ project, latest }, true);
      else if (!project) print("DockyardOS is not initialized for this project.");
      else print(`Project: ${project.name}\nID: ${project.id}\nMode: ${project.mode}\nLatest checkpoint: ${latest?.id ?? "none"}`);
      break;
    }
    case "checkpoint": {
      const phase = value(args, "--phase");
      const task = value(args, "--task");
      const state: Partial<CheckpointState> = {
        ...(phase ? { phase } : {}),
        ...(task ? { activeTask: task } : {}),
        ...(values(args, "--next").length ? { next: values(args, "--next") } : {}),
        ...(values(args, "--completed").length ? { completed: values(args, "--completed") } : {}),
        ...(values(args, "--blocked").length ? { blocked: values(args, "--blocked") } : {}),
        ...(values(args, "--capability").length ? { capabilities: values(args, "--capability") } : {}),
      };
      const checkpoint = await createCheckpoint(root, value(args, "--reason") ?? "manual", state);
      print(json ? checkpoint : `Checkpoint saved: ${checkpoint.id}`, json);
      break;
    }
    case "resume": {
      const latest = await loadLatestCheckpoint(root);
      if (!latest) throw new Error("No checkpoint available.");
      if (json) print(latest, true);
      else {
        const s = latest.state;
        print([
          `Checkpoint: ${latest.id}`,
          `Reason: ${latest.reason}`,
          s.phase ? `Phase: ${s.phase}` : "",
          s.activeTask ? `Active task: ${s.activeTask}` : "",
          s.completed.length ? `Completed: ${s.completed.join("; ")}` : "",
          s.blocked.length ? `Blocked: ${s.blocked.join("; ")}` : "",
          s.next.length ? `Next: ${s.next.join("; ")}` : "",
          latest.git.branch ? `Git: ${latest.git.branch} @ ${latest.git.head?.slice(0, 12) ?? "unknown"}${latest.git.dirty ? " (dirty)" : ""}` : "",
        ].filter(Boolean).join("\n"));
      }
      break;
    }
    case "doctor": {
      const checks = await runDoctor(root);
      if (json) print(checks, true);
      else {
        for (const check of checks) {
          const mark = check.status === "pass" ? "✓" : check.status === "warn" ? "!" : "✗";
          console.log(`${mark} ${check.name}: ${check.detail}`);
        }
        if (checks.some((check) => check.status === "fail")) process.exitCode = 1;
      }
      break;
    }
    case "plan": {
      const profile = (value(args, "--profile") ?? "standard") as WorkflowProfile;
      const security = (value(args, "--security") ?? "standard") as SecurityLevel;
      const stack = values(args, "--stack");
      const plan = composeWorkflow({ profile, stack, security });
      print(plan, true);
      break;
    }
    case "recommend": {
      const request = defaultSelectionRequest({
        task: value(args, "--task") ?? "feature",
        ...(value(args, "--task-type") ? { taskType: value(args, "--task-type") } : {}),
        stack: values(args, "--stack"),
        capabilities: values(args, "--capability"),
        security: (value(args, "--security") ?? "standard") as SecurityLevel,
        host: (value(args, "--host") ?? "antigravity") as HostId,
        channel: (value(args, "--channel") ?? "recommended") as UpdateChannel,
        allowCommunity: !has(args, "--no-community"),
        preferred: values(args, "--prefer"),
        excluded: values(args, "--exclude"),
      });
      const maxSkills = Number(value(args, "--max-skills") ?? request.maxSkills);
      const maxAgents = Number(value(args, "--max-agents") ?? request.maxAgents);
      const result = selectCapabilities({ ...request, maxSkills, maxAgents });
      print(json ? result : selectionSummary(result), true);
      break;
    }
    case "catalog": {
      const matches = catalogSearch({
        ...(value(args, "--query") ? { query: value(args, "--query") } : {}),
        ...(value(args, "--category") ? { category: value(args, "--category") } : {}),
        ...(value(args, "--kind") ? { kind: value(args, "--kind") as Candidate["kind"] } : {}),
        ...(value(args, "--channel") ? { channel: value(args, "--channel") as UpdateChannel } : {}),
        ...(value(args, "--host") ? { host: value(args, "--host") } : {}),
        ...(value(args, "--stack") ? { stack: value(args, "--stack") } : {}),
      });
      print(matches.map((candidate) => ({ id: candidate.id, name: candidate.displayName, category: candidate.category, kind: candidate.kind, trust: candidate.trust, risk: candidate.risk, source: candidate.source.locator })), true);
      break;
    }
    case "categories": {
      print(categoryNames, true);
      break;
    }
    case "recipes": {
      const id = value(args, "--id");
      if (id) {
        const recipe = recipeById(id);
        if (!recipe) throw new Error(`Unknown recipe: ${id}`);
        print(recipe, true);
      } else {
        print(recipes.map((recipe) => ({ id: recipe.id, name: recipe.displayName, taskTypes: recipe.taskTypes, stacks: recipe.stacks, security: recipe.securityLevel, profile: recipe.workflowProfile })), true);
      }
      break;
    }
    case "registry": {
      if (args[0] !== "verify") throw new Error("Usage: dockyard registry verify");
      const errors = validateCatalog();
      if (errors.length) {
        print({ ok: false, errors }, true);
        process.exitCode = 1;
      } else {
        print({ ok: true, categories: categoryNames.length, message: "DockyardOS capability catalogue is structurally valid." }, true);
      }
      break;
    }
    case "providers": {
      const capability = value(args, "--capability");
      if (!capability) throw new Error("--capability is required");
      print(providersFor(capability), true);
      break;
    }
    case "policy": {
      const cmd = value(args, "--command");
      if (!cmd) throw new Error("--command is required");
      const mode = (value(args, "--mode") ?? "balanced") as OperatingMode;
      print(evaluateCommand(cmd, mode), true);
      break;
    }
    case "hook": {
      const hookName = args[0];
      const raw = await readStdin();
      const payload = raw.trim() ? JSON.parse(raw) : {};
      let response: Record<string, unknown>;
      if (hookName === "pre-tool") response = await handlePreTool(payload);
      else if (hookName === "post-tool") response = await handlePostTool(payload);
      else if (hookName === "pre-invocation") response = await handlePreInvocation(payload);
      else if (hookName === "stop") response = await handleStop(payload);
      else throw new Error(`Unknown hook: ${hookName}`);
      console.log(JSON.stringify(response));
      break;
    }
    case "help":
    case "--help":
    case "-h":
    case undefined:
      usage();
      break;
    default:
      usage();
      throw new Error(`Unknown command: ${command}`);
  }
}

main().catch((error) => {
  console.error(`DockyardOS error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
