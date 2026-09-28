import { commandExists } from "./process.js";
import { initProject } from "./project.js";
import { executeHostInstall } from "./host-manager.js";
import { hostAdapters } from "./host-adapters.js";
import type { HostId, OperatingMode } from "./types.js";
import type { HostScope } from "./host-types.js";

function value(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function has(args: string[], name: string): boolean {
  return args.includes(name);
}

function validHost(value: string | undefined): HostId | undefined {
  if (!value) return undefined;
  return hostAdapters.some((adapter) => adapter.id === value) ? value as HostId : undefined;
}

function detectedHost(): HostId | undefined {
  const explicit = validHost(process.env.DOCKYARD_HOST);
  if (explicit) return explicit;
  const priority: HostId[] = ["antigravity", "gemini-cli", "codex", "claude-code", "cursor", "opencode"];
  for (const host of priority) {
    const adapter = hostAdapters.find((item) => item.id === host);
    if (adapter?.executable && commandExists(adapter.executable)) return host;
  }
  return undefined;
}

function defaultScope(host: HostId): HostScope {
  return host === "codex" ? "project" : "user";
}

export async function handleInitCommand(root: string, args: string[], json = false): Promise<void> {
  const mode = (value(args, "--mode") ?? "balanced") as OperatingMode;
  if (!["safe", "balanced", "autonomous"].includes(mode)) throw new Error(`Invalid mode: ${mode}`);
  const name = value(args, "--name");
  const project = await initProject(root, name ? { name, mode } : { mode });

  const requestedHostRaw = value(args, "--host");
  const requestedHost = validHost(requestedHostRaw);
  if (requestedHostRaw && !requestedHost) throw new Error(`Invalid --host: ${requestedHostRaw}`);
  const host = requestedHost ?? detectedHost();
  const requestedScope = value(args, "--host-scope") as HostScope | undefined;
  if (requestedScope && !["user", "project", "runtime"].includes(requestedScope)) throw new Error(`Invalid --host-scope: ${requestedScope}`);

  let integration: Record<string, unknown> = { status: "not-detected", message: "No supported agent host executable was detected. DockyardOS project state is initialized; host integration can be installed later with `dockyard host install`." };
  if (has(args, "--no-host-integration")) {
    integration = { status: "skipped", message: "Automatic agent-host integration was explicitly disabled for this initialization." };
  } else if (host) {
    const scope = requestedScope ?? defaultScope(host);
    try {
      const installed = await executeHostInstall(root, host, scope);
      integration = {
        status: "active",
        host,
        scope,
        result: installed,
        message: `DockyardOS ${host} agent integration is active at ${scope} scope. Future project requests should be mediated from the agent conversation without opening the extension.`,
      };
    } catch (error) {
      integration = {
        status: "needs-review",
        host,
        scope,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  const output = { project, integration };
  if (json) {
    console.log(JSON.stringify(output, null, 2));
    return;
  }
  console.log(`Initialized DockyardOS for ${project.name}`);
  console.log(`Project ID: ${project.id}`);
  console.log(`Mode: ${project.mode}`);
  if (integration.status === "active") console.log(`Agent mediation: active (${String(integration.host)} / ${String(integration.scope)})`);
  else if (integration.status === "needs-review") console.log(`Agent mediation: integration needs review (${String(integration.host)}): ${String(integration.message)}`);
  else console.log(`Agent mediation: ${String(integration.status)} — ${String(integration.message)}`);
}
