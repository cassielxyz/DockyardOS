const tokenInput = document.getElementById("adminToken");
const connectButton = document.getElementById("connectButton");
const disconnectButton = document.getElementById("disconnectButton");
const refreshButton = document.getElementById("refreshButton");
const dashboard = document.getElementById("dashboard");
const connectionState = document.getElementById("connectionState");
const adsEnabled = document.getElementById("adsEnabled");
const minViewMs = document.getElementById("minViewMs");
const leaseSeconds = document.getElementById("leaseSeconds");
const campaignsRoot = document.getElementById("campaigns");
const addCampaignButton = document.getElementById("addCampaignButton");
const saveButton = document.getElementById("saveButton");
const saveStatus = document.getElementById("saveStatus");
const metricSessions = document.getElementById("metricSessions");
const metricImpressions = document.getElementById("metricImpressions");
const metricLeases = document.getElementById("metricLeases");
const metricStorage = document.getElementById("metricStorage");

let adminToken = "";
let currentConfig;

function setStatus(text, kind = "") {
  saveStatus.textContent = text;
  saveStatus.className = `status-text${kind ? ` ${kind}` : ""}`;
}

function field(labelText, value, options = {}) {
  const label = document.createElement("label");
  label.textContent = labelText;
  const input = options.multiline ? document.createElement("textarea") : document.createElement("input");
  if (!options.multiline) input.type = options.type || "text";
  if (options.min != null) input.min = String(options.min);
  if (options.max != null) input.max = String(options.max);
  if (options.step != null) input.step = String(options.step);
  input.value = value ?? "";
  if (options.className) label.className = options.className;
  label.append(input);
  return { label, input };
}

function campaignIdCandidate(index) {
  return `campaign-${Date.now().toString(36)}-${index + 1}`;
}

function campaignEditor(campaign, index) {
  const article = document.createElement("article");
  article.className = "campaign";
  article.dataset.index = String(index);

  const head = document.createElement("div");
  head.className = "campaign-head";
  const title = document.createElement("strong");
  title.textContent = campaign.title || campaign.id || `Campaign ${index + 1}`;
  const actions = document.createElement("div");
  actions.className = "campaign-actions";

  const enabledLabel = document.createElement("label");
  enabledLabel.className = "toggle";
  const enabled = document.createElement("input");
  enabled.type = "checkbox";
  enabled.checked = campaign.enabled !== false;
  enabled.dataset.field = "enabled";
  const enabledText = document.createElement("span");
  enabledText.textContent = "Enabled";
  enabledLabel.append(enabled, enabledText);

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "secondary remove";
  remove.textContent = "Remove";
  remove.addEventListener("click", () => {
    article.remove();
    reindexCampaigns();
  });
  actions.append(enabledLabel, remove);
  head.append(title, actions);

  const grid = document.createElement("div");
  grid.className = "campaign-grid";
  const fields = [
    ["Campaign id", campaign.id, { key: "id" }],
    ["Weight", campaign.weight ?? 1, { key: "weight", type: "number", min: 1, max: 100, step: 1 }],
    ["Title", campaign.title, { key: "title" }],
    ["CTA label", campaign.ctaLabel, { key: "ctaLabel" }],
    ["CTA URL", campaign.ctaUrl, { key: "ctaUrl", className: "wide" }],
    ["Body", campaign.body, { key: "body", className: "wide", multiline: true }],
    ["Starts at (optional ISO)", campaign.startsAt || "", { key: "startsAt" }],
    ["Ends at (optional ISO)", campaign.endsAt || "", { key: "endsAt" }],
  ];
  for (const [labelText, value, options] of fields) {
    const created = field(labelText, value, options);
    created.input.dataset.field = options.key;
    created.input.addEventListener("input", () => {
      if (options.key === "title" || options.key === "id") title.textContent = article.querySelector('[data-field="title"]')?.value || article.querySelector('[data-field="id"]')?.value || `Campaign ${index + 1}`;
    });
    grid.append(created.label);
  }

  article.append(head, grid);
  return article;
}

function reindexCampaigns() {
  [...campaignsRoot.children].forEach((child, index) => { child.dataset.index = String(index); });
}

function renderConfig(config) {
  currentConfig = config;
  adsEnabled.checked = config.enabled !== false;
  minViewMs.value = String(config.minViewMs ?? 3000);
  leaseSeconds.value = String(config.leaseSeconds ?? 1800);
  campaignsRoot.replaceChildren();
  (config.campaigns || []).forEach((campaign, index) => campaignsRoot.append(campaignEditor(campaign, index)));
}

function readCampaign(article) {
  const value = (key) => article.querySelector(`[data-field="${key}"]`)?.value ?? "";
  const startsAt = value("startsAt").trim();
  const endsAt = value("endsAt").trim();
  return {
    id: value("id").trim().toLowerCase(),
    enabled: Boolean(article.querySelector('[data-field="enabled"]')?.checked),
    title: value("title").trim(),
    body: value("body").trim(),
    ctaLabel: value("ctaLabel").trim(),
    ctaUrl: value("ctaUrl").trim(),
    weight: Number(value("weight")) || 1,
    ...(startsAt ? { startsAt } : {}),
    ...(endsAt ? { endsAt } : {}),
  };
}

function collectConfig() {
  return {
    schemaVersion: 1,
    enabled: adsEnabled.checked,
    minViewMs: Number(minViewMs.value),
    leaseSeconds: Number(leaseSeconds.value),
    campaigns: [...campaignsRoot.children].map(readCampaign),
  };
}

async function adminFetch(path, options = {}) {
  if (!adminToken) throw new Error("Enter the administrator token first.");
  const response = await fetch(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || body.error || `Request failed (${response.status})`);
  return body;
}

function metric(metrics, key) {
  const value = Number(metrics?.[`${key}:total`] ?? 0);
  return Number.isFinite(value) ? value.toLocaleString() : "0";
}

async function refreshAll() {
  setStatus("Loading server policy…");
  const [ads, metrics] = await Promise.all([
    adminFetch("/api/admin/ads"),
    adminFetch("/api/admin/metrics"),
  ]);
  renderConfig(ads.config);
  metricSessions.textContent = metric(metrics.metrics, "session");
  metricImpressions.textContent = metric(metrics.metrics, "impression");
  metricLeases.textContent = metric(metrics.metrics, "lease");
  metricStorage.textContent = metrics.storage || "unknown";
  dashboard.classList.remove("hidden");
  connectionState.textContent = "Connected";
  connectionState.classList.add("connected");
  setStatus(`Loaded policy updated ${ads.config.updatedAt || "now"}.`, "success");
}

connectButton.addEventListener("click", async () => {
  adminToken = tokenInput.value.trim();
  try {
    await refreshAll();
    tokenInput.value = "";
  } catch (error) {
    adminToken = "";
    dashboard.classList.add("hidden");
    connectionState.textContent = "Locked";
    connectionState.classList.remove("connected");
    setStatus(error.message, "error");
    window.alert(error.message);
  }
});

disconnectButton.addEventListener("click", () => {
  adminToken = "";
  tokenInput.value = "";
  dashboard.classList.add("hidden");
  connectionState.textContent = "Locked";
  connectionState.classList.remove("connected");
  setStatus("");
});

refreshButton.addEventListener("click", async () => {
  try { await refreshAll(); } catch (error) { setStatus(error.message, "error"); }
});

addCampaignButton.addEventListener("click", () => {
  const index = campaignsRoot.children.length;
  campaignsRoot.append(campaignEditor({
    id: campaignIdCandidate(index),
    enabled: true,
    title: "New sponsored placement",
    body: "Describe the sponsor or partner placement clearly.",
    ctaLabel: "Learn more",
    ctaUrl: "https://example.com/",
    weight: 1,
  }, index));
});

saveButton.addEventListener("click", async () => {
  saveButton.disabled = true;
  try {
    setStatus("Saving server policy…");
    const body = await adminFetch("/api/admin/ads", {
      method: "PUT",
      body: JSON.stringify({ config: collectConfig() }),
    });
    renderConfig(body.config);
    setStatus("Server policy saved.", "success");
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    saveButton.disabled = false;
  }
});
