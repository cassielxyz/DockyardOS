import { lstat, readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import type { CommunityPackageManifest, InstalledCommunityPackage } from "./community-types.js";
import { communityTreeSha256 } from "./community-manager.js";
import { findCommunityPackage, loadCommunityRegistry } from "./community-registry.js";
import { readJson } from "./fs-utils.js";
import { dockyardHome } from "./project.js";

interface CommunityState {
  schemaVersion: 1;
  packages: Record<string, {
    activeRevision?: string;
    versions: InstalledCommunityPackage[];
  }>;
}

export interface ActiveCommunityPackage {
  id: string;
  displayName: string;
  version: string;
  revision: string;
  contentSha256: string;
  trust: InstalledCommunityPackage["trust"];
  risk: InstalledCommunityPackage["risk"];
  permissions: InstalledCommunityPackage["permissions"];
  capabilities: string[];
  tags: string[];
  hosts: CommunityPackageManifest["hosts"];
  entrypoints: CommunityPackageManifest["entrypoints"];
  integrity: "verified";
}

function statePath(): string {
  return resolve(dockyardHome(), "community", "state.json");
}

function packagesRoot(): string {
  return resolve(dockyardHome(), "community", "packages");
}

function isInside(root: string, candidate: string): boolean {
  const rel = relative(resolve(root), resolve(candidate));
  if (rel === "") return true;
  if (rel === ".." || rel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)) return false;
  return !rel.startsWith("/");
}

async function loadState(): Promise<CommunityState> {
  return (await readJson<CommunityState>(statePath())) ?? { schemaVersion: 1, packages: {} };
}

async function verifiedActiveRecord(id: string): Promise<{ manifest: CommunityPackageManifest; installed: InstalledCommunityPackage }> {
  const state = await loadState();
  const entry = state.packages[id];
  if (!entry?.activeRevision) throw new Error(`Community package is not active: ${id}`);
  const installed = entry.versions.find((version) => version.revision === entry.activeRevision);
  if (!installed) throw new Error(`Active community revision is missing from state: ${id}@${entry.activeRevision}`);

  const registry = await loadCommunityRegistry();
  const manifest = findCommunityPackage(registry, id);
  if (!manifest) throw new Error(`Active community package no longer has an installable manifest: ${id}`);

  const expectedRoot = resolve(packagesRoot(), id, installed.revision);
  if (!isInside(resolve(packagesRoot(), id), installed.destination) || resolve(installed.destination) !== expectedRoot) {
    throw new Error(`Active community package path is invalid: ${id}`);
  }
  const metadata = await lstat(expectedRoot).catch(() => undefined);
  if (!metadata?.isDirectory()) throw new Error(`Active community package directory is missing: ${id}@${installed.revision}`);
  const digest = await communityTreeSha256(expectedRoot, {
    maxFiles: manifest.maxFiles ?? 1000,
    maxBytes: manifest.maxBytes ?? 20 * 1024 * 1024,
  });
  if (digest !== installed.contentSha256) throw new Error(`Active community package failed integrity verification: ${id}@${installed.revision}`);
  return { manifest, installed };
}

export async function activeCommunityPackages(): Promise<ActiveCommunityPackage[]> {
  const state = await loadState();
  const result: ActiveCommunityPackage[] = [];
  for (const id of Object.keys(state.packages).sort()) {
    if (!state.packages[id]?.activeRevision) continue;
    const { manifest, installed } = await verifiedActiveRecord(id);
    result.push({
      id,
      displayName: installed.displayName,
      version: installed.version,
      revision: installed.revision,
      contentSha256: installed.contentSha256,
      trust: installed.trust,
      risk: installed.risk,
      permissions: installed.permissions,
      capabilities: manifest.capabilities,
      tags: manifest.tags,
      hosts: manifest.hosts,
      entrypoints: manifest.entrypoints,
      integrity: "verified",
    });
  }
  return result;
}

export async function readActiveCommunityEntrypoint(id: string, entrypointPath: string): Promise<{
  packageId: string;
  revision: string;
  entrypoint: string;
  type: CommunityPackageManifest["entrypoints"][number]["type"];
  content: string;
}> {
  const { manifest, installed } = await verifiedActiveRecord(id);
  const entrypoint = manifest.entrypoints.find((item) => item.path === entrypointPath);
  if (!entrypoint) throw new Error(`Path is not a declared entrypoint for ${id}: ${entrypointPath}`);
  const absolute = resolve(installed.destination, entrypoint.path);
  if (!isInside(installed.destination, absolute)) throw new Error(`Declared community entrypoint escaped package root: ${entrypoint.path}`);
  const metadata = await lstat(absolute).catch(() => undefined);
  if (!metadata?.isFile() || metadata.isSymbolicLink()) throw new Error(`Declared community entrypoint is missing or unsafe: ${entrypoint.path}`);
  if (Number(metadata.size ?? 0) > 2 * 1024 * 1024) throw new Error(`Community entrypoint is too large to expose through Dockyard MCP: ${entrypoint.path}`);
  const content = await readFile(absolute, "utf8");
  if (content.includes("\u0000")) throw new Error(`Community entrypoint appears binary and cannot be exposed as text: ${entrypoint.path}`);
  return { packageId: id, revision: installed.revision, entrypoint: entrypoint.path, type: entrypoint.type, content };
}
