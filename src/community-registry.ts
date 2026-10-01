import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { CommunityPackageManifest, CommunityRegistryIndex } from "./community-types.js";

const ID = /^[a-z0-9][a-z0-9._-]{1,79}$/;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const GIT_REF = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/;
const EXECUTABLE = /^[A-Za-z0-9._+-]{1,80}$/;
const HOSTS = new Set(["antigravity", "gemini-cli", "codex", "claude-code", "cursor", "opencode", "universal"]);
const PERMISSIONS = new Set(["filesystem-read", "filesystem-write", "shell", "network", "browser", "git-write", "secrets", "database-read", "database-write", "deployment", "dns"]);
const KINDS = new Set(["skill", "tool", "agent", "mcp", "provider", "workflow"]);
const TRUST = new Set(["official", "maintainer", "community", "dockyard"]);
const RISK = new Set(["low", "medium", "high"]);
const CHANNEL = new Set(["stable", "recommended", "edge", "dev"]);
const CONNECTION_KINDS = new Set(["provider", "mcp"]);
const PROVIDER_MINIMUM_READINESS = new Set(["configured", "authenticated", "linked"]);
const DEFAULT_REGISTRY_URL = new URL("../registry/community.json", import.meta.url);
const CURATED_OVERLAY_URL = new URL("../registry/curated-packages.json", import.meta.url);

function safeRelativePath(value: string): boolean {
  if (!value || value.includes("\\") || value.startsWith("/") || value.startsWith("~")) return false;
  const parts = value.split("/");
  return !parts.some((part) => !part || part === "." || part === "..");
}

function safeGitRef(value: string): boolean {
  if (!GIT_REF.test(value)) return false;
  if (value.includes("..") || value.includes("@{") || value.endsWith(".") || value.endsWith("/") || value.endsWith(".lock")) return false;
  if (value.includes("//") || value.includes("/.")) return false;
  return true;
}

export function validateCommunityPackage(pkg: CommunityPackageManifest): string[] {
  const errors: string[] = [];
  if (pkg.schemaVersion !== 1) errors.push(`${pkg.id || "package"}: unsupported schemaVersion`);
  if (!ID.test(pkg.id)) errors.push(`${pkg.id || "package"}: invalid package id`);
  if (!pkg.displayName.trim()) errors.push(`${pkg.id}: displayName is required`);
  if (!pkg.version.trim()) errors.push(`${pkg.id}: version is required`);
  if (!KINDS.has(pkg.kind)) errors.push(`${pkg.id}: invalid kind ${pkg.kind}`);
  if (!pkg.description.trim()) errors.push(`${pkg.id}: description is required`);
  if (pkg.source.type !== "github") errors.push(`${pkg.id}: only github sources are supported by the P6 safe fetcher`);
  if (!REPOSITORY.test(pkg.source.repository)) errors.push(`${pkg.id}: source.repository must be owner/repo`);
  if (!safeGitRef(pkg.source.ref)) errors.push(`${pkg.id}: unsafe or invalid source.ref`);
  if (pkg.source.subdirectory && !safeRelativePath(pkg.source.subdirectory)) errors.push(`${pkg.id}: unsafe source.subdirectory`);
  if (!pkg.publisher?.id?.trim() || !pkg.publisher?.name?.trim()) errors.push(`${pkg.id}: publisher id/name are required`);
  if (!pkg.license.trim()) errors.push(`${pkg.id}: license is required`);
  if (!TRUST.has(pkg.trust)) errors.push(`${pkg.id}: invalid trust ${pkg.trust}`);
  if (!RISK.has(pkg.risk)) errors.push(`${pkg.id}: invalid risk ${pkg.risk}`);
  if (!CHANNEL.has(pkg.channel)) errors.push(`${pkg.id}: invalid channel ${pkg.channel}`);
  if (!pkg.entrypoints.length) errors.push(`${pkg.id}: at least one explicit entrypoint is required`);
  const entrypoints = new Set<string>();
  for (const entrypoint of pkg.entrypoints) {
    if (!safeRelativePath(entrypoint.path)) errors.push(`${pkg.id}: unsafe entrypoint path ${entrypoint.path}`);
    if (entrypoints.has(entrypoint.path)) errors.push(`${pkg.id}: duplicate entrypoint ${entrypoint.path}`);
    entrypoints.add(entrypoint.path);
  }
  for (const permission of pkg.permissions) if (!PERMISSIONS.has(permission)) errors.push(`${pkg.id}: unknown permission ${permission}`);
  for (const host of pkg.hosts) if (!HOSTS.has(host)) errors.push(`${pkg.id}: unknown host ${host}`);
  if (pkg.runtimeRequirements) {
    const executables = pkg.runtimeRequirements.executables ?? [];
    if (executables.length > 16) errors.push(`${pkg.id}: runtime executable requirement count exceeds 16`);
    const seenExecutables = new Set<string>();
    for (const executable of executables) {
      if (!EXECUTABLE.test(executable)) errors.push(`${pkg.id}: invalid runtime executable ${executable}`);
      if (seenExecutables.has(executable)) errors.push(`${pkg.id}: duplicate runtime executable ${executable}`);
      seenExecutables.add(executable);
    }

    const connections = pkg.runtimeRequirements.connections ?? [];
    if (connections.length > 16) errors.push(`${pkg.id}: runtime connection requirement count exceeds 16`);
    const seenConnections = new Set<string>();
    for (const connection of connections) {
      const kind = (connection as { kind?: unknown }).kind;
      const id = (connection as { id?: unknown }).id;
      const required = (connection as { required?: unknown }).required;
      if (typeof kind !== "string" || !CONNECTION_KINDS.has(kind)) {
        errors.push(`${pkg.id}: invalid runtime connection kind ${String(kind)}`);
        continue;
      }
      if (typeof id !== "string" || !ID.test(id)) errors.push(`${pkg.id}: invalid runtime connection id ${String(id)}`);
      if (typeof required !== "boolean") errors.push(`${pkg.id}: runtime connection ${String(id)} must declare required=true|false`);
      const key = `${kind}:${String(id)}`;
      if (seenConnections.has(key)) errors.push(`${pkg.id}: duplicate runtime connection ${key}`);
      seenConnections.add(key);

      if (kind === "provider") {
        const minimum = (connection as { minimumReadiness?: unknown }).minimumReadiness;
        if (typeof minimum !== "string" || !PROVIDER_MINIMUM_READINESS.has(minimum)) {
          errors.push(`${pkg.id}: provider runtime connection ${String(id)} must use minimumReadiness configured|authenticated|linked`);
        }
      } else if ("minimumReadiness" in (connection as object)) {
        errors.push(`${pkg.id}: MCP runtime connection ${String(id)} must not declare provider minimumReadiness`);
      }
    }

    for (const note of pkg.runtimeRequirements.notes ?? []) {
      if (!note.trim() || note.length > 1000 || /[\u0000-\u001f\u007f]/.test(note)) errors.push(`${pkg.id}: invalid runtime requirement note`);
    }
  }
  if ((pkg.maxFiles ?? 1000) < 1 || (pkg.maxFiles ?? 1000) > 5000) errors.push(`${pkg.id}: maxFiles must be between 1 and 5000`);
  if ((pkg.maxBytes ?? 20 * 1024 * 1024) < 1024 || (pkg.maxBytes ?? 20 * 1024 * 1024) > 100 * 1024 * 1024) errors.push(`${pkg.id}: maxBytes must be between 1 KiB and 100 MiB`);
  if (pkg.signature) {
    if (pkg.signature.algorithm !== "ed25519") errors.push(`${pkg.id}: unsupported signature algorithm`);
    if (!pkg.signature.keyId.trim() || !pkg.signature.value.trim()) errors.push(`${pkg.id}: signature keyId/value are required`);
    if (pkg.publisher.keyId && pkg.publisher.keyId !== pkg.signature.keyId) errors.push(`${pkg.id}: publisher keyId does not match signature keyId`);
  }
  return errors;
}

export function validateCommunityRegistry(index: CommunityRegistryIndex): string[] {
  const errors: string[] = [];
  if (index.schemaVersion !== 1) errors.push("registry: unsupported schemaVersion");
  if (!Number.isFinite(Date.parse(index.updatedAt))) errors.push("registry: updatedAt must be an ISO date");
  const ids = new Set<string>();
  for (const pkg of index.packages) {
    if (ids.has(pkg.id)) errors.push(`registry: duplicate package id ${pkg.id}`);
    ids.add(pkg.id);
    errors.push(...validateCommunityPackage(pkg));
  }
  const sourceIds = new Set<string>();
  for (const source of index.discoverySources) {
    if (!ID.test(source.id)) errors.push(`registry: invalid discovery source id ${source.id}`);
    if (sourceIds.has(source.id)) errors.push(`registry: duplicate discovery source id ${source.id}`);
    sourceIds.add(source.id);
    if (!source.locator.trim()) errors.push(`${source.id}: locator is required`);
    if (!TRUST.has(source.trust)) errors.push(`${source.id}: invalid trust ${source.trust}`);
  }
  return errors;
}

async function readRegistry(target: string): Promise<CommunityRegistryIndex> {
  return JSON.parse(await readFile(target, "utf8")) as CommunityRegistryIndex;
}

function mergeBundledRegistries(base: CommunityRegistryIndex, overlay: CommunityRegistryIndex): CommunityRegistryIndex {
  const updatedAt = Date.parse(overlay.updatedAt) > Date.parse(base.updatedAt) ? overlay.updatedAt : base.updatedAt;
  return {
    schemaVersion: 1,
    updatedAt,
    packages: [...base.packages, ...overlay.packages],
    discoverySources: [...base.discoverySources, ...overlay.discoverySources],
  };
}

export async function loadCommunityRegistry(path?: string): Promise<CommunityRegistryIndex> {
  if (path) {
    const parsed = await readRegistry(path);
    const errors = validateCommunityRegistry(parsed);
    if (errors.length) throw new Error(`Invalid DockyardOS community registry: ${errors.join("; ")}`);
    return parsed;
  }

  const base = await readRegistry(fileURLToPath(DEFAULT_REGISTRY_URL));
  let parsed = base;
  try {
    const curated = await readRegistry(fileURLToPath(CURATED_OVERLAY_URL));
    parsed = mergeBundledRegistries(base, curated);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const errors = validateCommunityRegistry(parsed);
  if (errors.length) throw new Error(`Invalid DockyardOS community registry: ${errors.join("; ")}`);
  return parsed;
}

export function findCommunityPackage(index: CommunityRegistryIndex, id: string): CommunityPackageManifest | undefined {
  return index.packages.find((pkg) => pkg.id === id);
}

export function searchCommunityRegistry(index: CommunityRegistryIndex, query: string): {
  packages: CommunityPackageManifest[];
  sources: CommunityRegistryIndex["discoverySources"];
} {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const matches = (values: string[]) => terms.every((term) => values.some((value) => value.toLowerCase().includes(term)));
  return {
    packages: index.packages.filter((pkg) => matches([pkg.id, pkg.displayName, pkg.description, ...pkg.capabilities, ...pkg.tags, pkg.source.repository])),
    sources: index.discoverySources.filter((source) => matches([source.id, source.displayName, source.locator, ...source.notes])),
  };
}
