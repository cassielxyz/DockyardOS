import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { validateCommunityPackage } from "./community-registry.js";
import type { EffectiveRegistryOrigin } from "./community-effective-registry.js";
import type { CommunityPackageManifest } from "./community-types.js";
import { readJson, writeJsonAtomic } from "./fs-utils.js";
import { dockyardHome } from "./project.js";

export interface InstalledManifestSnapshot {
  schemaVersion: 1;
  packageId: string;
  revision: string;
  storedAt: string;
  origin: EffectiveRegistryOrigin;
  manifest: CommunityPackageManifest;
}

const ID = /^[a-z0-9][a-z0-9._-]{1,79}$/;
const REVISION = /^[a-f0-9]{40}$/i;

function snapshotPath(packageId: string, revision: string): string {
  if (!ID.test(packageId)) throw new Error(`Invalid community package id for manifest snapshot: ${packageId}`);
  if (!REVISION.test(revision)) throw new Error(`Invalid immutable community revision for manifest snapshot: ${revision}`);
  return resolve(dockyardHome(), "community", "manifests", packageId, `${revision.toLowerCase()}.json`);
}

export async function storeInstalledManifestSnapshot(
  manifest: CommunityPackageManifest,
  revision: string,
  origin: EffectiveRegistryOrigin,
): Promise<InstalledManifestSnapshot> {
  const errors = validateCommunityPackage(manifest);
  if (errors.length) throw new Error(`Refusing invalid manifest snapshot: ${errors.join("; ")}`);
  const target = snapshotPath(manifest.id, revision);
  await mkdir(resolve(target, ".."), { recursive: true, mode: 0o700 });
  const existing = await readJson<InstalledManifestSnapshot>(target);
  if (existing) {
    if (JSON.stringify(existing.manifest) !== JSON.stringify(manifest)) {
      throw new Error(`Manifest snapshot already exists with different content for ${manifest.id}@${revision}.`);
    }
    return existing;
  }
  const snapshot: InstalledManifestSnapshot = {
    schemaVersion: 1,
    packageId: manifest.id,
    revision: revision.toLowerCase(),
    storedAt: new Date().toISOString(),
    origin,
    manifest,
  };
  await writeJsonAtomic(target, snapshot);
  return snapshot;
}

export async function loadInstalledManifestSnapshot(
  packageId: string,
  revision: string,
): Promise<InstalledManifestSnapshot | undefined> {
  const snapshot = await readJson<InstalledManifestSnapshot>(snapshotPath(packageId, revision));
  if (!snapshot) return undefined;
  if (snapshot.schemaVersion !== 1 || snapshot.packageId !== packageId || snapshot.revision.toLowerCase() !== revision.toLowerCase()) {
    throw new Error(`Installed manifest snapshot metadata mismatch for ${packageId}@${revision}.`);
  }
  const errors = validateCommunityPackage(snapshot.manifest);
  if (errors.length || snapshot.manifest.id !== packageId) throw new Error(`Installed manifest snapshot is invalid for ${packageId}@${revision}: ${errors.join("; ")}`);
  return snapshot;
}
