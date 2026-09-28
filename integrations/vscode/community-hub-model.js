function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function originLabel(origin) {
  if (typeof origin === "string") return origin;
  if (!origin || typeof origin !== "object") return "unknown";
  if (origin.kind === "bundled") return "bundled";
  if (origin.kind === "remote") return `remote:${origin.sourceId || "unknown"}`;
  return String(origin.kind || "unknown");
}

function normalizeCommunityHubData(listValue, statusValue, updatesValue, warnings = [], partnerFeed = {}) {
  const list = asObject(listValue);
  const status = asObject(statusValue);
  const installed = asObject(status.packages);
  const updates = new Map(asArray(updatesValue).map((item) => [item?.packageId, item]));

  const packages = asArray(list.packages).map((pkg) => {
    const entry = asObject(installed[pkg?.id]);
    const versions = asArray(entry.versions);
    const activeRevision = typeof entry.activeRevision === "string" ? entry.activeRevision : undefined;
    const active = versions.find((version) => version?.revision === activeRevision);
    const update = updates.get(pkg?.id);
    return {
      id: String(pkg?.id || ""),
      name: String(pkg?.name || pkg?.id || "Unnamed package"),
      kind: String(pkg?.kind || "unknown"),
      source: String(pkg?.source || "unknown source"),
      trust: String(pkg?.trust || "unknown"),
      risk: String(pkg?.risk || "unknown"),
      permissions: asArray(pkg?.permissions).map(String),
      capabilities: asArray(pkg?.capabilities).map(String),
      channel: String(pkg?.channel || "unknown"),
      origin: originLabel(pkg?.origin),
      installed: Boolean(activeRevision),
      activeRevision: activeRevision || null,
      installedVersion: active?.version ? String(active.version) : null,
      updateState: update?.state ? String(update.state) : activeRevision ? "unchecked" : "not-installed",
      updateReasons: asArray(update?.reasons).map(String),
      updateError: update?.error ? String(update.error) : null,
    };
  }).filter((pkg) => pkg.id);

  const discoverySources = asArray(list.discoverySources).map((source) => ({
    id: String(source?.id || ""),
    name: String(source?.displayName || source?.id || "Unnamed source"),
    type: String(source?.type || "unknown"),
    locator: String(source?.locator || ""),
    trust: String(source?.trust || "unknown"),
    enabledByDefault: source?.enabledByDefault === true,
    notes: asArray(source?.notes).map(String),
  })).filter((source) => source.id);

  const conflicts = asArray(list.conflicts).map((conflict) => ({
    kind: String(conflict?.kind || "unknown"),
    id: String(conflict?.id || "unknown"),
    reason: String(conflict?.reason || "No reason supplied."),
    origins: asArray(conflict?.origins).map(originLabel),
  }));

  const remoteRegistries = asArray(list.remoteRegistries).map((registry) => ({
    sourceId: String(registry?.sourceId || registry?.id || "unknown"),
    sequence: Number.isFinite(registry?.sequence) ? registry.sequence : null,
    verifiedAt: registry?.verifiedAt ? String(registry.verifiedAt) : null,
    expiresAt: registry?.expiresAt ? String(registry.expiresAt) : null,
  }));

  const partnerOffers = asArray(asObject(partnerFeed).offers).map((offer) => ({
    id: String(offer?.id || ""),
    brand: String(offer?.brand || ""),
    title: String(offer?.title || "Partner offer"),
    description: String(offer?.description || ""),
    category: String(offer?.category || "developer-tool"),
    url: String(offer?.url || ""),
    disclosure: String(offer?.disclosure || "Sponsored / affiliate link"),
  })).filter((offer) => offer.id && offer.brand && offer.url);

  return {
    generatedAt: new Date().toISOString(),
    packages,
    discoverySources,
    conflicts,
    remoteRegistries,
    partnerOffers,
    partnerDisclosure: String(asObject(partnerFeed).disclosure || "Partner offers are sponsored or affiliate links and never influence DockyardOS recommendations."),
    warnings: asArray(warnings).map(String),
    summary: {
      packages: packages.length,
      installed: packages.filter((pkg) => pkg.installed).length,
      updates: packages.filter((pkg) => pkg.updateState === "update-available").length,
      approvalRequired: packages.filter((pkg) => pkg.updateState === "approval-required").length,
      quarantined: packages.filter((pkg) => pkg.updateState === "quarantined").length,
      discoverySources: discoverySources.length,
      conflicts: conflicts.length,
      remoteRegistries: remoteRegistries.length,
      partnerOffers: partnerOffers.length,
    },
  };
}

function safeJson(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

module.exports = { normalizeCommunityHubData, originLabel, safeJson };
