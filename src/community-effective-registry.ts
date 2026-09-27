import type { CommunityPackageManifest, CommunityRegistryIndex, CommunityRegistrySource } from "./community-types.js";
import type { RemoteRegistryCacheRecord } from "./community-remote-types.js";
import { cachedRemoteRegistryIndexes } from "./community-remote.js";
import { loadCommunityRegistry } from "./community-registry.js";

export type EffectiveRegistryOrigin =
  | { kind: "bundled" }
  | { kind: "remote"; sourceId: string; sequence: number; indexSha256: string; verifiedAt: string; expiresAt: string };

export interface EffectiveCommunityPackage {
  manifest: CommunityPackageManifest;
  origin: EffectiveRegistryOrigin;
}

export interface EffectiveDiscoverySource {
  source: CommunityRegistrySource;
  origin: EffectiveRegistryOrigin;
}

export interface EffectiveRegistryConflict {
  kind: "package" | "discovery-source";
  id: string;
  origins: string[];
  reason: string;
}

export interface EffectiveCommunityRegistry {
  schemaVersion: 1;
  generatedAt: string;
  packages: EffectiveCommunityPackage[];
  discoverySources: EffectiveDiscoverySource[];
  conflicts: EffectiveRegistryConflict[];
  remoteRegistries: Array<{
    sourceId: string;
    sequence: number;
    verifiedAt: string;
    expiresAt: string;
    indexSha256: string;
    packages: number;
    discoverySources: number;
  }>;
}

export interface RemoteRegistryIndexInput {
  sourceId: string;
  record: RemoteRegistryCacheRecord;
  index: CommunityRegistryIndex;
}

function originLabel(origin: EffectiveRegistryOrigin): string {
  return origin.kind === "bundled" ? "bundled" : `remote:${origin.sourceId}@${origin.sequence}`;
}

function remoteOrigin(input: RemoteRegistryIndexInput): EffectiveRegistryOrigin {
  return {
    kind: "remote",
    sourceId: input.sourceId,
    sequence: input.record.sequence,
    indexSha256: input.record.indexSha256,
    verifiedAt: input.record.verifiedAt,
    expiresAt: input.record.expiresAt,
  };
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

export function mergeEffectiveCommunityRegistry(
  bundled: CommunityRegistryIndex,
  remotes: RemoteRegistryIndexInput[],
  now = new Date(),
): EffectiveCommunityRegistry {
  const packages = new Map<string, EffectiveCommunityPackage>();
  const discoverySources = new Map<string, EffectiveDiscoverySource>();
  const conflicts = new Map<string, EffectiveRegistryConflict>();
  const bundledPackageIds = new Set<string>();
  const bundledDiscoveryIds = new Set<string>();

  for (const manifest of bundled.packages) {
    bundledPackageIds.add(manifest.id);
    packages.set(manifest.id, { manifest, origin: { kind: "bundled" } });
  }
  for (const source of bundled.discoverySources) {
    bundledDiscoveryIds.add(source.id);
    discoverySources.set(source.id, { source, origin: { kind: "bundled" } });
  }

  const remotePackageClaims = new Map<string, Array<{ manifest: CommunityPackageManifest; origin: EffectiveRegistryOrigin }>>();
  const remoteDiscoveryClaims = new Map<string, Array<{ source: CommunityRegistrySource; origin: EffectiveRegistryOrigin }>>();

  for (const remote of [...remotes].sort((a, b) => a.sourceId.localeCompare(b.sourceId))) {
    const origin = remoteOrigin(remote);
    for (const manifest of remote.index.packages) {
      const claims = remotePackageClaims.get(manifest.id) ?? [];
      claims.push({ manifest, origin });
      remotePackageClaims.set(manifest.id, claims);
    }
    for (const source of remote.index.discoverySources) {
      const claims = remoteDiscoveryClaims.get(source.id) ?? [];
      claims.push({ source, origin });
      remoteDiscoveryClaims.set(source.id, claims);
    }
  }

  for (const [id, claims] of [...remotePackageClaims.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (bundledPackageIds.has(id)) {
      conflicts.set(`package:${id}`, {
        kind: "package",
        id,
        origins: sortedUnique(["bundled", ...claims.map((claim) => originLabel(claim.origin))]),
        reason: "Remote package id collides with a bundled package; bundled package remains authoritative and remote claims are excluded.",
      });
      continue;
    }
    if (claims.length !== 1) {
      conflicts.set(`package:${id}`, {
        kind: "package",
        id,
        origins: sortedUnique(claims.map((claim) => originLabel(claim.origin))),
        reason: "Multiple remote registries claim the same package id; all conflicting claims are excluded until the ambiguity is resolved.",
      });
      continue;
    }
    packages.set(id, { manifest: claims[0]!.manifest, origin: claims[0]!.origin });
  }

  for (const [id, claims] of [...remoteDiscoveryClaims.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (bundledDiscoveryIds.has(id)) {
      conflicts.set(`discovery-source:${id}`, {
        kind: "discovery-source",
        id,
        origins: sortedUnique(["bundled", ...claims.map((claim) => originLabel(claim.origin))]),
        reason: "Remote discovery-source id collides with a bundled source; bundled metadata remains authoritative.",
      });
      continue;
    }
    if (claims.length !== 1) {
      conflicts.set(`discovery-source:${id}`, {
        kind: "discovery-source",
        id,
        origins: sortedUnique(claims.map((claim) => originLabel(claim.origin))),
        reason: "Multiple remote registries claim the same discovery-source id; all conflicting claims are excluded.",
      });
      continue;
    }
    discoverySources.set(id, { source: claims[0]!.source, origin: claims[0]!.origin });
  }

  return {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    packages: [...packages.values()].sort((a, b) => a.manifest.id.localeCompare(b.manifest.id)),
    discoverySources: [...discoverySources.values()].sort((a, b) => a.source.id.localeCompare(b.source.id)),
    conflicts: [...conflicts.values()].sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`)),
    remoteRegistries: [...remotes]
      .sort((a, b) => a.sourceId.localeCompare(b.sourceId))
      .map((remote) => ({
        sourceId: remote.sourceId,
        sequence: remote.record.sequence,
        verifiedAt: remote.record.verifiedAt,
        expiresAt: remote.record.expiresAt,
        indexSha256: remote.record.indexSha256,
        packages: remote.index.packages.length,
        discoverySources: remote.index.discoverySources.length,
      })),
  };
}

export async function loadEffectiveCommunityRegistry(): Promise<EffectiveCommunityRegistry> {
  const [bundled, remotes] = await Promise.all([loadCommunityRegistry(), cachedRemoteRegistryIndexes()]);
  return mergeEffectiveCommunityRegistry(bundled, remotes);
}

export async function findEffectiveCommunityPackage(id: string): Promise<EffectiveCommunityPackage | undefined> {
  const registry = await loadEffectiveCommunityRegistry();
  return registry.packages.find((item) => item.manifest.id === id);
}

export function searchEffectiveCommunityRegistry(registry: EffectiveCommunityRegistry, query: string): {
  packages: EffectiveCommunityPackage[];
  discoverySources: EffectiveDiscoverySource[];
  conflicts: EffectiveRegistryConflict[];
} {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const matches = (values: string[]) => terms.every((term) => values.some((value) => value.toLowerCase().includes(term)));
  return {
    packages: registry.packages.filter(({ manifest, origin }) => matches([
      manifest.id,
      manifest.displayName,
      manifest.description,
      ...manifest.capabilities,
      ...manifest.tags,
      manifest.source.repository,
      originLabel(origin),
    ])),
    discoverySources: registry.discoverySources.filter(({ source, origin }) => matches([
      source.id,
      source.displayName,
      source.locator,
      ...source.notes,
      originLabel(origin),
    ])),
    conflicts: registry.conflicts.filter((conflict) => matches([conflict.id, conflict.reason, ...conflict.origins])),
  };
}
