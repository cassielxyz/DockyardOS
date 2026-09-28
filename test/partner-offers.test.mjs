import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import partnerFeedHandler from "../api/partner-offers.js";

const require = createRequire(import.meta.url);
const partners = require("../integrations/vscode/partner-offers.js");
const { normalizeCommunityHubData } = require("../integrations/vscode/community-hub-model.js");
const { renderCommunityHubHtml } = require("../integrations/vscode/community-hub-view.js");

test("partner feed keeps only curated HTTPS partner destinations", () => {
  const feed = partners.normalizePartnerFeed({ offers: [
    { id: "vercel", brand: "vercel", title: "Vercel", description: "Deploy apps", url: "https://vercel.com/example", category: "hosting" },
    { id: "do", brand: "digitalocean", title: "DigitalOcean", description: "Cloud", url: "https://m.do.co/c/example", category: "cloud" },
    { id: "bad-http", brand: "vercel", title: "Bad", description: "Bad", url: "http://vercel.com/example" },
    { id: "bad-host", brand: "vercel", title: "Bad", description: "Bad", url: "https://evil.example/vercel" },
    { id: "credentials", brand: "hostinger", title: "Bad", description: "Bad", url: "https://user:pass@hostinger.com/" },
  ] });
  assert.deepEqual(feed.offers.map((offer) => offer.id), ["vercel", "do"]);
  assert.ok(feed.offers.every((offer) => offer.disclosure === "Sponsored / affiliate link"));
});

test("partner feed is bounded and ignores duplicate ids", () => {
  const raw = [];
  for (let index = 0; index < 12; index += 1) {
    raw.push({
      id: index === 1 ? "offer-0" : `offer-${index}`,
      brand: "vercel",
      title: `Offer ${index}`,
      description: "Developer hosting offer",
      url: `https://vercel.com/offer-${index}`,
    });
  }
  const feed = partners.normalizePartnerFeed({ offers: raw });
  assert.equal(feed.offers.length, partners.MAX_OFFERS);
  assert.equal(new Set(feed.offers.map((offer) => offer.id)).size, feed.offers.length);
});

test("Community Hub keeps partner offers separate from package recommendations", () => {
  const model = normalizeCommunityHubData(
    { packages: [], discoverySources: [], conflicts: [], remoteRegistries: [] },
    { packages: {} },
    [],
    [],
    {
      disclosure: "Sponsored / affiliate offers do not affect technical decisions.",
      offers: [{
        id: "digitalocean",
        brand: "digitalocean",
        title: "Build on DigitalOcean",
        description: "Cloud infrastructure",
        category: "cloud",
        url: "https://m.do.co/c/example",
        disclosure: "Sponsored / affiliate link",
      }],
    },
  );
  assert.equal(model.packages.length, 0);
  assert.equal(model.partnerOffers.length, 1);
  assert.equal(model.summary.partnerOffers, 1);
  assert.match(model.partnerDisclosure, /do not affect technical decisions/i);
});

test("Community Hub partner surface stays CSP locked and contains no remote ad script", () => {
  const model = normalizeCommunityHubData({}, {}, [], [], { offers: [] });
  const html = renderCommunityHubHtml({ cspSource: "vscode-webview://unit-test" }, model);
  assert.match(html, /data-tab="partners"/);
  assert.match(html, /Sponsored \/ affiliate/);
  assert.match(html, /default-src 'none'/);
  assert.doesNotMatch(html, /media\.ethicalads\.io/);
  assert.doesNotMatch(html, /serve\.carbonads/);
  assert.doesNotMatch(html, /unsafe-inline/);
});

test("partner generator reads only approved public affiliate URL variables", async () => {
  const generator = await readFile("integrations/vscode/scripts/generate-partner-offers.cjs", "utf8");
  for (const name of [
    "DOCKYARD_PARTNER_VERCEL_URL",
    "DOCKYARD_PARTNER_DIGITALOCEAN_URL",
    "DOCKYARD_PARTNER_NAMECHEAP_URL",
    "DOCKYARD_PARTNER_HOSTINGER_URL",
  ]) assert.match(generator, new RegExp(name));
  assert.doesNotMatch(generator, /TOKEN|PASSWORD|PRIVATE_KEY|API_KEY/);
});

test("Vercel partner feed returns only explicitly configured public URLs", () => {
  const names = [
    "DOCKYARD_PARTNER_VERCEL_URL",
    "DOCKYARD_PARTNER_DIGITALOCEAN_URL",
    "DOCKYARD_PARTNER_NAMECHEAP_URL",
    "DOCKYARD_PARTNER_HOSTINGER_URL",
  ];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  process.env.DOCKYARD_PARTNER_VERCEL_URL = "https://vercel.com/example-affiliate";
  process.env.DOCKYARD_PARTNER_DIGITALOCEAN_URL = "https://m.do.co/c/example";
  process.env.DOCKYARD_PARTNER_NAMECHEAP_URL = "not-a-url";
  delete process.env.DOCKYARD_PARTNER_HOSTINGER_URL;

  const headers = {};
  const result = { statusCode: 0, body: undefined };
  const response = {
    setHeader(name, value) { headers[name] = value; },
    status(code) { result.statusCode = code; return this; },
    json(body) { result.body = body; return body; },
    end() { return undefined; },
  };
  try {
    partnerFeedHandler({ method: "GET" }, response);
    assert.equal(result.statusCode, 200);
    assert.deepEqual(result.body.offers.map((offer) => offer.id), ["vercel", "digitalocean"]);
    assert.equal(headers["Access-Control-Allow-Origin"], "*");
    assert.equal(headers["X-Content-Type-Options"], "nosniff");
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});

test("Vercel partner feed endpoint never serializes process.env wholesale", async () => {
  const source = await readFile("api/partner-offers.js", "utf8");
  assert.doesNotMatch(source, /JSON\.stringify\(process\.env/);
  assert.doesNotMatch(source, /Object\.(entries|keys|values)\(process\.env/);
  assert.match(source, /Access-Control-Allow-Origin/);
  assert.match(source, /X-Content-Type-Options/);
});
