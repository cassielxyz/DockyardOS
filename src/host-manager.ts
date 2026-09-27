import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { commandExists, run } from "./process.js";
import { dockyardHome } from "./project.js";
import { hostAdapter, hostAdapters } from "./host-adapters.js";
import type { HostId } from "./types.js";
import type { HostInspection, HostInstallAction, HostInstallPlan, HostScope } from "./host-types.js";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function expandPath(path: string, workspaceRoot: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return resolve(homedir(), path.slice(2));
  return resolve(workspaceRoot, path);
}

function bundledPortableSkillPath(): string {
  return fileURLToPath(new URL("../integrations/portable/skills/dockyardos/SKILL.md", import.meta.url));
}

function bundledAntigravityPluginPath(): string {
  return fileURLToPath(new URL("../integrations/antigravity/plugin", import.meta.url));
}

function bundledNativePath(path: string): string {
  return fileURLToPath(new URL(`../${path.replace(/^\/+/, "")}`, import.meta.url));
}

export async function inspectHost(workspaceRoot: string, host: HostId): Promise<HostInspection> {
  const adapter = hostAdapter(host);
  const projectPaths = [
    ...adapter.preferredSkillLocations.filter((item) => item.scope === "project" && item.path).map((item) => item.path!),
    ...adapter.projectInstructionFiles,
  ];
  const globalPaths = adapter.preferredSkillLocations.filter((item) => item.scope === "user" && item.path).map((item) => item.path!);
  return {
    host,
    displayName: adapter.displayName,
    executableAvailable: adapter.executable ? commandExists(adapter.executable) : false,
    projectSignals: await Promise.all(projectPaths.map(async (path) => ({ path, exists: await exists(expandPath(path, workspaceRoot)) }))),
    globalSignals: await Promise.all(globalPaths.map(async (path) => ({ path, exists: await exists(expandPath(path, workspaceRoot)) }))),
    ...(adapter.nativeBundle ? { nativeBundleAvailable: await exists(bundledNativePath(adapter.nativeBundle.path)) } : {}),
    nativeResumeAvailable: adapter.supportsNativeResume,
    features: adapter.features,
  };
}

export async function inspectHosts(workspaceRoot: string): Promise<HostInspection[]> {
  return Promise.all(hostAdapters.map((adapter) => inspectHost(workspaceRoot, adapter.id)));
}

function locationFor(host: HostId, scope: HostScope) {
  const adapter = hostAdapter(host);
  return adapter.preferredSkillLocations.find((item) => item.scope === scope && item.strategy === "copy-skill" && item.path);
}

export function planHostInstall(workspaceRoot: string, host: HostId, scope: HostScope = "user"): HostInstallPlan {
  const adapter = hostAdapter(host);
  const actions: HostInstallAction[] = [];
  const warnings: string[] = [];
  const location = locationFor(host, scope);

  if (host === "antigravity" && scope === "user") {
    actions.push({
      type: "run-command",
      scope,
      command: ["agy", "plugin", "install", bundledAntigravityPluginPath()],
      reason: "Install the full DockyardOS Antigravity plugin once for this user.",
      requiresApproval: false,
    });
  } else if (location?.path) {
    const destination = expandPath(location.path, workspaceRoot);
    actions.push({ type: "create-directory", scope, destination, reason: "Create the host's Agent Skill directory when missing.", requiresApproval: false });
    actions.push({ type: "copy-skill", scope, destination, reason: "Install the host-neutral DockyardOS SKILL.md while keeping runtime state external and shared.", requiresApproval: false });
  } else if (host === "codex" && scope === "runtime") {
    actions.push({ type: "manual", scope, reason: "Register the DockyardOS portable skill parent as an OpenAI Agents API environment.capability_directories entry for this sandbox/session.", requiresApproval: false });
  } else {
    warnings.push(`No verified automatic ${scope}-scope install strategy is defined for ${adapter.displayName}.`);
  }

  if (adapter.nativeBundle && adapter.nativeBundle.install === "manual-review") {
    warnings.push(`A richer native bundle is available at ${adapter.nativeBundle.path}; it is review-first because installing it may intersect with existing host instructions/MCP configuration.`);
  }
  if (adapter.nativeBundle && adapter.nativeBundle.install === "cli" && host !== "antigravity") {
    warnings.push(`A richer native ${adapter.nativeBundle.mode} bundle is available at ${adapter.nativeBundle.path}; the portable skill remains the default install until the host-native install is explicitly selected.`);
  }
  if (scope === "project") warnings.push("Project-scope host integration files may be committed to the application repository. Use user scope when you want one DockyardOS install across projects.");
  if (!adapter.supportsDockyardHooks) warnings.push(`${adapter.displayName} does not currently expose the same DockyardOS hook surface as Antigravity; durable resume still works through the shared CLI/state, but approval/context injection may require the host's own integration mechanism.`);
  return { host, workspaceRoot, actions, sharedState: { dockyardHome: dockyardHome(), projectStateIsHostIndependent: true }, warnings };
}

async function installPortableSkill(destination: string, force: boolean): Promise<"installed" | "unchanged"> {
  const source = bundledPortableSkillPath();
  const sourceContent = await readFile(source, "utf8");
  const target = resolve(destination, "SKILL.md");
  if (await exists(target)) {
    const current = await readFile(target, "utf8");
    if (current === sourceContent) return "unchanged";
    if (!force) throw new Error(`DockyardOS skill already exists with different content at ${target}. Re-run with --force only after reviewing the existing skill.`);
  }
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, sourceContent, { mode: 0o644 });
  return "installed";
}

export async function executeHostInstall(workspaceRoot: string, host: HostId, scope: HostScope, options: { force?: boolean } = {}): Promise<Record<string, unknown>> {
  const plan = planHostInstall(workspaceRoot, host, scope);
  const results: Array<Record<string, unknown>> = [];
  for (const action of plan.actions) {
    if (action.type === "create-directory" && action.destination) {
      await mkdir(action.destination, { recursive: true });
      results.push({ action: action.type, destination: action.destination, status: "ok" });
    } else if (action.type === "copy-skill" && action.destination) {
      results.push({ action: action.type, destination: action.destination, status: await installPortableSkill(action.destination, options.force ?? false) });
    } else if (action.type === "run-command" && action.command) {
      if (!commandExists(action.command[0]!)) throw new Error(`${action.command[0]} is not installed or not on PATH.`);
      const result = run(action.command[0]!, action.command.slice(1), { cwd: workspaceRoot, timeoutMs: 60_000, maxOutputBytes: 16_384 });
      if (!result.ok) throw new Error(`Host installation failed: ${result.stderr || result.stdout}`);
      results.push({ action: action.type, command: action.command[0], status: "installed", output: result.stdout });
    } else {
      results.push({ action: action.type, status: "manual", reason: action.reason });
    }
  }
  return { host, scope, results, warnings: plan.warnings, sharedState: plan.sharedState, inspection: await inspectHost(workspaceRoot, host) };
}
