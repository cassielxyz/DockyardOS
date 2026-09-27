import { createPrivateKey, generateKeyPairSync, sign } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { communityManifestPayload } from "./community-signature.js";
import { remoteRegistryEnvelopePayload } from "./community-remote.js";
import type { CommunityPackageManifest } from "./community-types.js";
import type { RegistryTrustKey, SignedRegistryEnvelope } from "./community-remote-types.js";
import { dockyardHome } from "./project.js";

const SAFE_ID = /^[a-z0-9][a-z0-9._-]{1,79}$/;

export type SigningKeyScope = "publisher" | "registry";

export interface SigningKeyInfo {
  scope: SigningKeyScope;
  ownerId: string;
  keyId: string;
  algorithm: "ed25519";
  publicKeyPem: string;
  privateKeyPath: string;
  createdAt: string;
}

function requireId(label: string, value: string): string {
  if (!SAFE_ID.test(value)) throw new Error(`${label} must match ${SAFE_ID}.`);
  return value;
}

function keyRoot(scope: SigningKeyScope, ownerId: string): string {
  return resolve(dockyardHome(), "signing-keys", scope, requireId("ownerId", ownerId));
}

function privateKeyPath(scope: SigningKeyScope, ownerId: string, keyId: string): string {
  return resolve(keyRoot(scope, ownerId), `${requireId("keyId", keyId)}.private.pem`);
}

function publicKeyPath(scope: SigningKeyScope, ownerId: string, keyId: string): string {
  return resolve(keyRoot(scope, ownerId), `${requireId("keyId", keyId)}.public.pem`);
}

export async function createSigningKey(
  scope: SigningKeyScope,
  ownerId: string,
  keyId = `${ownerId}-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`,
): Promise<SigningKeyInfo> {
  requireId("ownerId", ownerId);
  requireId("keyId", keyId);
  const directory = keyRoot(scope, ownerId);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const privatePath = privateKeyPath(scope, ownerId, keyId);
  const publicPath = publicKeyPath(scope, ownerId, keyId);
  await writeFile(privatePath, privateKeyPem, { mode: 0o600, flag: "wx" });
  await writeFile(publicPath, publicKeyPem, { mode: 0o644, flag: "wx" });
  return { scope, ownerId, keyId, algorithm: "ed25519", publicKeyPem, privateKeyPath: privatePath, createdAt: new Date().toISOString() };
}

async function localPrivateKey(scope: SigningKeyScope, ownerId: string, keyId: string): Promise<ReturnType<typeof createPrivateKey>> {
  const pem = await readFile(privateKeyPath(scope, ownerId, keyId), "utf8");
  return createPrivateKey(pem);
}

export async function signCommunityManifestWithLocalKey(
  manifest: CommunityPackageManifest,
  keyId: string,
): Promise<CommunityPackageManifest> {
  requireId("publisher id", manifest.publisher.id);
  requireId("keyId", keyId);
  const unsigned: CommunityPackageManifest = {
    ...manifest,
    publisher: { ...manifest.publisher, keyId, signatureRequired: true },
    signature: undefined,
  };
  delete (unsigned as { signature?: CommunityPackageManifest["signature"] }).signature;
  const privateKey = await localPrivateKey("publisher", manifest.publisher.id, keyId);
  const value = sign(null, Buffer.from(communityManifestPayload(unsigned), "utf8"), privateKey).toString("base64");
  return { ...unsigned, signature: { algorithm: "ed25519", keyId, value } };
}

export async function signRegistryEnvelopeWithLocalKey(
  envelope: SignedRegistryEnvelope,
  keyId: string,
): Promise<SignedRegistryEnvelope> {
  requireId("registryId", envelope.registryId);
  requireId("keyId", keyId);
  const unsigned: SignedRegistryEnvelope = {
    ...envelope,
    signature: { algorithm: "ed25519", keyId, value: "" },
  };
  const privateKey = await localPrivateKey("registry", envelope.registryId, keyId);
  const value = sign(null, Buffer.from(remoteRegistryEnvelopePayload(unsigned), "utf8"), privateKey).toString("base64");
  return { ...unsigned, signature: { algorithm: "ed25519", keyId, value } };
}

export function publisherRegistryKeySnippet(info: SigningKeyInfo): {
  id: string;
  publisherId: string;
  algorithm: "ed25519";
  publicKeyPem: string;
  createdAt: string;
} {
  if (info.scope !== "publisher") throw new Error("publisherRegistryKeySnippet requires a publisher signing key.");
  return { id: info.keyId, publisherId: info.ownerId, algorithm: "ed25519", publicKeyPem: info.publicKeyPem, createdAt: info.createdAt };
}

export function remoteRegistryTrustKeySnippet(info: SigningKeyInfo): RegistryTrustKey {
  if (info.scope !== "registry") throw new Error("remoteRegistryTrustKeySnippet requires a registry signing key.");
  return { id: info.keyId, registryId: info.ownerId, algorithm: "ed25519", publicKeyPem: info.publicKeyPem, createdAt: info.createdAt };
}
