const vscode = require("vscode");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { renderDashboardHtml } = require("./dashboard-view.js");
const { loadConnections } = require("./connections-controller.js");

const MAX_OUTPUT_BYTES = 160 * 1024;
const HOSTS = new Set(["antigravity", "gemini-cli", "codex", "claude-code", "cursor", "opencode"]);
const MODES = new Set(["safe", "balanced", "autonomous"]);
const SCOPES = new Set(["user", "project"]);
const SETTING_KEYS = new Map([
  ["defaultHost", "defaultHost"],
  ["defaultMode", "defaultMode"],
  ["autoInitialize.enabled", "autoInitialize.enabled"],
  ["autoInitialize.installHostIntegration", "autoInitialize.installHostIntegration"],
  ["autoInitialize.hostScope", "autoInitialize.hostScope"],
  ["dashboard.openOnStartup", "dashboard.openOnStartup"],
  ["communityUpdates.enabled", "communityUpdates.enabled"],
  ["communityUpdates.applySafeAutomatically", "communityUpdates.applySafeAutomatically"],
]);
let dashboardPanel;
let activationContext;
let startupOpenAttempted = false;
let startupAutoInitAttempted = false;

function workspaceRoot() {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function dockyardInvocation(context) {
  const configured = vscode.workspace.getConfiguration("dockyardOS").get("cliPath", "").trim();
  if (configured) return { command: configured, prefix: [] };
  const bundled = path.join(context.extensionPath, "core", "dist", "main.js");
  if (fs.existsSync(bundled)) return { command: process.execPath, prefix: [bundled] };
  return { command: "dockyard", prefix: [] };
}

function runDockyard(context, args, options = {}) {
  const root = workspaceRoot();
  if (!root) return Promise.reject(new Error("Open a project folder before using DockyardOS."));
  return new Promise((resolve, reject) => {
    const invocation = dockyardInvocation(context);
    const child = spawn(invocation.command, [...invocation.prefix, ...args], {
      cwd: root,
      shell: false,
      windowsHide: true,
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const append = (current, chunk) => {
      const next = current + chunk.toString("utf8");
      return Buffer.byteLength(next, "utf8") <= MAX_OUTPUT_BYTES ? next : `${next.slice(0, MAX_OUTPUT_BYTES)}\n[output truncated]`;
    };
    child.stdout.on("data", (chunk) => { stdout = append(stdout, chunk); });
    child.stderr.on("data", (chunk) => { stderr = append(stderr, chunk); });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      if (error.code === "ENOENT") reject(new Error("DockyardOS Core is unavailable. Reinstall the VSIX or configure dockyardOS.cliPath."));
      else reject(error);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      const accepted = code === 0 || (Array.isArray(options.acceptExitCodes) && options.acceptExitCodes.includes(code));
      if (accepted) resolve(stdout.trim());
      else reject(new Error((stderr || stdout || `DockyardOS exited with code ${code}`).trim()));
    });
  });
}

function parseJson(text) {
  try { return JSON.parse(text); } catch { return undefined; }
}

function readSettings() {
  const c = vscode.workspace.getConfiguration("dockyardOS");
  return {
    defaultHost: c.get("defaultHost", "antigravity"),
    defaultMode: c.get("defaultMode", "balanced"),
    autoInitializeEnabled: c.get("autoInitialize.enabled", false),
    autoInstallHost: c.get("autoInitialize.installHostIntegration", true),
    hostScope: c.get("autoInitialize.hostScope", "user"),
    openOnStartup: c.get("dashboard.openOnStartup", false),
    updatesEnabled: c.get("communityUpdates.enabled", false),
    applySafe: c.get("communityUpdates.applySafeAutomatically", false),
  };
}

function normalizeAgents(team) {
  const raw = Array.isArray(team?.agents) ? team.agents : Array.isArray(team?.members) ? team.members : Array.isArray(team?.assignments) ? team.assignments : [];
  return raw.slice(0, 12).map((value) => {
    if (typeof value === "string") return { id: value, name: value };
    return {
      id: value?.id || value?.agent || value?.name || "agent",
      name: value?.name || value?.agent || value?.id || "Agent",
      status: value?.status || value?.state || value?.phase || "assigned",
      phase: value?.phase || "",
      current: value?.current === true || value?.active === true,
    };
  });
}

function latestCheckpoint(status) {
  return status?.latest?.id || status?.latestCheckpoint?.id || status?.latestCheckpoint || status?.checkpoint?.id || "";
}

async function loadDashboardModel(context) {
  const root = workspaceRoot();
  const trusted = vscode.workspace.isTrusted;
  const settings = readSettings();
  const model = {
    workspaceName: root ? path.basename(root) : "",
    workspacePath: root || "",
    trusted,
    settings,
    memoryPath: "~/.dockyardos/projects/<project-id>/",
    summary: { initialized: false, phase: "", teamStatus: "", readyConnections: 0, latestCheckpoint: "", projectId: "", gitState: "" },
    agents: [],
    connections: { providers: 0, providerReady: 0, providerAttention: 0, mcps: 0, noAuthMcps: 0 },
  };
  if (!root || !trusted) return model;

  try {
    const status = parseJson(await runDockyard(context, ["status", "--json"]));
    if (status?.project) {
      model.summary.initialized = true;
      model.summary.projectId = typeof status.project === "string" ? status.project : status.project.id || status.project.projectId || "initialized";
      model.summary.latestCheckpoint = latestCheckpoint(status);
      model.summary.gitState = status.git?.summary || status.gitState || status.repository?.state || "available in Project Status";
      if (model.summary.projectId && model.summary.projectId !== "initialized") model.memoryPath = `~/.dockyardos/projects/${model.summary.projectId}/`;
    }
  } catch {}

  if (model.summary.initialized) {
    try {
      const team = parseJson(await runDockyard(context, ["team", "status", "--json"], { acceptExitCodes: [1] }));
      if (team && !Array.isArray(team)) {
        model.summary.phase = team.currentPhase || team.phase || "";
        model.summary.teamStatus = team.status || team.state || "";
        model.agents = normalizeAgents(team);
      }
    } catch {}
  }

  try {
    const connections = await loadConnections(context, false);
    model.connections = connections.summary || model.connections;
    model.summary.readyConnections = Number(model.connections.providerReady || 0);
  } catch {}
  return model;
}

function backgroundUri(context, webview) {
  const asset = vscode.Uri.file(path.join(context.extensionPath, "assets", "dockyard-graffiti-bg.svg"));
  return webview.asWebviewUri(asset).toString();
}

async function postDashboardModel(context, notice = "") {
  if (!dashboardPanel) return;
  const model = await loadDashboardModel(context);
  await dashboardPanel.webview.postMessage({ type: "model", model, notice });
}

async function performAutoInitialize(context, options = {}) {
  const root = workspaceRoot();
  if (!root) throw new Error("Open a project folder before using Auto Initialize.");
  if (!vscode.workspace.isTrusted) throw new Error("Workspace trust is required before Auto Initialize can configure a project.");
  const settings = readSettings();
  const host = HOSTS.has(settings.defaultHost) ? settings.defaultHost : "antigravity";
  const mode = MODES.has(settings.defaultMode) ? settings.defaultMode : "balanced";
  const scope = SCOPES.has(settings.hostScope) ? settings.hostScope : "user";
  const installHost = settings.autoInstallHost !== false;

  if (options.interactive !== false) {
    const details = installHost
      ? `Initialize this project in ${mode} mode and install/update the ${host} integration at ${scope} scope?`
      : `Initialize this project in ${mode} mode?`;
    const decision = await vscode.window.showInformationMessage(
      `${details}\n\nDockyardOS project memory remains outside the source repository. Existing different host integration content is not silently overwritten.`,
      { modal: true },
      "Auto Initialize",
    );
    if (decision !== "Auto Initialize") return { cancelled: true };
  }

  let status;
  try { status = parseJson(await runDockyard(context, ["status", "--json"])); } catch {}
  const initialized = Boolean(status?.project);
  if (!initialized) await runDockyard(context, ["init", "--mode", mode, "--no-host-integration"]);

  let hostResult = "not requested";
  if (installHost) {
    await runDockyard(context, ["host", "plan", "--host", host, "--scope", scope, "--json"]);
    const installed = parseJson(await runDockyard(context, ["host", "install", "--host", host, "--scope", scope, "--json"]));
    const fallback = Array.isArray(installed?.results)
      ? installed.results.find((item) => item?.method === "antigravity-ide-global-plugin-directory")
      : undefined;
    hostResult = fallback
      ? `${host} · ${scope} · IDE plugin fallback`
      : `${host} · ${scope}`;
  }

  let doctor = "completed";
  try { await runDockyard(context, ["doctor", "--json"], { acceptExitCodes: [1] }); } catch (error) { doctor = `attention: ${error.message}`; }
  return { initialized: true, mode, host: hostResult, doctor };
}

async function updateSetting(key, value) {
  const configKey = SETTING_KEYS.get(key);
  if (!configKey) throw new Error("Unsupported DockyardOS setting.");
  if (configKey === "defaultHost" && !HOSTS.has(String(value))) throw new Error("Invalid default host.");
  if (configKey === "defaultMode" && !MODES.has(String(value))) throw new Error("Invalid operating mode.");
  if (configKey === "autoInitialize.hostScope" && !SCOPES.has(String(value))) throw new Error("Invalid host integration scope.");
  if (["autoInitialize.enabled", "autoInitialize.installHostIntegration", "dashboard.openOnStartup", "communityUpdates.enabled", "communityUpdates.applySafeAutomatically"].includes(configKey) && typeof value !== "boolean") throw new Error("Invalid boolean setting value.");
  await vscode.workspace.getConfiguration("dockyardOS").update(configKey, value, vscode.ConfigurationTarget.Global);
}

const COMMAND_ACTIONS = new Map([
  ["resume", "dockyardOS.resume"],
  ["doctor", "dockyardOS.doctor"],
  ["status", "dockyardOS.status"],
  ["team-start", "dockyardOS.teamStart"],
  ["team-status", "dockyardOS.teamStatus"],
  ["connections", "dockyardOS.connections"],
  ["community", "dockyardOS.communityBrowse"],
]);

async function handleAction(context, action) {
  if (action === "auto-initialize") {
    const result = await performAutoInitialize(context, { interactive: true });
    if (result?.cancelled) return "Auto Initialize cancelled.";
    return `Auto Initialize complete · ${result.mode} · ${result.host} · doctor ${result.doctor}`;
  }
  const command = COMMAND_ACTIONS.get(action);
  if (!command) throw new Error("Unsupported dashboard action.");
  await vscode.commands.executeCommand(command);
  return "Action opened.";
}

async function openDashboard(context, options = {}) {
  if (dashboardPanel) {
    dashboardPanel.reveal(vscode.ViewColumn.One, true);
    await postDashboardModel(context, options.notice || "Dashboard refreshed.");
    return;
  }
  const panel = vscode.window.createWebviewPanel(
    "dockyardOS.dashboard",
    "DockyardOS",
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, "assets"))],
    },
  );
  dashboardPanel = panel;
  const model = await loadDashboardModel(context);
  panel.webview.html = renderDashboardHtml(panel.webview, model, backgroundUri(context, panel.webview));
  panel.onDidDispose(() => { if (dashboardPanel === panel) dashboardPanel = undefined; }, null, context.subscriptions);
  panel.webview.onDidReceiveMessage(async (message) => {
    try {
      if (!message || typeof message !== "object") throw new Error("Invalid DockyardOS dashboard message.");
      if (message.type === "refresh") {
        await postDashboardModel(context, "Dashboard refreshed.");
        return;
      }
      if (message.type === "setting") {
        await updateSetting(String(message.key || ""), message.value);
        await postDashboardModel(context, "Setting saved.");
        return;
      }
      if (message.type === "action") {
        const notice = await handleAction(context, String(message.action || ""));
        await postDashboardModel(context, notice);
        return;
      }
      throw new Error("Unsupported DockyardOS dashboard message.");
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      void panel.webview.postMessage({ type: "error", message: text });
      vscode.window.showErrorMessage(`DockyardOS: ${text}`);
    }
  }, null, context.subscriptions);
}

async function maybeAutoInitialize(context) {
  if (startupAutoInitAttempted) return;
  startupAutoInitAttempted = true;
  const settings = readSettings();
  if (!settings.autoInitializeEnabled || !workspaceRoot() || !vscode.workspace.isTrusted) return;
  try {
    const status = parseJson(await runDockyard(context, ["status", "--json"]));
    if (!status?.project) {
      await performAutoInitialize(context, { interactive: false });
      if (dashboardPanel) await postDashboardModel(context, "Workspace auto-initialized from your DockyardOS settings.");
      else vscode.window.showInformationMessage("DockyardOS auto-initialized this workspace.");
    }
  } catch (error) {
    vscode.window.showWarningMessage(`DockyardOS Auto Initialize needs attention: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function activateDashboard(context) {
  activationContext = context;
  context.subscriptions.push(vscode.commands.registerCommand("dockyardOS.dashboard", () => openDashboard(context)));
  context.subscriptions.push(vscode.commands.registerCommand("dockyardOS.autoInitialize", async () => {
    const result = await performAutoInitialize(context, { interactive: true });
    if (result && !result.cancelled) {
      vscode.window.showInformationMessage(`DockyardOS Auto Initialize complete: ${result.mode} · ${result.host}.`);
      await openDashboard(context, { notice: "Auto Initialize complete." });
    }
  }));
  const configurationWatcher = vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration("dockyardOS") && dashboardPanel) void postDashboardModel(context, "Settings refreshed.");
  });
  const workspaceWatcher = vscode.workspace.onDidChangeWorkspaceFolders(() => {
    startupAutoInitAttempted = false;
    if (dashboardPanel) void postDashboardModel(context, "Workspace changed.");
    void maybeAutoInitialize(context);
  });
  context.subscriptions.push(configurationWatcher, workspaceWatcher);
  if (typeof vscode.workspace.onDidGrantWorkspaceTrust === "function") {
    context.subscriptions.push(vscode.workspace.onDidGrantWorkspaceTrust(() => {
      startupAutoInitAttempted = false;
      void maybeAutoInitialize(context);
    }));
  }
  void maybeAutoInitialize(context);
  const settings = readSettings();
  if (!startupOpenAttempted && settings.openOnStartup && workspaceRoot() && vscode.workspace.isTrusted) {
    startupOpenAttempted = true;
    setTimeout(() => void openDashboard(context), 350);
  }
}

function deactivateDashboard() {
  dashboardPanel = undefined;
  activationContext = undefined;
  startupOpenAttempted = false;
  startupAutoInitAttempted = false;
}

module.exports = { activateDashboard, deactivateDashboard, loadDashboardModel, performAutoInitialize };
