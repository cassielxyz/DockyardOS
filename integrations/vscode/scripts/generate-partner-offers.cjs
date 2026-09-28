const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "partner-offers.json");

const PARTNER_HOSTS = {
  vercel: ["vercel.com", "v0.dev", "v0.app", "dub.sh"],
  digitalocean: ["digitalocean.com", "m.do.co", "do.co"],
  namecheap: ["namecheap.com", "pxf.io", "anrdoezrs.net", "jdoqocy.com", "tkqlhce.com", "dpbolvw.net", "kqzyfj.com"],
  hostinger: ["hostinger.com", "sjv.io", "pxf.io"],
};

const definitions = [
  {
    env: "DOCKYARD_PARTNER_VERCEL_URL",
    id: "vercel",
    brand: "vercel",
    title: "Deploy on Vercel",
    description: "Production hosting and preview deployments for modern web applications.",
    category: "hosting",
  },
  {
    env: "DOCKYARD_PARTNER_DIGITALOCEAN_URL",
    id: "digitalocean",
    brand: "digitalocean",
    title: "Build on DigitalOcean",
    description: "Cloud infrastructure, managed databases, Kubernetes, storage, and application hosting.",
    category: "cloud",
  },
  {
    env: "DOCKYARD_PARTNER_NAMECHEAP_URL",
    id: "namecheap",
    brand: "namecheap",
    title: "Domains and hosting from Namecheap",
    description: "Domains, DNS, SSL, email, and hosting for developer projects.",
    category: "domains",
  },
  {
    env: "DOCKYARD_PARTNER_HOSTINGER_URL",
    id: "hostinger",
    brand: "hostinger",
    title: "Hosting from Hostinger",
    description: "Website and application hosting for small projects and production sites.",
    category: "hosting",
  },
];

function hostAllowed(hostname, allowed) {
  const host = hostname.toLowerCase();
  return allowed.some((entry) => host === entry || host.endsWith(`.${entry}`));
}

function validPartnerUrl(brand, value) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return undefined;
    const allowed = PARTNER_HOSTS[brand];
    if (!allowed || !hostAllowed(url.hostname, allowed)) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

const offers = definitions.flatMap((definition) => {
  const value = process.env[definition.env];
  const url = validPartnerUrl(definition.brand, value);
  if (value && !url) throw new Error(`${definition.env} must be a credential-free HTTPS URL on the approved ${definition.brand} partner host allowlist.`);
  return url ? [{ ...definition, url }] : [];
}).map(({ env, ...offer }) => offer);

const manifest = {
  schemaVersion: 1,
  disclosure: "DockyardOS may receive compensation when you use a sponsored or affiliate link. Partner offers never affect agent recommendations, provider ranking, or technical decisions.",
  generatedAt: new Date().toISOString(),
  offers,
};

fs.writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`Generated ${offers.length} DockyardOS partner offer(s) at ${output}`);
