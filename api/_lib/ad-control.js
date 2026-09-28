import { createHmac, createHash, randomUUID, timingSafeEqual } from "node:crypto";

const CONFIG_KEY = "dockyard:ads:config:v1";
const METRICS_KEY = "dockyard:ads:metrics:v1";
const TOKEN_VERSION = 1;
const MAX_CAMPAIGNS = 32;
const MIN_VIEW_MS = 1_500;
const MAX_VIEW_MS = 60_000;
const MIN_LEASE_SECONDS = 300;
const MAX_LEASE_SECONDS = 24 * 60 * 60;
const SESSION_TTL_MS = 5 * 60 * 1000;
const ID = /^[a-z0-9][a-z0-9._-]{1,79}$/;
const INSTALL_ID = /^[A-Za-z0-9._:-]{8,160}$/;

function boundedText(value, label, max) {
  const text = String(value ?? "").trim();
  if (!text || text.length > max || /[\u0000-\u001f\u007f]/.test(text)) throw new Error(`${label} is empty, too long, or contains control characters.`);
  return text;
}

function optionalIso(value, label) {
  if (value == null || value === "") return undefined;
  const time = Date.parse(String(value));
  if (!Number.isFinite(time)) throw new Error(`${label} must be a valid ISO timestamp.`);
  return new Date(time).toISOString();
}

function httpsUrl(value, label) {
  const text = boundedText(value, label, 2048);
  const url = new URL(text);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error(`${label} must be a credential-free HTTPS URL.`);
  return url.toString();
}

export function defaultAdConfig() {
  return {
    schemaVersion: 1,
    enabled: true,
    minViewMs: 3_000,
    leaseSeconds: 30 * 60,
    updatedAt: new Date(0).toISOString(),
    campaigns: [{
      id: "dockyard-house",
      enabled: true,
      title: "Support DockyardOS",
      body: "The official public edition includes clearly labeled sponsored placements that help fund continued development.",
      ctaLabel: "View DockyardOS",
      ctaUrl: "https://github.com/cassielxyz/DockyardOS",
      weight: 1,
    }],
  };
}

export function normalizeAdConfig(input) {
  const raw = input && typeof input === "object" ? input : {};
  const minViewMs = Math.max(MIN_VIEW_MS, Math.min(MAX_VIEW_MS, Math.trunc(Number(raw.minViewMs) || 3_000)));
  const leaseSeconds = Math.max(MIN_LEASE_SECONDS, Math.min(MAX_LEASE_SECONDS, Math.trunc(Number(raw.leaseSeconds) || 30 * 60)));
  const sourceCampaigns = Array.isArray(raw.campaigns) ? raw.campaigns : [];
  if (sourceCampaigns.length > MAX_CAMPAIGNS) throw new Error(`At most ${MAX_CAMPAIGNS} ad campaigns are allowed.`);
  const seen = new Set();
  const campaigns = sourceCampaigns.map((campaign) => {
    if (!campaign || typeof campaign !== "object") throw new Error("Every ad campaign must be an object.");
    const id = String(campaign.id ?? "").trim().toLowerCase();
    if (!ID.test(id) || seen.has(id)) throw new Error(`Invalid or duplicate ad campaign id: ${id || "<empty>"}`);
    seen.add(id);
    const weight = Math.max(1, Math.min(100, Math.trunc(Number(campaign.weight) || 1)));
    const startsAt = optionalIso(campaign.startsAt, `${id}.startsAt`);
    const endsAt = optionalIso(campaign.endsAt, `${id}.endsAt`);
    if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) throw new Error(`${id}.endsAt must be after startsAt.`);
    return {
      id,
      enabled: campaign.enabled !== false,
      title: boundedText(campaign.title, `${id}.title`, 120),
      body: boundedText(campaign.body, `${id}.body`, 500),
      ctaLabel: boundedText(campaign.ctaLabel ?? "Learn more", `${id}.ctaLabel`, 60),
      ctaUrl: httpsUrl(campaign.ctaUrl, `${id}.ctaUrl`),
      weight,
      ...(startsAt ? { startsAt } : {}),
      ...(endsAt ? { endsAt } : {}),
    };
  });
  const fallback = defaultAdConfig().campaigns[0];
  const normalizedCampaigns = campaigns.length ? campaigns : [fallback];
  return {
    schemaVersion: 1,
    enabled: raw.enabled !== false,
    minViewMs,
    leaseSeconds,
    updatedAt: new Date().toISOString(),
    campaigns: normalizedCampaigns,
  };
}

export function activeCampaigns(config, now = Date.now()) {
  if (!config.enabled) return [];
  return config.campaigns.filter((campaign) => campaign.enabled
    && (!campaign.startsAt || Date.parse(campaign.startsAt) <= now)
    && (!campaign.endsAt || Date.parse(campaign.endsAt) > now));
}

export function selectCampaign(config, installHash, now = Date.now()) {
  let campaigns = activeCampaigns(config, now);
  if (!campaigns.length) campaigns = defaultAdConfig().campaigns;
  const weighted = campaigns.flatMap((campaign) => Array.from({ length: campaign.weight }, () => campaign));
  const digest = createHash("sha256").update(`${installHash}:${Math.floor(now / 3_600_000)}`).digest();
  return weighted[digest.readUInt32BE(0) % weighted.length];
}

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function signingSecret() {
  const secret = String(process.env.DOCKYARD_AD_SIGNING_SECRET ?? "");
  if (secret.length < 32) throw Object.assign(new Error("DOCKYARD_AD_SIGNING_SECRET must contain at least 32 characters."), { statusCode: 503 });
  return secret;
}

export function signAdToken(payload) {
  const body = base64url(JSON.stringify({ v: TOKEN_VERSION, ...payload }));
  const signature = createHmac("sha256", signingSecret()).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifyAdToken(token, expectedType, now = Date.now()) {
  const [body, signature, extra] = String(token ?? "").split(".");
  if (!body || !signature || extra) throw new Error("Invalid DockyardOS ad token format.");
  const expected = createHmac("sha256", signingSecret()).update(body).digest();
  let supplied;
  try { supplied = Buffer.from(signature, "base64url"); } catch { throw new Error("Invalid DockyardOS ad token signature."); }
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new Error("Invalid DockyardOS ad token signature.");
  let payload;
  try { payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")); } catch { throw new Error("Invalid DockyardOS ad token payload."); }
  if (payload.v !== TOKEN_VERSION || payload.type !== expectedType) throw new Error("DockyardOS ad token type/version mismatch.");
  if (!Number.isFinite(payload.expiresAt) || payload.expiresAt <= now) throw new Error("DockyardOS ad token has expired.");
  return payload;
}

export function normalizeInstallId(value) {
  const installId = String(value ?? "").trim();
  if (!INSTALL_ID.test(installId)) throw new Error("installId must be an opaque 8-160 character client installation identifier.");
  return installId;
}

export function installHash(installId) {
  return createHash("sha256").update(normalizeInstallId(installId)).digest("hex");
}

export function createAdSession(config, installId, now = Date.now()) {
  const hash = installHash(installId);
  const campaign = selectCampaign(config, hash, now);
  const payload = {
    type: "ad-session",
    sid: randomUUID(),
    installHash: hash,
    campaignId: campaign.id,
    issuedAt: now,
    notBeforeAckAt: now + config.minViewMs,
    expiresAt: now + SESSION_TTL_MS,
  };
  return {
    sessionToken: signAdToken(payload),
    minViewMs: config.minViewMs,
    expiresAt: payload.expiresAt,
    ad: {
      id: campaign.id,
      disclosure: "Sponsored",
      title: campaign.title,
      body: campaign.body,
      ctaLabel: campaign.ctaLabel,
      ctaUrl: campaign.ctaUrl,
    },
  };
}

export function acknowledgeAdSession(config, sessionToken, installId, now = Date.now()) {
  const session = verifyAdToken(sessionToken, "ad-session", now);
  if (session.installHash !== installHash(installId)) throw new Error("Ad session does not belong to this DockyardOS installation.");
  if (!Number.isFinite(session.notBeforeAckAt) || now < session.notBeforeAckAt) {
    const remainingMs = Math.max(0, Number(session.notBeforeAckAt || 0) - now);
    throw Object.assign(new Error(`Sponsored placement minimum view time has not elapsed (${remainingMs}ms remaining).`), { statusCode: 425, remainingMs });
  }
  const lease = {
    type: "ad-lease",
    lid: randomUUID(),
    installHash: session.installHash,
    campaignId: session.campaignId,
    issuedAt: now,
    expiresAt: now + config.leaseSeconds * 1000,
  };
  return { leaseToken: signAdToken(lease), leaseExpiresAt: lease.expiresAt, campaignId: lease.campaignId };
}

export function verifyAdLease(leaseToken, installId, now = Date.now()) {
  const lease = verifyAdToken(leaseToken, "ad-lease", now);
  if (lease.installHash !== installHash(installId)) throw new Error("Ad lease does not belong to this DockyardOS installation.");
  return lease;
}

function upstashConfigured() {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

async function redis(command) {
  if (!upstashConfigured()) throw Object.assign(new Error("Upstash Redis REST storage is not configured."), { statusCode: 503 });
  const response = await fetch(process.env.UPSTASH_REDIS_REST_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "dockyardos-control-plane/1",
    },
    body: JSON.stringify(command),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.error) throw Object.assign(new Error(`Ad storage command failed: ${body.error || response.status}`), { statusCode: 503 });
  return body.result;
}

export async function loadAdConfig() {
  if (upstashConfigured()) {
    const stored = await redis(["GET", CONFIG_KEY]);
    if (stored) {
      try { return normalizeAdConfig(JSON.parse(stored)); } catch (error) { throw Object.assign(new Error(`Stored ad configuration is invalid: ${error.message}`), { statusCode: 500 }); }
    }
  }
  if (process.env.DOCKYARD_AD_CONFIG_JSON) {
    try { return normalizeAdConfig(JSON.parse(process.env.DOCKYARD_AD_CONFIG_JSON)); } catch (error) { throw Object.assign(new Error(`DOCKYARD_AD_CONFIG_JSON is invalid: ${error.message}`), { statusCode: 500 }); }
  }
  return normalizeAdConfig(defaultAdConfig());
}

export async function saveAdConfig(input) {
  const config = normalizeAdConfig(input);
  if (!upstashConfigured()) throw Object.assign(new Error("Admin writes require UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN."), { statusCode: 503 });
  await redis(["SET", CONFIG_KEY, JSON.stringify(config)]);
  return config;
}

export async function incrementAdMetric(event, campaignId = "global") {
  if (!upstashConfigured()) return false;
  const eventId = String(event ?? "").toLowerCase();
  const campaign = String(campaignId ?? "global").toLowerCase();
  if (!ID.test(eventId) || !ID.test(campaign)) return false;
  await redis(["HINCRBY", METRICS_KEY, `${eventId}:total`, 1]);
  await redis(["HINCRBY", METRICS_KEY, `${eventId}:campaign:${campaign}`, 1]);
  return true;
}

export async function readAdMetrics() {
  if (!upstashConfigured()) return { storage: "unconfigured", metrics: {} };
  const flat = await redis(["HGETALL", METRICS_KEY]);
  const metrics = {};
  if (Array.isArray(flat)) for (let i = 0; i + 1 < flat.length; i += 2) metrics[String(flat[i])] = Number(flat[i + 1]) || 0;
  return { storage: "upstash", metrics };
}

export function requireAdmin(request) {
  const expected = String(process.env.DOCKYARD_ADMIN_TOKEN ?? "");
  if (expected.length < 24) throw Object.assign(new Error("DOCKYARD_ADMIN_TOKEN is not configured securely."), { statusCode: 503 });
  const authorization = String(request.headers?.authorization ?? "");
  const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw Object.assign(new Error("Admin authorization failed."), { statusCode: 401 });
  return true;
}

export function publicHeaders(response) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
}

export function adminHeaders(response) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
}

export function apiError(response, error) {
  const status = Number(error?.statusCode) || 400;
  return response.status(status).json({ error: status >= 500 ? "service_unavailable" : "request_rejected", message: error instanceof Error ? error.message : String(error) });
}
