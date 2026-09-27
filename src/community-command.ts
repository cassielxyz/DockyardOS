import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { findCommunityPackage, loadCommunityRegistry, searchCommunityRegistry } from "./community-registry.js";
import { communityStatus, resolveAssessCommunityPackage, rollbackCommunityPackage } from "./community-manager.js";
import { resolveAssessInstallPinnedCommunityPackage } from "./community-install.js";
import { activeCommunityPackages, readActiveCommunityEntrypoint } from "./community-runtime.js";
import { readTransparencyLog, verifyTransparencyLog } from "./community-transparency.js";
import { cachedRemoteRegistryIndexes, loadRemoteRegistrySources, syncRemoteRegistry } from "./community-remote.js";
import { createSigningKey, publisherRegistryKeySnippet, remoteRegistryTrustKeySnippet, signCommunityManifestWithLocalKey, signRegistryEnvelopeWithLocalKey } from "./community-publisher.js";
import { executeCommunityCanary, planCommunityCanary, type CommunityCanaryBackend } from "./community-canary.js";
import type { CommunityPackageManifest } from "./community-types.js";
import type { SignedRegistryEnvelope } from "./community-remote-types.js";

function value(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function values(args: string[], name: string): string[] {
  const result: string[] = [];
  for (let i = 0; i < args.length; i += 1) if (args[i] === name && args[i + 1] !== undefined) result.push(args[i + 1]!);
  return result;
}

function has(args: string[], name: string): boolean {
  return args.includes(name);
}

function required(args: string[], name: string): string {
  const result = value(args, name);
  if (!result) throw new Error(`${name} is required`);
  return result;
}

function requiredId(args: string[]): string {
  return required(args, "--id");
}

async function readJsonFile<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(resolve(path), "utf8")) as T;
}

async function writeJsonFile(path: string, valueToWrite: unknown): Promise<string> {
  const target = resolve(path);
  await writeFile(target, `${JSON.stringify(valueToWrite, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  return target;
}

async function handleRemote(rest: string[]): Promise<void> {
  const action = rest[0] ?? "sources";
  const args = rest.slice(1);
  if (action === "sources") {
    console.log(JSON.stringify(await loadRemoteRegistrySources(), null, 2));
    return;
  }
  if (action === "cached") {
    const cached = await cachedRemoteRegistryIndexes();
    console.log(JSON.stringify(has(args, "--full") ? cached : cached.map((item) => ({
      sourceId: item.sourceId,
      sequence: item.record.sequence,
      verifiedAt: item.record.verifiedAt,
      expiresAt: item.record.expiresAt,
      packages: item.index.packages.length,
      discoverySources: item.index.discoverySources.length,
      indexSha256: item.record.indexSha256,
    })), null, 2));
    return;
  }
  if (action === "sync") {
    const configuration = await loadRemoteRegistrySources();
    const id = value(args, "--id");
    const selected = configuration.sources.filter((source) => source.enabled && (!id || source.id === id));
    if (id && !configuration.sources.some((source) => source.id === id)) throw new Error(`Unknown remote registry source: ${id}`);
    if (!selected.length) throw new Error(id ? `Remote registry source is disabled: ${id}` : "No enabled remote registry sources are configured.");
    const results: Array<Record<string, unknown>> = [];
    for (const source of selected) {
      try {
        results.push({ ok: true, ...(await syncRemoteRegistry(source)) });
      } catch (error) {
        results.push({ ok: false, sourceId: source.id, error: error instanceof Error ? error.message : String(error) });
        process.exitCode = 1;
      }
    }
    console.log(JSON.stringify(results, null, 2));
    return;
  }
  throw new Error("Usage: dockyard community remote sources | sync [--id SOURCE] | cached [--full]");
}

async function handlePublisher(rest: string[]): Promise<void> {
  const action = rest[0];
  const args = rest.slice(1);
  if (action === "keygen") {
    const publisherId = requiredId(args);
    const info = await createSigningKey("publisher", publisherId, value(args, "--key-id"));
    console.log(JSON.stringify({
      scope: info.scope,
      publisherId: info.ownerId,
      keyId: info.keyId,
      publicKeyPem: info.publicKeyPem,
      privateKeyPath: info.privateKeyPath,
      createdAt: info.createdAt,
      registryEntry: publisherRegistryKeySnippet(info),
      note: "Private key material is never printed; keep the referenced local private-key file secret and backed up securely.",
    }, null, 2));
    return;
  }
  if (action === "sign") {
    const input = required(args, "--file");
    const output = required(args, "--out");
    const keyId = required(args, "--key-id");
    const manifest = await readJsonFile<CommunityPackageManifest>(input);
    const signed = await signCommunityManifestWithLocalKey(manifest, keyId);
    const target = await writeJsonFile(output, signed);
    console.log(JSON.stringify({ ok: true, packageId: signed.id, keyId, output: target }, null, 2));
    return;
  }
  throw new Error("Usage: dockyard community publisher keygen --id PUBLISHER [--key-id KEY] | sign --file manifest.json --key-id KEY --out signed.json");
}

async function handleRegistrySigning(rest: string[]): Promise<void> {
  const action = rest[0];
  const args = rest.slice(1);
  if (action === "keygen") {
    const registryId = requiredId(args);
    const info = await createSigningKey("registry", registryId, value(args, "--key-id"));
    console.log(JSON.stringify({
      scope: info.scope,
      registryId: info.ownerId,
      keyId: info.keyId,
      publicKeyPem: info.publicKeyPem,
      privateKeyPath: info.privateKeyPath,
      createdAt: info.createdAt,
      trustStoreEntry: remoteRegistryTrustKeySnippet(info),
      note: "Private key material is never printed. Publish only the returned trust-store entry/public key.",
    }, null, 2));
    return;
  }
  if (action === "sign") {
    const input = required(args, "--file");
    const output = required(args, "--out");
    const keyId = required(args, "--key-id");
    const envelope = await readJsonFile<SignedRegistryEnvelope>(input);
    const signed = await signRegistryEnvelopeWithLocalKey(envelope, keyId);
    const target = await writeJsonFile(output, signed);
    console.log(JSON.stringify({ ok: true, registryId: signed.registryId, sequence: signed.sequence, keyId, output: target }, null, 2));
    return;
  }
  throw new Error("Usage: dockyard community registry-key keygen --id REGISTRY [--key-id KEY] | sign --file envelope.json --key-id KEY --out signed.json");
}

async function handleCanary(rest: string[]): Promise<void> {
  const action = rest[0] ?? "plan";
  const args = rest.slice(1);
  if (!["plan", "run"].includes(action)) throw new Error("Usage: dockyard community canary plan|run --id ID --image NAME@sha256:... --command CMD [--arg VALUE] [--backend docker|podman] [--timeout SECONDS]");
  const id = requiredId(args);
  const image = required(args, "--image");
  const command = required(args, "--command");
  const backendRaw = value(args, "--backend");
  if (backendRaw && !["docker", "podman"].includes(backendRaw)) throw new Error("--backend must be docker or podman");
  const timeoutRaw = value(args, "--timeout");
  const timeoutSeconds = timeoutRaw ? Number(timeoutRaw) : undefined;
  if (timeoutRaw && (!Number.isInteger(timeoutSeconds) || (timeoutSeconds ?? 0) < 1 || (timeoutSeconds ?? 0) > 300)) throw new Error("--timeout must be an integer from 1 to 300 seconds");
  const resolved = await resolveAssessCommunityPackage(id);
  const packagePath = resolve(resolved.resolution.quarantinePath, resolved.manifest.source.subdirectory ?? ".");
  const plan = planCommunityCanary({
    packageId: id,
    packagePath,
    image,
    command,
    args: values(args, "--arg"),
    ...(backendRaw ? { backend: backendRaw as CommunityCanaryBackend } : {}),
    ...(timeoutSeconds ? { timeoutSeconds } : {}),
  });
  if (action === "plan") {
    console.log(JSON.stringify({ assessment: resolved.assessment.decision, assessmentReasons: resolved.assessment.reasons, plan }, null, 2));
    return;
  }
  const result = await executeCommunityCanary(plan);
  console.log(JSON.stringify({ assessment: resolved.assessment.decision, assessmentReasons: resolved.assessment.reasons, result }, null, 2));
  if (result.status !== "pass") process.exitCode = 1;
}

export async function handleCommunityCommand(args: string[], json: boolean): Promise<void> {
  const subcommand = args[0] ?? "list";
  const rest = args.slice(1);

  if (subcommand === "remote") return handleRemote(rest);
  if (subcommand === "publisher") return handlePublisher(rest);
  if (subcommand === "registry-key") return handleRegistrySigning(rest);
  if (subcommand === "canary") return handleCanary(rest);

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
    for (const pkg of registry.packages) if (!pkg.entrypoints.length) errors.push(`${pkg.id}: no entrypoints`);
    const transparency = await verifyTransparencyLog();
    console.log(JSON.stringify({
      registry: { ok: errors.length === 0, errors, packages: registry.packages.length, discoverySources: registry.discoverySources.length },
      transparency,
    }, null, 2));
    return;
  }

  throw new Error("Usage: dockyard community list | search --query TEXT | sources | remote sources|sync|cached | publisher keygen|sign | registry-key keygen|sign | canary plan|run | inspect --id ID | resolve --id ID | install --id ID [--approve] [--expected-revision SHA] [--expected-sha256 SHA256] | update --id ID [same options] | status [--id ID] | active | read --id ID --entrypoint PATH | rollback --id ID [--revision SHA] | transparency verify|show | verify");
}
