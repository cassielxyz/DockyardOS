import type { HostId } from "./types.js";
import type { HostScope } from "./host-types.js";
import { hostAdapter, hostAdapters } from "./host-adapters.js";
import { executeHostInstall, inspectHost, inspectHosts, planHostInstall } from "./host-manager.js";

function value(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function has(args: string[], name: string): boolean {
  return args.includes(name);
}

function parseHost(value: string | undefined): HostId {
  if (!value) throw new Error("--host is required");
  if (!hostAdapters.some((adapter) => adapter.id === value)) throw new Error(`Unknown DockyardOS host: ${value}`);
  return value as HostId;
}

function parseScope(value: string | undefined): HostScope {
  const scope = (value ?? "user") as HostScope;
  if (!["user", "project", "runtime"].includes(scope)) throw new Error(`Invalid host scope: ${scope}`);
  return scope;
}

export async function handleHostCommand(root: string, args: string[], json: boolean): Promise<void> {
  const subcommand = args[0];
  const rest = args.slice(1);

  if (subcommand === "list") {
    const data = hostAdapters.map((adapter) => ({
      id: adapter.id,
      name: adapter.displayName,
      executable: adapter.executable ?? null,
      features: adapter.features,
      supportsNativeResume: adapter.supportsNativeResume,
      supportsDockyardHooks: adapter.supportsDockyardHooks,
      verifiedAgainst: adapter.verifiedAgainst,
    }));
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (subcommand === "inspect") {
    const hostValue = value(rest, "--host");
    const data = hostValue ? await inspectHost(root, parseHost(hostValue)) : await inspectHosts(root);
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (subcommand === "plan") {
    const host = parseHost(value(rest, "--host"));
    const scope = parseScope(value(rest, "--scope"));
    console.log(JSON.stringify(planHostInstall(root, host, scope), null, 2));
    return;
  }

  if (subcommand === "install") {
    const host = parseHost(value(rest, "--host"));
    const scope = parseScope(value(rest, "--scope"));
    const result = await executeHostInstall(root, host, scope, { force: has(rest, "--force") });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (subcommand === "doctor") {
    const host = parseHost(value(rest, "--host"));
    const adapter = hostAdapter(host);
    const inspection = await inspectHost(root, host);
    const preferred = adapter.preferredSkillLocations.filter((location) => location.path);
    const discovered = [...inspection.projectSignals, ...inspection.globalSignals].some((signal) => signal.exists);
    const checks = [
      { name: "host-definition", status: "pass", detail: `${adapter.displayName} adapter is available.` },
      { name: "shared-dockyard-state", status: "pass", detail: "Host adapter uses the same DockyardOS external project state; no host-specific memory fork is created." },
      ...(adapter.executable ? [{ name: "host-executable", status: inspection.executableAvailable ? "pass" : "warn", detail: inspection.executableAvailable ? `${adapter.executable} is available on PATH.` : `${adapter.executable} is not currently available on PATH.` }] : []),
      { name: "portable-skill", status: discovered ? "pass" : preferred.length ? "warn" : "warn", detail: discovered ? "A verified DockyardOS host integration signal is present." : "DockyardOS portable skill/plugin has not been detected for this host in the inspected locations." },
      { name: "resume", status: "pass", detail: adapter.supportsNativeResume ? "Host has native resume in addition to DockyardOS durable resume." : "DockyardOS durable resume is available even without a host-native resume feature." },
    ];
    console.log(JSON.stringify(json ? { host, inspection, checks } : checks, null, 2));
    return;
  }

  throw new Error("Usage: dockyard host list | inspect [--host HOST] | plan --host HOST [--scope user|project|runtime] | install --host HOST [--scope ...] [--force] | doctor --host HOST");
}
