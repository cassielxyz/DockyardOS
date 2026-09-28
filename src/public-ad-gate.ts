import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readJson, writeJsonAtomic } from "./fs-utils.js";
import { projectDirectory, projectIdForRoot } from "./project.js";

export interface PublicReleaseConfig {
  schemaVersion: 1;
  edition: "source-development" | "official-public";
  adEnforcement: "development" | "required";
  controlPlaneUrl: string | null;
  stampedAt?: string;
}

export interface PublicSponsoredPlacement {
  id: string;
  disclosure: string;
  title: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
}

interface PendingAdSession {
  sessionToken: string;
  minViewMs: number;
  receivedAt: number;
  expiresAt: number;
  ad: PublicSponsoredPlacement;
}

interface PublicAdGateState {
  schemaVersion: 1;
  installId: string;
  pending?: PendingAdSession;
  leaseToken?: string;
  leaseExpiresAt?: number;
  verifiedUntil?: number;
  campaignId?: string;
  updatedAt: string;
}

export type PublicAdGateResult =
  | { required: false; status: "development" }
  | { required: true; status: "active"; campaignId?: string; leaseExpiresAt: number }
  | { required: true; status: "sponsor-required"; ad: PublicSponsoredPlacement; remainingMs: number; sessionExpiresAt: number }
  | { required: true; status: "unavailable"; reason: string };

const MAX_RESPONSE_BYTES = 64 * 1024;
const REQUEST_TIMEOUT_MS = 8_000;
const TOOL_VERIFICATION_GRACE_MS = 5 * 60 * 1000;

function releaseConfigPath(): string {
  const modulePath = fileURLToPath(import.meta.url);
  return resolve(dirname(modulePath), "..", "registry", "public-release.json");
}

function statePath(root: string): string {
  return resolve(projectDirectory(projectIdForRoot(root)), "public-edition", "ad-gate.json");
}

function safeOrigin(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Official public release control-plane URL is invalid."); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) {
    throw new Error("Official public release control-plane URL must be a credential-free HTTPS origin.");
  }
  return url.origin;
}

export async function loadPublicReleaseConfig(): Promise<PublicReleaseConfig> {
  const parsed = JSON.parse(await readFile(releaseConfigPath(), "utf8")) as PublicReleaseConfig;
  if (parsed.schemaVersion !== 1) throw new Error("Unsupported DockyardOS public release marker schema.");
  if (parsed.edition === "source-development" && parsed.adEnforcement === "development" && parsed.controlPlaneUrl == null) return parsed;
  if (parsed.edition !== "official-public" || parsed.adEnforcement !== "required" || !parsed.controlPlaneUrl) {
    throw new Error("DockyardOS public release marker has an invalid edition/enforcement combination.");
  }
  return { ...parsed, controlPlaneUrl: safeOrigin(parsed.controlPlaneUrl) };
}

export async function officialPublicAdsRequired(): Promise<boolean> {
  const config = await loadPublicReleaseConfig();
  return config.edition === "official-public" && config.adEnforcement === "required";
}

async function loadState(root: string): Promise<PublicAdGateState> {
  const existing = await readJson<PublicAdGateState>(statePath(root));
  if (existing?.schemaVersion === 1 && typeof existing.installId === "string" && existing.installId.length >= 8) return existing;
  const created: PublicAdGateState = {
    schemaVersion: 1,
    installId: `dockyard-${randomUUID()}`,
    updatedAt: new Date().toISOString(),
  };
  await writeJsonAtomic(statePath(root), created);
  return created;
}

async function saveState(root: string, state: PublicAdGateState): Promise<void> {
  await writeJsonAtomic(statePath(root), { ...state, updatedAt: new Date().toISOString() });
}

async function postJson(origin: string, path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${safeOrigin(origin)}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "DockyardOS-Public-Edition/1" },
      body: JSON.stringify(body),
      redirect: "error",
      signal: controller.signal,
    });
  } catch (error) {
    throw new Error(`DockyardOS public ad service is unreachable: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    clearTimeout(timeout);
  }
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_RESPONSE_BYTES) throw new Error("DockyardOS public ad service response exceeded the client size bound.");
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) throw new Error("DockyardOS public ad service response exceeded the client size bound.");
  let parsed: unknown;
  try { parsed = text ? JSON.parse(text) : {}; } catch { throw new Error("DockyardOS public ad service returned invalid JSON."); }
  const object = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  if (!response.ok) throw new Error(typeof object.message === "string" ? object.message : `DockyardOS public ad service rejected the request (${response.status}).`);
  return object;
}

function placement(value: unknown): PublicSponsoredPlacement {
  if (!value || typeof value !== "object") throw new Error("DockyardOS public ad service returned an invalid sponsored placement.");
  const ad = value as Record<string, unknown>;
  const required = ["id", "disclosure", "title", "body", "ctaLabel", "ctaUrl"] as const;
  for (const field of required) if (typeof ad[field] !== "string" || !(ad[field] as string).trim()) throw new Error(`Sponsored placement is missing ${field}.`);
  const cta = new URL(ad.ctaUrl as string);
  if (cta.protocol !== "https:" || cta.username || cta.password) throw new Error("Sponsored placement CTA must be a credential-free HTTPS URL.");
  return {
    id: (ad.id as string).slice(0, 80),
    disclosure: (ad.disclosure as string).slice(0, 40),
    title: (ad.title as string).slice(0, 120),
    body: (ad.body as string).slice(0, 500),
    ctaLabel: (ad.ctaLabel as string).slice(0, 60),
    ctaUrl: cta.toString(),
  };
}

async function verifyLease(root: string, origin: string, state: PublicAdGateState, now: number): Promise<boolean> {
  if (!state.leaseToken || !state.leaseExpiresAt || state.leaseExpiresAt <= now) return false;
  const verified = await postJson(origin, "/api/ad-verify", { installId: state.installId, leaseToken: state.leaseToken });
  if (verified.valid !== true || typeof verified.expiresAt !== "number" || verified.expiresAt <= now) return false;
  state.leaseExpiresAt = verified.expiresAt;
  state.campaignId = typeof verified.campaignId === "string" ? verified.campaignId : state.campaignId;
  state.verifiedUntil = Math.min(verified.expiresAt, now + TOOL_VERIFICATION_GRACE_MS);
  state.pending = undefined;
  await saveState(root, state);
  return true;
}

export async function checkPublicAdGate(root: string, now = Date.now()): Promise<PublicAdGateResult> {
  let release: PublicReleaseConfig;
  try { release = await loadPublicReleaseConfig(); } catch (error) {
    return { required: true, status: "unavailable", reason: error instanceof Error ? error.message : String(error) };
  }
  if (release.edition !== "official-public" || release.adEnforcement !== "required") return { required: false, status: "development" };
  const origin = release.controlPlaneUrl!;
  const state = await loadState(root);

  try {
    if (state.leaseToken && state.leaseExpiresAt && state.leaseExpiresAt > now && await verifyLease(root, origin, state, now)) {
      return { required: true, status: "active", ...(state.campaignId ? { campaignId: state.campaignId } : {}), leaseExpiresAt: state.leaseExpiresAt! };
    }

    if (state.pending && state.pending.expiresAt > now) {
      const remainingMs = Math.max(0, state.pending.receivedAt + state.pending.minViewMs - now);
      if (remainingMs > 0) {
        return { required: true, status: "sponsor-required", ad: state.pending.ad, remainingMs, sessionExpiresAt: state.pending.expiresAt };
      }
      const acknowledged = await postJson(origin, "/api/ad-ack", { installId: state.installId, sessionToken: state.pending.sessionToken });
      if (typeof acknowledged.leaseToken !== "string" || typeof acknowledged.leaseExpiresAt !== "number" || acknowledged.leaseExpiresAt <= now) {
        throw new Error("DockyardOS public ad service returned an invalid lease.");
      }
      state.leaseToken = acknowledged.leaseToken;
      state.leaseExpiresAt = acknowledged.leaseExpiresAt;
      state.campaignId = typeof acknowledged.campaignId === "string" ? acknowledged.campaignId : state.pending.ad.id;
      state.verifiedUntil = Math.min(acknowledged.leaseExpiresAt, now + TOOL_VERIFICATION_GRACE_MS);
      state.pending = undefined;
      await saveState(root, state);
      return { required: true, status: "active", campaignId: state.campaignId, leaseExpiresAt: state.leaseExpiresAt };
    }

    state.pending = undefined;
    state.leaseToken = undefined;
    state.leaseExpiresAt = undefined;
    state.verifiedUntil = undefined;
    const session = await postJson(origin, "/api/ad-session", { installId: state.installId });
    if (typeof session.sessionToken !== "string" || typeof session.minViewMs !== "number" || typeof session.expiresAt !== "number") {
      throw new Error("DockyardOS public ad service returned an invalid session.");
    }
    const ad = placement(session.ad);
    state.pending = {
      sessionToken: session.sessionToken,
      minViewMs: Math.max(1_500, Math.min(60_000, Math.trunc(session.minViewMs))),
      receivedAt: now,
      expiresAt: session.expiresAt,
      ad,
    };
    await saveState(root, state);
    return { required: true, status: "sponsor-required", ad, remainingMs: state.pending.minViewMs, sessionExpiresAt: state.pending.expiresAt };
  } catch (error) {
    state.verifiedUntil = undefined;
    await saveState(root, state).catch(() => undefined);
    return { required: true, status: "unavailable", reason: error instanceof Error ? error.message : String(error) };
  }
}

export async function publicAdToolAuthorized(root: string, now = Date.now()): Promise<{ allowed: boolean; reason?: string }> {
  let release: PublicReleaseConfig;
  try { release = await loadPublicReleaseConfig(); } catch (error) { return { allowed: false, reason: error instanceof Error ? error.message : String(error) }; }
  if (release.edition !== "official-public" || release.adEnforcement !== "required") return { allowed: true };
  const state = await loadState(root);
  if (state.leaseExpiresAt && state.leaseExpiresAt > now && state.verifiedUntil && state.verifiedUntil > now) return { allowed: true };
  return { allowed: false, reason: "Official DockyardOS public edition requires a current server-validated sponsored-placement lease before agent tools can run." };
}

export function sponsoredPlacementAgentText(result: Extract<PublicAdGateResult, { status: "sponsor-required" }>): string[] {
  const seconds = Math.max(1, Math.ceil(result.remainingMs / 1000));
  return [
    "DOCKYARDOS OFFICIAL PUBLIC EDITION — SPONSORED PLACEMENT REQUIRED",
    "For this invocation, do not execute the queued development request and do not call tools.",
    `Show the user this clearly labeled sponsored placement exactly once in a compact form: [${result.ad.disclosure}] ${result.ad.title} — ${result.ad.body} ${result.ad.ctaLabel}: ${result.ad.ctaUrl}`,
    `Tell the user the queued DockyardOS request will continue on their next message after the minimum sponsored view window (about ${seconds}s).`,
    "Do not imply the sponsor influenced technical recommendations. Do not alter or hide the Sponsored disclosure.",
  ];
}
