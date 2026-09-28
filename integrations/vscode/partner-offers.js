const MAX_FEED_BYTES = 64 * 1024;
const MAX_OFFERS = 8;
const PARTNER_HOSTS = {
  vercel: ["vercel.com", "v0.dev", "v0.app", "dub.sh"],
  digitalocean: ["digitalocean.com", "m.do.co", "do.co"],
  namecheap: ["namecheap.com", "pxf.io", "anrdoezrs.net", "jdoqocy.com", "tkqlhce.com", "dpbolvw.net", "kqzyfj.com"],
  hostinger: ["hostinger.com", "sjv.io", "pxf.io"],
};

function boundedText(value, max) {
  const text = String(value ?? "").trim();
  if (!text || text.length > max || /[\u0000-\u001f\u007f]/.test(text)) return undefined;
  return text;
}

function hostAllowed(hostname, allowed) {
  const host = hostname.toLowerCase();
  return allowed.some((entry) => host === entry || host.endsWith(`.${entry}`));
}

function normalizePartnerUrl(brand, rawUrl) {
  let parsed;
  try { parsed = new URL(String(rawUrl || "")); } catch { return undefined; }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) return undefined;
  const allowed = PARTNER_HOSTS[brand];
  if (!allowed || !hostAllowed(parsed.hostname, allowed)) return undefined;
  return parsed.toString();
}

function normalizePartnerFeed(input) {
  const root = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const offers = [];
  const seen = new Set();
  for (const item of Array.isArray(root.offers) ? root.offers : []) {
    if (offers.length >= MAX_OFFERS) break;
    const id = boundedText(item?.id, 64);
    const brand = boundedText(item?.brand, 32)?.toLowerCase();
    const title = boundedText(item?.title, 120);
    const description = boundedText(item?.description, 260);
    const category = boundedText(item?.category, 48) || "developer-tool";
    const url = brand ? normalizePartnerUrl(brand, item?.url) : undefined;
    if (!id || !brand || !title || !description || !url || seen.has(id)) continue;
    seen.add(id);
    offers.push({
      id,
      brand,
      title,
      description,
      category,
      url,
      disclosure: "Sponsored / affiliate link",
    });
  }
  return {
    schemaVersion: 1,
    disclosure: "DockyardOS may receive compensation when you use a sponsored or affiliate link. Partner offers never affect agent recommendations or technical decisions.",
    offers,
  };
}

async function fetchPartnerFeed(feedUrl, options = {}) {
  const raw = String(feedUrl || "").trim();
  if (!raw) return normalizePartnerFeed({ offers: [] });
  let url;
  try { url = new URL(raw); } catch { throw new Error("Partner feed URL is invalid."); }
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("Partner feed must use credential-free HTTPS.");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 5_000);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Partner feed returned HTTP ${response.status}.`);
    const declared = Number(response.headers.get("content-length") || "0");
    if (Number.isFinite(declared) && declared > MAX_FEED_BYTES) throw new Error("Partner feed exceeds the 64 KiB limit.");
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > MAX_FEED_BYTES) throw new Error("Partner feed exceeds the 64 KiB limit.");
    let parsed;
    try { parsed = JSON.parse(text); } catch { throw new Error("Partner feed is not valid JSON."); }
    return normalizePartnerFeed(parsed);
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  MAX_FEED_BYTES,
  MAX_OFFERS,
  PARTNER_HOSTS,
  normalizePartnerUrl,
  normalizePartnerFeed,
  fetchPartnerFeed,
};
