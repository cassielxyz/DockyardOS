const OFFER_DEFINITIONS = [
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

function validHttps(value) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

export default function handler(request, response) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.setHeader("Allow", "GET, HEAD");
    return response.status(405).json({ error: "method_not_allowed" });
  }

  const offers = OFFER_DEFINITIONS.flatMap((definition) => {
    const url = validHttps(process.env[definition.env]);
    return url ? [{
      id: definition.id,
      brand: definition.brand,
      title: definition.title,
      description: definition.description,
      category: definition.category,
      url,
    }] : [];
  });

  response.setHeader("Cache-Control", "public, max-age=0, s-maxage=900, stale-while-revalidate=86400");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("X-Content-Type-Options", "nosniff");
  if (request.method === "HEAD") return response.status(200).end();
  return response.status(200).json({
    schemaVersion: 1,
    disclosure: "Sponsored / affiliate offers. Partner relationships never affect DockyardOS recommendations or provider selection.",
    generatedAt: new Date().toISOString(),
    offers,
  });
}
