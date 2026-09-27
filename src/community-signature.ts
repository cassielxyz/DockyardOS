import { createPublicKey, verify } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { CommunityPackageManifest } from "./community-types.js";

export interface PublisherKey {
  id: string;
  publisherId: string;
  algorithm: "ed25519";
  publicKeyPem: string;
  createdAt: string;
  revokedAt?: string;
}

export interface PublisherKeyRegistry {
  schemaVersion: 1;
  updatedAt: string;
  keys: PublisherKey[];
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function communityManifestPayload(pkg: CommunityPackageManifest): string {
  const { signature: _signature, ...unsigned } = pkg;
  return stableJson(unsigned);
}

export async function loadPublisherKeys(path?: string): Promise<PublisherKeyRegistry> {
  const target = path ?? fileURLToPath(new URL("../registry/publishers.json", import.meta.url));
  const registry = JSON.parse(await readFile(target, "utf8")) as PublisherKeyRegistry;
  if (registry.schemaVersion !== 1 || !Array.isArray(registry.keys)) throw new Error("Invalid DockyardOS publisher key registry.");
  const ids = new Set<string>();
  for (const key of registry.keys) {
    if (!key.id || ids.has(key.id)) throw new Error(`Invalid/duplicate publisher key id: ${key.id}`);
    ids.add(key.id);
    if (key.algorithm !== "ed25519") throw new Error(`Unsupported publisher key algorithm: ${key.algorithm}`);
    if (!key.publisherId || !key.publicKeyPem) throw new Error(`Publisher key ${key.id} is incomplete.`);
  }
  return registry;
}

export async function verifyCommunitySignature(
  pkg: CommunityPackageManifest,
  keys?: PublisherKeyRegistry,
): Promise<{ required: boolean; present: boolean; verified: boolean; keyId?: string; reason: string }> {
  const required = pkg.publisher.signatureRequired ?? pkg.trust === "community";
  if (!pkg.signature) return { required, present: false, verified: false, reason: required ? "Required package signature is missing." : "Package is unsigned." };
  if (pkg.signature.algorithm !== "ed25519") return { required, present: true, verified: false, keyId: pkg.signature.keyId, reason: "Unsupported package signature algorithm." };
  const registry = keys ?? await loadPublisherKeys();
  const key = registry.keys.find((item) => item.id === pkg.signature!.keyId && item.publisherId === pkg.publisher.id);
  if (!key) return { required, present: true, verified: false, keyId: pkg.signature.keyId, reason: "Signature key is not present in the trusted publisher registry." };
  if (key.revokedAt) return { required, present: true, verified: false, keyId: key.id, reason: `Publisher key was revoked at ${key.revokedAt}.` };

  try {
    const publicKey = createPublicKey(key.publicKeyPem);
    const ok = verify(null, Buffer.from(communityManifestPayload(pkg), "utf8"), publicKey, Buffer.from(pkg.signature.value, "base64"));
    return { required, present: true, verified: ok, keyId: key.id, reason: ok ? "Ed25519 package manifest signature verified." : "Package signature verification failed." };
  } catch (error) {
    return { required, present: true, verified: false, keyId: key.id, reason: `Package signature could not be verified: ${error instanceof Error ? error.message : String(error)}` };
  }
}
