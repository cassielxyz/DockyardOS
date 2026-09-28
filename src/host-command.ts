import type { HostId } from "./types.js";
import type { HostScope } from "./host-types.js";
import { hostAdapter, hostAdapters } from "./host-adapters.js";
import { executeHostInstall, inspectHost, inspectHosts, planHostInstall } from "./host-manager.js";
import { applyNativeHostMerge, nativeMergeHosts, planNativeHostMerge } from "./host-native-merge.js";

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
      nativeBundle: adapter.nativeBundle ?? null,
      nativeMergeSupported: nativeMergeHosts().includes(adapter.id),
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

  if (subcommand === "native") {
    const action = rest[0] ?? "list";
    const nativeArgs = rest.slice(1);
    if (action === "list") {
      console.log(JSON.stringify(nativeMergeHosts().map((id) => ({ id, name: hostAdapter(id).displayName })), null, 2));
      return;
    }
    const host = parseHost(value(nativeArgs, "--host"));
    if (!nativeMergeHosts().includes(host)) {
      throw new Error(`${hostAdapter(host).displayName} does not use the P24 review-first project-file merge path; use its verified native install surface instead.`);
    }
    if (action === "plan") {
      console.log(JSON.stringify(await planNativeHostMerge(root, host), null, 2));
      return;
    }
    if (action === "apply") {
      const expectedPlanSha256 = value(nativeArgs, "--expected-plan-sha256");
      if (!expectedPlanSha256) throw new Error("--expected-plan-sha256 is required for native apply");
      console.log(JSON.stringify(await applyNativeHostMerge(root, host, {
        approve: has(nativeArgs, "--approve"),
        expectedPlanSha256,
      }), null, 2));
      return;
    }
    throw new Error("Usage: dockyard host native list | plan --host HOST | apply --host HOST --approve --expected-plan-sha256 SHA256");
  }

  if (subcommand === "native-info") {
    const host = parseHost(value(rest, "--host"));
    const adapter = hostAdapter(host);
    const inspection = await inspectHost(root, host);
    console.log(JSON.stringify({
      host,
      available: inspection.nativeBundleAvailable ?? false,
      bundle: adapter.nativeBundle ?? null,
      safeMergeSupported: nativeMergeHosts().includes(host),
      note: adapter.nativeBundle
        ? nativeMergeHosts().includes(host)
          ? "Native bundle uses the P24 explicit plan/apply merge path. Existing unrelated config is preserved; conflicts remain review-required."
          : "Native bundle uses its verified host-native install surface rather than the P24 project-file merge path."
        : "No additional native bundle is registered for this host.",
    }, null, 2));
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
      { name: "portable-skill", status: discovered ? "pass" : "warn", detail: discovered ? "A verified DockyardOS portable host integration signal is present." : preferred.length ? "DockyardOS portable skill/plugin has not been detected for this host in the inspected locations." : "No portable skill location is configured for this host." },
      ...(adapter.nativeBundle ? [{ name: "native-bundle", status: inspection.nativeBundleAvailable ? "pass" : "warn", detail: inspection.nativeBundleAvailable ? `Optional ${adapter.nativeBundle.mode} bundle is packaged at ${adapter.nativeBundle.path}.` : `Configured native bundle is missing: ${adapter.nativeBundle.path}` }] : []),
      ...(nativeMergeHosts().includes(host) ? [{ name: "native-safe-merge", status: "pass", detail: "P24 explicit native plan/apply rules are available; customized/malformed/conflicting files remain review-required." }] : []),
      { name: "resume", status: "pass", detail: adapter.supportsNativeResume ? "Host has native resume in addition to DockyardOS durable resume." : "DockyardOS durable resume is available even without a host-native resume feature." },
    ];
    console.log(JSON.stringify(json ? { host, inspection, checks } : checks, null, 2));
    return;
  }

  throw new Error("Usage: dockyard host list | inspect [--host HOST] | plan --host HOST [--scope user|project|runtime] | install --host HOST [--scope ...] [--force] | native list|plan|apply ... | native-info --host HOST | doctor --host HOST");
}
