#!/usr/bin/env node
import type { Candidate, CheckpointState, CostPreference, HostId, OperatingMode, ProviderEnvironment, SecurityLevel, UpdateChannel, WorkflowProfile } from "./types.js";
import type { SecurityProfileId, SecurityScanMode, SecurityScannerId, SecurityTargetType } from "./security-types.js";
import { initProject, findWorkspaceRoot, loadProject } from "./project.js";
import { createCheckpoint, loadLatestCheckpoint } from "./checkpoints.js";
import { runDoctor } from "./doctor.js";
import { composeWorkflow } from "./workflow.js";
import { evaluateCommand } from "./policy.js";
import { catalogSearch, categoryNames, providersFor, validateCatalog } from "./registry.js";
import { recipes, recipeById } from "./recipes.js";
import { defaultSelectionRequest, selectCapabilities, selectionSummary } from "./selection.js";
import { probeProviders } from "./provider-detection.js";
import { fallbackChain, planProviders, providerPlanSummary } from "./provider-planner.js";
import { createSecurityPlan, securityPlanSummary } from "./security-plan.js";
import { executeSecurityPlan, securityRunSummary } from "./security-runner.js";
import { securityProfiles } from "./security-profiles.js";
import { compareSecurityResultFiles } from "./security-regression.js";
import { createThreatModel, threatModelSummary } from "./threat-model.js";
import { handlePostTool, handlePreInvocation, handlePreTool, handleStop } from "./hooks.js";
import { mediaGenerationEvidenceTemplate, planMediaGeneration, type MediaAspectRatio, type MediaDurationSeconds, type MediaGenerationPlanRequest } from "./media-generation.js";
import { executeMediaGeneration } from "./media-execution.js";
import type { VideoModelPriority, VideoResolution } from "./media-models.js";

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

function scalarValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
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
  console.log(`DockyardOS CLI\n\nCommands:\n  init [--name NAME] [--mode safe|balanced|autonomous]\n  status [--json]\n  checkpoint [--reason TEXT] [--phase NAME] [--task TEXT] [--next TEXT] [--completed TEXT] [--blocked TEXT] [--capability ID]\n  resume [--json]\n  doctor [--json]\n  plan --profile fast|standard|full --stack nextjs,supabase --security standard|high [--json]\n  recommend --task \"build a SaaS dashboard\" --stack nextjs,supabase [--security high] [--host antigravity]\n  catalog [--query TEXT] [--category NAME] [--kind skill|agent|tool|mcp] [--stack NAME] [--host NAME]\n  categories\n  recipes [--id RECIPE]\n  registry verify\n  skills bootstrap [--ids ID[,ID]] [--no-activate]\n  providers --capability CAPABILITY\n  providers inspect [--live] [--id vercel,supabase]\n  providers chain --capability CAPABILITY\n  providers plan --capability CAPABILITY[,CAPABILITY] --stack STACK [--environment preview|production] [--free-first] [--live]\n  media plan --prompt "..." [--priority quality|speed|lean] [--resolution 720p|1080p|4k] [--aspect 16:9|9:16] [--duration 4|6|8]\n  media run --prompt "..." [same media options] --approve-billable --expected-plan-sha256 SHA256\n  security profiles\n  security plan --profile web|api|mobile|llm|general [--target .] [--target-type source|url|repository] [--mode quick|standard|deep] [--strix --strix-budget USD] [--authorized]\n  security scan --profile PROFILE [same options as security plan]\n  security threat-model --profile PROFILE\n  security compare --before PATH --after PATH\n  policy --command \"...\" [--mode MODE] [--json]\n  hook pre-tool|post-tool|pre-invocation|stop\n`);
}

function securityRequest(args: string[]): {
  profile: SecurityProfileId;
  target: { type: SecurityTargetType; value: string; authorized?: boolean };
  mode: SecurityScanMode;
  scanners?: SecurityScannerId[];
  includeStrix?: boolean;
  strixBudgetUsd?: number;
} {
  const profile = (value(args, "--profile") ?? "general") as SecurityProfileId;
  if (!securityProfiles.some((item) => item.id === profile)) throw new Error(`Invalid security profile: ${profile}`);
  const type = (value(args, "--target-type") ?? "source") as SecurityTargetType;
  if (!["source", "url", "repository"].includes(type)) throw new Error(`Invalid security target type: ${type}`);
  const mode = (value(args, "--mode") ?? "standard") as SecurityScanMode;
  if (!["quick", "standard", "deep"].includes(mode)) throw new Error(`Invalid security scan mode: ${mode}`);
  const scannerValues = values(args, "--scanner") as SecurityScannerId[];
  for (const scanner of scannerValues) if (!["gitleaks", "osv-scanner", "semgrep", "strix"].includes(scanner)) throw new Error(`Invalid security scanner: ${scanner}`);
  const includeStrix = has(args, "--strix") || scannerValues.includes("strix");
  const budgetRaw = value(args, "--strix-budget");
  const strixBudgetUsd = budgetRaw ? Number(budgetRaw) : undefined;
  if (budgetRaw && (!Number.isFinite(strixBudgetUsd) || (strixBudgetUsd ?? 0) <= 0)) throw new Error("--strix-budget must be a positive number");
  return {
    profile,
    target: { type, value: value(args, "--target") ?? ".", ...(type !== "source" ? { authorized: has(args, "--authorized") } : {}) },
    mode,
    ...(scannerValues.length ? { scanners: scannerValues } : {}),
    ...(includeStrix ? { includeStrix: true } : {}),
    ...(strixBudgetUsd ? { strixBudgetUsd } : {}),
  };
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
      const subcommand = args[0];
      if (subcommand === "inspect") {
        const result = await probeProviders(root, { live: has(args, "--live"), ids: values(args, "--id") });
        print(result, true);
        break;
      }
      if (subcommand === "chain") {
        const capability = value(args, "--capability");
        if (!capability) throw new Error("--capability is required");
        print({ capability, providers: fallbackChain(capability) }, true);
        break;
      }
      if (subcommand === "plan") {
        const capabilities = values(args, "--capability");
        if (!capabilities.length) throw new Error("At least one --capability is required");
        const environment = (value(args, "--environment") ?? "preview") as ProviderEnvironment;
        if (!["local", "preview", "production"].includes(environment)) throw new Error(`Invalid environment: ${environment}`);
        const costPreference: CostPreference = has(args, "--free-first") ? "free-first" : (value(args, "--cost") ?? "balanced") as CostPreference;
        if (!["free-first", "balanced", "performance"].includes(costPreference)) throw new Error(`Invalid cost preference: ${costPreference}`);
        const preferredProviders = values(args, "--prefer");
        const excludedProviders = values(args, "--exclude");
        const request = {
          stack: values(args, "--stack"),
          requirements: capabilities.map((capability) => ({ capability, required: true })),
          environment,
          costPreference,
          live: has(args, "--live"),
          ...(preferredProviders.length ? { preferredProviders } : {}),
          ...(excludedProviders.length ? { excludedProviders } : {}),
        };
        const plan = await planProviders(root, request);
        print(json ? plan : providerPlanSummary(plan), true);
        break;
      }
      const capability = value(args, "--capability");
      if (!capability) throw new Error("Usage: dockyard providers --capability CAPABILITY | inspect | chain | plan");
      print(providersFor(capability), true);
      break;
    }
    case "media": {
      const subcommand = args[0] ?? "plan";
      if (!["plan", "run"].includes(subcommand)) throw new Error("Usage: dockyard media plan|run --prompt \"...\" [--priority quality|speed|lean] [--resolution 720p|1080p|4k] [--aspect 16:9|9:16] [--duration 4|6|8] [--approve-billable --expected-plan-sha256 SHA256]");
      const mediaArgs = args.slice(1);
      const stdinPrompt = !scalarValue(mediaArgs, "--prompt") && !process.stdin.isTTY ? await readStdin() : "";
      const prompt = scalarValue(mediaArgs, "--prompt") ?? stdinPrompt;
      if (!prompt.trim()) throw new Error(`media ${subcommand} requires --prompt or prompt text on stdin.`);
      const priority = (scalarValue(mediaArgs, "--priority") ?? "quality") as VideoModelPriority;
      if (!["quality", "speed", "lean"].includes(priority)) throw new Error("Invalid media priority.");
      const resolution = (scalarValue(mediaArgs, "--resolution") ?? "1080p") as VideoResolution;
      if (!["720p", "1080p", "4k"].includes(resolution)) throw new Error("Invalid media resolution.");
      const aspectRatio = (scalarValue(mediaArgs, "--aspect") ?? "16:9") as MediaAspectRatio;
      if (!["16:9", "9:16"].includes(aspectRatio)) throw new Error("Invalid media aspect ratio.");
      const durationRaw = scalarValue(mediaArgs, "--duration");
      const durationSeconds = durationRaw === undefined ? undefined : Number(durationRaw) as MediaDurationSeconds;
      if (durationSeconds !== undefined && ![4, 6, 8].includes(durationSeconds)) throw new Error("Media duration must be 4, 6, or 8 seconds.");
      const request: MediaGenerationPlanRequest = {
        prompt,
        priority,
        resolution,
        aspectRatio,
        ...(durationSeconds !== undefined ? { durationSeconds } : {}),
      };
      if (subcommand === "plan") {
        const plan = planMediaGeneration(root, request);
        print({ ...plan, evidenceTemplate: mediaGenerationEvidenceTemplate(plan) }, true);
        break;
      }
      const expectedPlanSha256 = scalarValue(mediaArgs, "--expected-plan-sha256");
      if (!expectedPlanSha256 || !/^[a-f0-9]{64}$/i.test(expectedPlanSha256)) {
        throw new Error("media run requires --expected-plan-sha256 with the exact 64-character SHA-256 from media plan.");
      }
      const result = await executeMediaGeneration(root, request, {
        approveBillable: has(mediaArgs, "--approve-billable"),
        expectedPlanSha256,
      });
      print(result, true);
      break;
    }
    case "security": {
      const subcommand = args[0];
      if (subcommand === "profiles") {
        print(securityProfiles.map((profile) => ({ id: profile.id, name: profile.displayName, framework: profile.frameworkVersion, scanners: profile.scanners, controls: profile.controls.length })), true);
        break;
      }
      if (subcommand === "plan" || subcommand === "scan") {
        const request = securityRequest(args.slice(1));
        const plan = await createSecurityPlan(root, request);
        if (subcommand === "plan") {
          print(json ? plan : securityPlanSummary(plan), true);
          break;
        }
        await createThreatModel(root, request.profile);
        const result = await executeSecurityPlan(plan);
        print(json ? result : securityRunSummary(result), true);
        if (result.status === "findings") process.exitCode = 1;
        else if (result.status === "error" || result.status === "incomplete") process.exitCode = 2;
        break;
      }
      if (subcommand === "threat-model") {
        const profile = (value(args, "--profile") ?? "general") as SecurityProfileId;
        if (!securityProfiles.some((item) => item.id === profile)) throw new Error(`Invalid security profile: ${profile}`);
        const generated = await createThreatModel(root, profile);
        print(json ? generated : { ...threatModelSummary(generated.model), path: generated.path }, true);
        break;
      }
      if (subcommand === "compare") {
        const before = value(args, "--before");
        const after = value(args, "--after");
        if (!before || !after) throw new Error("security compare requires --before and --after result.json paths");
        const compared = await compareSecurityResultFiles(before, after);
        print(json ? compared : { gate: compared.report.gate, fixed: compared.report.fixed.length, remaining: compared.report.remaining.length, introduced: compared.report.introduced.length, reasons: compared.report.reasons, path: compared.path }, true);
        if (compared.report.gate === "fail") process.exitCode = 1;
        break;
      }
      throw new Error("Usage: dockyard security profiles | plan | scan | threat-model | compare");
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