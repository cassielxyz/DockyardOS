import { access, cp, lstat, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { installAntigravityIdeGlobalPlugin } from "./antigravity-ide-install.js";
import { commandExists, run } from "./process.js";
import { dockyardHome } from "./project.js";
import { hostAdapter, hostAdapters } from "./host-adapters.js";
import type { HostId } from "./types.js";
import type { HostInspection, HostInstallAction, HostInstallPlan, HostInstallStrategy, HostScope } from "./host-types.js";

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

function projectRelativePath(workspaceRoot: string, destination: string): string {
  const root = resolve(workspaceRoot);
  const target = resolve(destination);
  const rel = relative(root, target);
  if (!rel || rel === ".." || rel.startsWith("../") || rel.startsWith("..\\") || rel.startsWith("/") || rel.startsWith("\\")) {
    throw new Error("Project-scope host integration destination must stay inside the current workspace root.");
  }
  return rel;
}

async function assertProjectDestinationSafe(workspaceRoot: string, destination: string): Promise<void> {
  const root = resolve(workspaceRoot);
  const rel = projectRelativePath(root, destination);
  let cursor = root;
  for (const segment of rel.split(/[\\/]+/).filter(Boolean)) {
    cursor = resolve(cursor, segment);
    try {
      const entry = await lstat(cursor);
      if (entry.isSymbolicLink()) {
        throw new Error(`Project-scope host integration path contains a symbolic link: ${relative(root, cursor).replace(/\\/g, "/")}`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") break;
      throw error;
    }
  }
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

function locationFor(host: HostId, scope: HostScope, strategy: HostInstallStrategy) {
  const adapter = hostAdapter(host);
  return adapter.preferredSkillLocations.find((item) => item.scope === scope && item.strategy === strategy && item.path);
}

export function planHostInstall(workspaceRoot: string, host: HostId, scope: HostScope = "user"): HostInstallPlan {
  const adapter = hostAdapter(host);
  const actions: HostInstallAction[] = [];
  const warnings: string[] = [];
  const skillLocation = locationFor(host, scope, "copy-skill");
  const pluginLocation = locationFor(host, scope, "copy-plugin");

  if (host === "antigravity" && scope === "user") {
    actions.push({
      type: "run-command",
      scope,
      command: ["agy", "plugin", "install", bundledAntigravityPluginPath()],
      reason: "Install the full DockyardOS Antigravity plugin once for this user.",
      requiresApproval: false,
    });
  } else if (pluginLocation?.path) {
    actions.push({
      type: "copy-plugin",
      scope,
      destination: expandPath(pluginLocation.path, workspaceRoot),
      reason: "Install the full DockyardOS workspace plugin at the host's verified project plugin location.",
      requiresApproval: false,
    });
  } else if (skillLocation?.path) {
    const destination = expandPath(skillLocation.path, workspaceRoot);
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

async function directoryFiles(root: string, relativePath = ""): Promise<string[]> {
  const directory = relativePath ? resolve(root, relativePath) : root;
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of [...entries].sort((left, right) => left.name.localeCompare(right.name))) {
    const child = relativePath ? `${relativePath}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error(`DockyardOS plugin tree contains a symbolic link: ${child}`);
    if (entry.isDirectory()) files.push(...await directoryFiles(root, child));
    else if (entry.isFile()) files.push(child);
    else throw new Error(`DockyardOS plugin tree contains an unsupported filesystem entry: ${child}`);
  }
  return files;
}

async function pluginTreesEqual(source: string, destination: string): Promise<boolean> {
  const destinationStat = await lstat(destination);
  if (destinationStat.isSymbolicLink() || !destinationStat.isDirectory()) {
    throw new Error(`DockyardOS plugin destination must be a real directory: ${destination}`);
  }
  const sourceFiles = await directoryFiles(source);
  const destinationFiles = await directoryFiles(destination);
  if (sourceFiles.length !== destinationFiles.length) return false;
  for (let index = 0; index < sourceFiles.length; index += 1) {
    if (sourceFiles[index] !== destinationFiles[index]) return false;
    const [sourceBytes, destinationBytes] = await Promise.all([
      readFile(resolve(source, sourceFiles[index]!)),
      readFile(resolve(destination, destinationFiles[index]!)),
    ]);
    if (!sourceBytes.equals(destinationBytes)) return false;
  }
  return true;
}

async function installAntigravityPlugin(destination: string, force: boolean): Promise<"installed" | "unchanged"> {
  const source = bundledAntigravityPluginPath();
  await directoryFiles(source);
  if (await exists(destination)) {
    if (await pluginTreesEqual(source, destination)) return "unchanged";
    if (!force) {
      throw new Error(`DockyardOS Antigravity plugin already exists with different content at ${destination}. Re-run with --force only after reviewing the existing plugin.`);
    }
    await rm(destination, { recursive: true, force: true });
  }
  await mkdir(dirname(destination), { recursive: true });
  await cp(source, destination, { recursive: true, errorOnExist: true, force: false });
  return "installed";
}

export async function executeHostInstall(workspaceRoot: string, host: HostId, scope: HostScope, options: { force?: boolean } = {}): Promise<Record<string, unknown>> {
  const plan = planHostInstall(workspaceRoot, host, scope);
  const results: Array<Record<string, unknown>> = [];
  for (const action of plan.actions) {
    if (action.destination && action.scope === "project") await assertProjectDestinationSafe(workspaceRoot, action.destination);
    if (action.type === "create-directory" && action.destination) {
      await mkdir(action.destination, { recursive: true });
      await assertProjectDestinationSafe(workspaceRoot, action.destination);
      results.push({ action: action.type, destination: action.destination, status: "ok" });
    } else if (action.type === "copy-skill" && action.destination) {
      results.push({ action: action.type, destination: action.destination, status: await installPortableSkill(action.destination, options.force ?? false) });
    } else if (action.type === "copy-plugin" && action.destination) {
      results.push({ action: action.type, destination: action.destination, status: await installAntigravityPlugin(action.destination, options.force ?? false) });
    } else if (action.type === "run-command" && action.command) {
      const executable = action.command[0]!;
      const antigravityUserInstall = host === "antigravity" && scope === "user" && executable === "agy";
      const installAntigravityFallback = async (primaryError: string) => {
        try {
          const fallback = await installAntigravityIdeGlobalPlugin({
            ...(process.env.DOCKYARD_ANTIGRAVITY_CONFIG_ROOT ? { configRoot: process.env.DOCKYARD_ANTIGRAVITY_CONFIG_ROOT } : {}),
            force: options.force ?? false,
          });
          results.push({
            action: "copy-plugin",
            status: fallback.status,
            destination: fallback.destination,
            method: fallback.method,
            fallbackFor: "agy",
            primaryInstallError: primaryError,
          });
          return true;
        } catch (fallbackError) {
          const detail = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
          throw new Error(`Antigravity integration could not be activated through agy or the IDE-global plugin directory. CLI: ${primaryError} Fallback: ${detail}`);
        }
      };

      if (!commandExists(executable)) {
        if (antigravityUserInstall) {
          await installAntigravityFallback("agy is not installed or not on PATH.");
          continue;
        }
        throw new Error(`${executable} is not installed or not on PATH.`);
      }
      const result = run(executable, action.command.slice(1), { cwd: workspaceRoot, timeoutMs: 60_000, maxOutputBytes: 16_384 });
      if (!result.ok) {
        const detail = result.stderr || result.stdout || `${executable} exited unsuccessfully`;
        if (antigravityUserInstall) {
          await installAntigravityFallback(detail);
          continue;
        }
        throw new Error(`Host installation failed: ${detail}`);
      }
      results.push({ action: action.type, command: executable, status: "installed", output: result.stdout });
    } else {
      results.push({ action: action.type, status: "manual", reason: action.reason });
    }
  }
  return { host, scope, results, warnings: plan.warnings, sharedState: plan.sharedState, inspection: await inspectHost(workspaceRoot, host) };
}
