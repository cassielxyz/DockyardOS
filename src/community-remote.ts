import { createHash, createPublicKey, verify } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { CommunityRegistryIndex } from "./community-types.js";
import type {
  RegistryTrustStore,
  RemoteRegistryCacheRecord,
  RemoteRegistrySource,
  RemoteRegistrySourcesFile,
  RemoteRegistrySyncResult,
  SignedRegistryEnvelope,
} from "./community-remote-types.js";
import { validateCommunityRegistry } from "./community-registry.js";
import { readJson, writeJsonAtomic } from "./fs-utils.js";
import { dockyardHome } from "./project.js";

interface RemoteRegistryState {
  schemaVersion: 1;
  current?: RemoteRegistryCacheRecord;
  history: RemoteRegistryCacheRecord[];
}

const CLOCK_SKEW_MS = 5 * 60 * 1000;
const MIN_MAX_BYTES = 1024;
const MAX_MAX_BYTES = 10 * 1024 * 1024;
const MAX_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function remoteRegistryEnvelopePayload(envelope: SignedRegistryEnvelope): string {
  const { signature: _signature, ...unsigned } = envelope;
  return stableJson(unsigned);
}

function blockedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (lower === "localhost" || lower.endsWith(".localhost") || lower.endsWith(".local")) return true;
  if (lower === "::1" || lower === "0.0.0.0") return true;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(lower);
  if (!v4) return false;
  const parts = v4.slice(1).map(Number);
  if (parts.some((part) => part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

export function validateRemoteRegistrySource(source: RemoteRegistrySource): string[] {
  const errors: string[] = [];
  if (!/^[a-z0-9][a-z0-9._-]{1,79}$/.test(source.id)) errors.push(`${source.id || "source"}: invalid id`);
  if (!source.displayName.trim()) errors.push(`${source.id}: displayName is required`);
  if (!source.keyId.trim()) errors.push(`${source.id}: keyId is required`);
  if (!source.allowedHostname.trim() || blockedHostname(source.allowedHostname)) errors.push(`${source.id}: allowedHostname is invalid or private/local`);
  if (!Number.isInteger(source.maxBytes) || source.maxBytes < MIN_MAX_BYTES || source.maxBytes > MAX_MAX_BYTES) errors.push(`${source.id}: maxBytes must be between 1 KiB and 10 MiB`);
  if (!Number.isInteger(source.maxAgeSeconds) || source.maxAgeSeconds < 60 || source.maxAgeSeconds > MAX_MAX_AGE_SECONDS) errors.push(`${source.id}: maxAgeSeconds must be between 60 seconds and 30 days`);
  try {
    const url = new URL(source.url);
    if (url.protocol !== "https:") errors.push(`${source.id}: registry URL must use HTTPS`);
    if (url.username || url.password) errors.push(`${source.id}: registry URL must not contain credentials`);
    if (url.hash) errors.push(`${source.id}: registry URL must not contain a fragment`);
    if (url.hostname.toLowerCase() !== source.allowedHostname.toLowerCase()) errors.push(`${source.id}: URL hostname must exactly match allowedHostname`);
    if (blockedHostname(url.hostname)) errors.push(`${source.id}: registry URL hostname is private/local`);
    if (url.port && url.port !== "443") errors.push(`${source.id}: registry URL must use default HTTPS port 443`);
  } catch {
    errors.push(`${source.id}: registry URL is invalid`);
  }
  return errors;
}

export async function loadRemoteRegistrySources(path?: string): Promise<RemoteRegistrySourcesFile> {
  const target = path ?? fileURLToPath(new URL("../registry/remotes.json", import.meta.url));
  const parsed = JSON.parse(await readFile(target, "utf8")) as RemoteRegistrySourcesFile;
  if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.sources)) throw new Error("Invalid DockyardOS remote registry source file.");
  const ids = new Set<string>();
  const errors: string[] = [];
  for (const source of parsed.sources) {
    if (ids.has(source.id)) errors.push(`duplicate remote registry source id: ${source.id}`);
    ids.add(source.id);
    errors.push(...validateRemoteRegistrySource(source));
  }
  if (errors.length) throw new Error(`Invalid remote registry sources: ${errors.join("; ")}`);
  return parsed;
}

export async function loadRegistryTrustStore(path?: string): Promise<RegistryTrustStore> {
  const target = path ?? fileURLToPath(new URL("../registry/registry-keys.json", import.meta.url));
  const parsed = JSON.parse(await readFile(target, "utf8")) as RegistryTrustStore;
  if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.keys)) throw new Error("Invalid DockyardOS registry trust-key store.");
  const ids = new Set<string>();
  for (const key of parsed.keys) {
    if (!key.id || ids.has(key.id)) throw new Error(`Invalid/duplicate registry key id: ${key.id}`);
    ids.add(key.id);
    if (key.algorithm !== "ed25519" || !key.registryId || !key.publicKeyPem) throw new Error(`Invalid registry trust key: ${key.id}`);
  }
  return parsed;
}

export function verifySignedRegistryEnvelope(
  source: RemoteRegistrySource,
  envelope: SignedRegistryEnvelope,
  trustStore: RegistryTrustStore,
  now = new Date(),
): { ok: boolean; errors: string[]; indexSha256?: string; envelopeSha256?: string } {
  const errors: string[] = [];
  if (envelope.schemaVersion !== 1) errors.push("unsupported registry envelope schemaVersion");
  if (envelope.registryId !== source.id) errors.push(`registryId mismatch: expected ${source.id}, got ${envelope.registryId}`);
  if (!Number.isInteger(envelope.sequence) || envelope.sequence < 1) errors.push("registry sequence must be a positive integer");
  const issuedAt = Date.parse(envelope.issuedAt);
  const expiresAt = Date.parse(envelope.expiresAt);
  const nowMs = now.getTime();
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)) errors.push("registry issuedAt/expiresAt must be valid ISO dates");
  else {
    if (issuedAt > nowMs + CLOCK_SKEW_MS) errors.push("registry envelope issuedAt is unreasonably in the future");
    if (expiresAt <= nowMs) errors.push("registry envelope is expired");
    if (expiresAt <= issuedAt) errors.push("registry envelope expiresAt must be after issuedAt");
    if (nowMs - issuedAt > source.maxAgeSeconds * 1000) errors.push("registry envelope exceeds source maxAgeSeconds");
  }
  const indexErrors = validateCommunityRegistry(envelope.index);
  if (indexErrors.length) errors.push(...indexErrors.map((error) => `registry index: ${error}`));
  if (envelope.signature.algorithm !== "ed25519") errors.push("unsupported registry signature algorithm");
  if (envelope.signature.keyId !== source.keyId) errors.push(`registry signature key mismatch: expected ${source.keyId}`);
  const key = trustStore.keys.find((item) => item.id === source.keyId && item.registryId === source.id);
  if (!key) errors.push(`trusted registry key not found: ${source.keyId}`);
  else if (key.revokedAt) errors.push(`registry trust key is revoked: ${key.id}`);
  else {
    try {
      const publicKey = createPublicKey(key.publicKeyPem);
      const signatureOk = verify(null, Buffer.from(remoteRegistryEnvelopePayload(envelope), "utf8"), publicKey, Buffer.from(envelope.signature.value, "base64"));
      if (!signatureOk) errors.push("registry envelope signature verification failed");
    } catch (error) {
      errors.push(`registry envelope signature verification error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    errors: [],
    indexSha256: sha256(stableJson(envelope.index)),
    envelopeSha256: sha256(remoteRegistryEnvelopePayload(envelope)),
  };
}

function sourceRoot(sourceId: string): string {
  return resolve(dockyardHome(), "community", "remote", sourceId);
}

function statePath(sourceId: string): string {
  return resolve(sourceRoot(sourceId), "state.json");
}

async function loadRemoteState(sourceId: string): Promise<RemoteRegistryState> {
  return (await readJson<RemoteRegistryState>(statePath(sourceId))) ?? { schemaVersion: 1, history: [] };
}

async function readResponseBodyBounded(response: Response, maxBytes: number): Promise<Buffer> {
  if (!response.body) throw new Error("Remote registry response has no body.");
  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > maxBytes) throw new Error(`Remote registry response exceeds maxBytes (${contentLength} > ${maxBytes}).`);
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new Error(`Remote registry response exceeded maxBytes while streaming (${total} > ${maxBytes}).`);
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

export async function syncRemoteRegistry(
  source: RemoteRegistrySource,
  options: { trustStore?: RegistryTrustStore; now?: Date; timeoutMs?: number } = {},
): Promise<RemoteRegistrySyncResult> {
  const sourceErrors = validateRemoteRegistrySource(source);
  if (sourceErrors.length) throw new Error(sourceErrors.join("; "));
  if (!source.enabled) throw new Error(`Remote registry source is disabled: ${source.id}`);
  const trustStore = options.trustStore ?? await loadRegistryTrustStore();
  const previous = await loadRemoteState(source.id);
  const headers: Record<string, string> = { accept: "application/json" };
  if (previous.current?.etag) headers["if-none-match"] = previous.current.etag;
  if (previous.current?.lastModified) headers["if-modified-since"] = previous.current.lastModified;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);
  let response: Response;
  try {
    response = await fetch(source.url, { method: "GET", headers, redirect: "manual", signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
  if (response.status === 304) {
    if (!previous.current) throw new Error("Remote registry returned 304 without a verified cached version.");
    return { sourceId: source.id, status: "not-modified", record: previous.current, packages: 0, discoverySources: 0 };
  }
  if (response.status >= 300 && response.status < 400) throw new Error(`Remote registry redirects are refused (${response.status}).`);
  if (response.status !== 200) throw new Error(`Remote registry fetch failed with HTTP ${response.status}.`);
  const body = await readResponseBodyBounded(response, source.maxBytes);
  let envelope: SignedRegistryEnvelope;
  try {
    envelope = JSON.parse(body.toString("utf8")) as SignedRegistryEnvelope;
  } catch {
    throw new Error("Remote registry response is not valid JSON.");
  }
  const verification = verifySignedRegistryEnvelope(source, envelope, trustStore, options.now ?? new Date());
  if (!verification.ok || !verification.indexSha256 || !verification.envelopeSha256) throw new Error(`Remote registry verification failed: ${verification.errors.join("; ")}`);
  if (previous.current) {
    if (envelope.sequence < previous.current.sequence) throw new Error(`Remote registry replay/rollback refused: sequence ${envelope.sequence} < ${previous.current.sequence}.`);
    if (envelope.sequence === previous.current.sequence) {
      if (verification.envelopeSha256 !== previous.current.envelopeSha256) throw new Error("Remote registry equivocation detected: same sequence has different signed content.");
      return { sourceId: source.id, status: "not-modified", record: previous.current, packages: envelope.index.packages.length, discoverySources: envelope.index.discoverySources.length };
    }
  }

  const root = sourceRoot(source.id);
  const versions = resolve(root, "versions");
  await mkdir(versions, { recursive: true });
  const envelopePath = resolve(versions, `${String(envelope.sequence).padStart(12, "0")}-${verification.envelopeSha256}.json`);
  await writeJsonAtomic(envelopePath, envelope);
  const record: RemoteRegistryCacheRecord = {
    schemaVersion: 1,
    sourceId: source.id,
    registryId: envelope.registryId,
    sequence: envelope.sequence,
    issuedAt: envelope.issuedAt,
    expiresAt: envelope.expiresAt,
    fetchedAt: new Date().toISOString(),
    verifiedAt: (options.now ?? new Date()).toISOString(),
    envelopeSha256: verification.envelopeSha256,
    indexSha256: verification.indexSha256,
    keyId: envelope.signature.keyId,
    ...(response.headers.get("etag") ? { etag: response.headers.get("etag")! } : {}),
    ...(response.headers.get("last-modified") ? { lastModified: response.headers.get("last-modified")! } : {}),
    path: envelopePath,
  };
  const history = previous.history.filter((item) => item.sequence !== record.sequence);
  history.push(record);
  history.sort((a, b) => a.sequence - b.sequence);
  await writeJsonAtomic(statePath(source.id), { schemaVersion: 1, current: record, history } satisfies RemoteRegistryState);
  return { sourceId: source.id, status: "updated", record, packages: envelope.index.packages.length, discoverySources: envelope.index.discoverySources.length };
}

export async function cachedRemoteRegistryIndexes(): Promise<Array<{ sourceId: string; record: RemoteRegistryCacheRecord; index: CommunityRegistryIndex }>> {
  const sources = await loadRemoteRegistrySources();
  const now = Date.now();
  const result: Array<{ sourceId: string; record: RemoteRegistryCacheRecord; index: CommunityRegistryIndex }> = [];
  for (const source of sources.sources.filter((item) => item.enabled)) {
    const state = await loadRemoteState(source.id);
    const record = state.current;
    if (!record) continue;
    if (Date.parse(record.expiresAt) <= now) continue;
    const envelope = await readJson<SignedRegistryEnvelope>(record.path);
    if (!envelope) continue;
    const trustStore = await loadRegistryTrustStore();
    const verification = verifySignedRegistryEnvelope(source, envelope, trustStore, new Date());
    if (!verification.ok || verification.envelopeSha256 !== record.envelopeSha256 || verification.indexSha256 !== record.indexSha256) continue;
    result.push({ sourceId: source.id, record, index: envelope.index });
  }
  return result;
}
