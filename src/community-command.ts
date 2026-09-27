import { findCommunityPackage, loadCommunityRegistry, searchCommunityRegistry } from "./community-registry.js";
import { communityStatus, resolveAssessCommunityPackage, rollbackCommunityPackage } from "./community-manager.js";
import { resolveAssessInstallPinnedCommunityPackage } from "./community-install.js";
import { activeCommunityPackages, readActiveCommunityEntrypoint } from "./community-runtime.js";
import { readTransparencyLog, verifyTransparencyLog } from "./community-transparency.js";

function value(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function has(args: string[], name: string): boolean {
  return args.includes(name);
}

function requiredId(args: string[]): string {
  const id = value(args, "--id");
  if (!id) throw new Error("--id is required");
  return id;
}

export async function handleCommunityCommand(args: string[], json: boolean): Promise<void> {
  const subcommand = args[0] ?? "list";
  const rest = args.slice(1);
  const registry = await loadCommunityRegistry();

  if (subcommand === "list") {
    console.log(JSON.stringify({
      packages: registry.packages.map((pkg) => ({
        id: pkg.id,
        name: pkg.displayName,
        kind: pkg.kind,
        source: `${pkg.source.repository}@${pkg.source.ref}`,
        trust: pkg.trust,
        risk: pkg.risk,
        permissions: pkg.permissions,
        capabilities: pkg.capabilities,
        channel: pkg.channel,
      })),
      discoverySources: registry.discoverySources,
    }, null, 2));
    return;
  }

  if (subcommand === "search") {
    const query = value(rest, "--query") ?? rest.filter((arg) => !arg.startsWith("--"))[0] ?? "";
    if (!query.trim()) throw new Error("community search requires --query TEXT");
    console.log(JSON.stringify(searchCommunityRegistry(registry, query), null, 2));
    return;
  }

  if (subcommand === "sources") {
    console.log(JSON.stringify(registry.discoverySources, null, 2));
    return;
  }

  if (subcommand === "inspect") {
    const id = requiredId(rest);
    const manifest = findCommunityPackage(registry, id);
    if (!manifest) throw new Error(`Community package is not installable in the bundled registry: ${id}`);
    console.log(JSON.stringify(manifest, null, 2));
    return;
  }

  if (subcommand === "resolve" || subcommand === "assess") {
    const result = await resolveAssessCommunityPackage(requiredId(rest));
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (subcommand === "install" || subcommand === "update") {
    const result = await resolveAssessInstallPinnedCommunityPackage(requiredId(rest), {
      approve: has(rest, "--approve"),
      ...(value(rest, "--expected-revision") ? { expectedRevision: value(rest, "--expected-revision") } : {}),
      ...(value(rest, "--expected-sha256") ? { expectedContentSha256: value(rest, "--expected-sha256") } : {}),
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (subcommand === "status") {
    console.log(JSON.stringify(await communityStatus(value(rest, "--id")), null, 2));
    return;
  }

  if (subcommand === "active") {
    console.log(JSON.stringify(await activeCommunityPackages(), null, 2));
    return;
  }

  if (subcommand === "read") {
    const entrypoint = value(rest, "--entrypoint");
    if (!entrypoint) throw new Error("community read requires --entrypoint PATH");
    console.log(JSON.stringify(await readActiveCommunityEntrypoint(requiredId(rest), entrypoint), null, 2));
    return;
  }

  if (subcommand === "rollback") {
    console.log(JSON.stringify(await rollbackCommunityPackage(requiredId(rest), value(rest, "--revision")), null, 2));
    return;
  }

  if (subcommand === "transparency") {
    const action = rest[0] ?? "verify";
    if (action === "verify") {
      console.log(JSON.stringify(await verifyTransparencyLog(), null, 2));
      return;
    }
    if (action === "show") {
      console.log(JSON.stringify(await readTransparencyLog(), null, 2));
      return;
    }
    throw new Error("Usage: dockyard community transparency verify|show");
  }

  if (subcommand === "verify") {
    const errors: string[] = [];
    for (const pkg of registry.packages) {
      if (!pkg.entrypoints.length) errors.push(`${pkg.id}: no entrypoints`);
    }
    const transparency = await verifyTransparencyLog();
    console.log(JSON.stringify({
      registry: { ok: errors.length === 0, errors, packages: registry.packages.length, discoverySources: registry.discoverySources.length },
      transparency,
    }, null, 2));
    return;
  }

  throw new Error("Usage: dockyard community list | search --query TEXT | sources | inspect --id ID | resolve --id ID | install --id ID [--approve] [--expected-revision SHA] [--expected-sha256 SHA256] | update --id ID [same options] | status [--id ID] | active | read --id ID --entrypoint PATH | rollback --id ID [--revision SHA] | transparency verify|show | verify");
}
