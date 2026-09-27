const vscode = require("vscode");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { normalizeCommunityHubData } = require("./community-hub-model.js");
const { renderCommunityHubHtml } = require("./community-hub-view.js");

const MAX_OUTPUT_BYTES = 256 * 1024;
const COMMUNITY_ID = /^[a-z0-9][a-z0-9._-]{1,79}$/;
let activeContext;
let communityHubPanel;

function workspaceRoot() {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) throw new Error("Open a project folder before running DockyardOS.");
  return folder.uri.fsPath;
}

function dockyardInvocation() {
  const configured = vscode.workspace.getConfiguration("dockyardOS").get("cliPath", "").trim();
  if (configured) return { command: configured, prefix: [], source: "configured CLI" };
  const bundled = activeContext && path.join(activeContext.extensionPath, "core", "dist", "main.js");
  if (bundled && fs.existsSync(bundled)) return { command: process.execPath, prefix: [bundled], source: "bundled Core" };
  return { command: "dockyard", prefix: [], source: "PATH CLI" };
}

function runDockyard(args, cwd = workspaceRoot(), options = {}) {
  return new Promise((resolve, reject) => {
    const invocation = dockyardInvocation();
    const child = spawn(invocation.command, [...invocation.prefix, ...args], {
      cwd,
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
      if (error.code === "ENOENT") reject(new Error(`DockyardOS ${invocation.source} is unavailable. Reinstall the DockyardOS VSIX or set dockyardOS.cliPath to a working external CLI.`));
      else reject(error);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      const accepted = code === 0 || (Array.isArray(options.acceptExitCodes) && options.acceptExitCodes.includes(code));
      if (accepted) resolve({ stdout: stdout.trim(), stderr: stderr.trim(), code, runtime: invocation.source });
      else reject(new Error((stderr || stdout || `DockyardOS exited with code ${code}`).trim()));
    });
  });
}

function parseJson(text) {
  try { return JSON.parse(text); } catch { return undefined; }
}

function outputChannel(context) {
  if (!context.__dockyardOutput) context.__dockyardOutput = vscode.window.createOutputChannel("DockyardOS");
  return context.__dockyardOutput;
}

function showResult(context, title, result) {
  const channel = outputChannel(context);
  channel.clear();
  channel.appendLine(`# ${title}`);
  if (result.runtime) channel.appendLine(`Runtime: ${result.runtime}`);
  channel.appendLine("");
  channel.appendLine(result.stdout || "(no output)");
  if (result.stderr) {
    channel.appendLine("");
    channel.appendLine("# stderr");
    channel.appendLine(result.stderr);
  }
  channel.show(true);
}

function communityId(value) {
  if (!COMMUNITY_ID.test(value || "")) throw new Error("Community Hub received an invalid package id.");
  return value;
}

async function loadCommunityHubModel(root = workspaceRoot()) {
  const warnings = [];
  const [listResult, statusResult] = await Promise.all([
    runDockyard(["community", "list", "--json"], root),
    runDockyard(["community", "status", "--json"], root),
  ]);
  const list = parseJson(listResult.stdout);
  const status = parseJson(statusResult.stdout);
  if (!list || !status) throw new Error("DockyardOS Community Hub could not parse registry/status data.");

  let updates = [];
  try {
    const updateResult = await runDockyard(["community", "updates", "check", "--json"], root, { acceptExitCodes: [1] });
    const parsed = parseJson(updateResult.stdout);
    if (Array.isArray(parsed)) updates = parsed;
    else warnings.push("Installed-package update state could not be parsed; install and trust state remain available.");
  } catch (error) {
    warnings.push(`Installed-package update check unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }
  return normalizeCommunityHubData(list, status, updates, warnings);
}

async function refreshCommunityHub(panel, notice = "") {
  const model = await loadCommunityHubModel();
  await panel.webview.postMessage({ type: "model", model, notice });
  return model;
}

async function communityPackageAction(context, panel, action, rawId) {
  const id = communityId(rawId);
  if (!new Set(["inspect", "assess", "install"]).has(action)) throw new Error("Unsupported Community Hub action.");

  if (action === "inspect") {
    const result = await runDockyard(["community", "inspect", "--id", id, "--json"]);
    const data = parseJson(result.stdout);
    if (!data) throw new Error("Community manifest output was not valid JSON.");
    await panel.webview.postMessage({ type: "detail", title: `Manifest: ${id}`, data });
    return;
  }

  const assessmentResult = await runDockyard(["community", "resolve", "--id", id, "--json"]);
  const assessed = parseJson(assessmentResult.stdout);
  if (!assessed) throw new Error("Community assessment output was not valid JSON.");
  if (action === "assess") {
    await panel.webview.postMessage({ type: "detail", title: `Assessment: ${id}`, data: assessed });
    return;
  }

  const decision = assessed?.assessment?.decision;
  const reasons = Array.isArray(assessed?.assessment?.reasons) ? assessed.assessment.reasons : [];
  const expectedRevision = assessed?.resolution?.revision;
  const expectedSha256 = assessed?.resolution?.contentSha256;
  if (!/^[a-f0-9]{40}$/i.test(expectedRevision || "") || !/^[a-f0-9]{64}$/i.test(expectedSha256 || "")) {
    throw new Error("Community assessment did not return a valid immutable revision and content digest.");
  }
  if (decision === "quarantine") {
    await panel.webview.postMessage({ type: "detail", title: `Quarantined: ${id}`, data: assessed });
    vscode.window.showWarningMessage(`DockyardOS kept ${id} in quarantine. ${reasons.join("; ")}`);
    return;
  }

  let approve = false;
  if (decision === "approval-required") {
    const confirmation = await vscode.window.showWarningMessage(
      `DockyardOS requires explicit approval for ${id} at ${expectedRevision.slice(0, 12)}.\n\n${reasons.join("\n")}`,
      { modal: true },
      "Approve this revision",
    );
    if (confirmation !== "Approve this revision") {
      await panel.webview.postMessage({ type: "notice", text: `Install cancelled for ${id}.` });
      return;
    }
    approve = true;
  } else if (decision !== "automatic") {
    throw new Error(`Unexpected community assessment decision: ${decision || "missing"}`);
  }

  const args = [
    "community", "install",
    "--id", id,
    "--expected-revision", expectedRevision,
    "--expected-sha256", expectedSha256,
    "--json",
  ];
  if (approve) args.push("--approve");
  const installed = await runDockyard(args);
  const installedData = parseJson(installed.stdout) || { output: installed.stdout };
  await panel.webview.postMessage({ type: "detail", title: `Installed: ${id}`, data: installedData });
  vscode.window.showInformationMessage(`DockyardOS activated ${id} at ${expectedRevision.slice(0, 12)} after quarantine assessment.`);
  await refreshCommunityHub(panel, `${id} activated at ${expectedRevision.slice(0, 12)}.`);
}

async function openCommunityHub(context) {
  if (communityHubPanel) {
    communityHubPanel.reveal(vscode.ViewColumn.One, true);
    await refreshCommunityHub(communityHubPanel, "Community Hub refreshed.");
    return;
  }
  const model = await loadCommunityHubModel();
  const panel = vscode.window.createWebviewPanel(
    "dockyardOS.communityHub",
    "DockyardOS Community Hub",
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [] },
  );
  communityHubPanel = panel;
  panel.webview.html = renderCommunityHubHtml(panel.webview, model);
  panel.onDidDispose(() => { if (communityHubPanel === panel) communityHubPanel = undefined; }, null, context.subscriptions);
  panel.webview.onDidReceiveMessage((message) => guarded(async () => {
    if (!message || typeof message !== "object") throw new Error("Invalid Community Hub message.");
    if (message.type === "refresh") {
      await refreshCommunityHub(panel, "Community Hub refreshed.");
      return;
    }
    if (message.type === "package-action") {
      await communityPackageAction(context, panel, message.action, message.id);
      return;
    }
    throw new Error("Unsupported Community Hub message.");
  }), null, context.subscriptions);
}

async function refreshStatus(statusBar) {
  if (!vscode.workspace.workspaceFolders?.length) {
    statusBar.text = "$(tools) DockyardOS";
    statusBar.tooltip = "Open a project folder to use DockyardOS";
    return;
  }
  try {
    const result = await runDockyard(["status", "--json"]);
    const data = parseJson(result.stdout);
    if (!data?.project) {
      statusBar.text = "$(circle-outline) DockyardOS: not initialized";
      statusBar.tooltip = "Run DockyardOS: Initialize Project";
      return;
    }
    let team;
    try {
      const teamResult = await runDockyard(["team", "status", "--json"]);
      team = parseJson(teamResult.stdout);
    } catch {}
    if (team?.currentPhase && team?.status !== "completed") {
      statusBar.text = `$(sync~spin) DockyardOS: ${team.currentPhase}`;
      statusBar.tooltip = `Team ${team.id || ""} · ${team.status || "active"}`;
    } else {
      statusBar.text = "$(check) DockyardOS: ready";
      statusBar.tooltip = data.latest ? `Latest checkpoint: ${data.latest.id}` : "Initialized; no checkpoint yet";
    }
  } catch (error) {
    statusBar.text = "$(warning) DockyardOS";
    statusBar.tooltip = error.message;
  }
}

async function guarded(action) {
  try { return await action(); }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (communityHubPanel) void communityHubPanel.webview.postMessage({ type: "error", message });
    vscode.window.showErrorMessage(`DockyardOS: ${message}`);
    return undefined;
  }
}

const HOSTS = ["antigravity", "gemini-cli", "codex", "claude-code", "cursor", "opencode"];

function activate(context) {
  activeContext = context;
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  statusBar.command = "dockyardOS.status";
  statusBar.show();
  context.subscriptions.push(statusBar);

  context.subscriptions.push(vscode.commands.registerCommand("dockyardOS.initialize", () => guarded(async () => {
    const mode = await vscode.window.showQuickPick(["balanced", "safe", "autonomous"], { placeHolder: "DockyardOS operating mode", title: "Initialize DockyardOS" });
    if (!mode) return;
    const result = await runDockyard(["init", "--mode", mode]);
    vscode.window.showInformationMessage(result.stdout.split("\n")[0] || "DockyardOS initialized.");
    await refreshStatus(statusBar);
  })));

  context.subscriptions.push(vscode.commands.registerCommand("dockyardOS.doctor", () => guarded(async () => {
    const result = await runDockyard(["doctor", "--json"]);
    showResult(context, "Doctor", result);
    await refreshStatus(statusBar);
  })));

  context.subscriptions.push(vscode.commands.registerCommand("dockyardOS.status", () => guarded(async () => {
    const result = await runDockyard(["status", "--json"]);
    showResult(context, "Project Status", result);
    await refreshStatus(statusBar);
  })));

  context.subscriptions.push(vscode.commands.registerCommand("dockyardOS.resume", () => guarded(async () => {
    const result = await runDockyard(["resume", "--json"]);
    showResult(context, "Recovered Context", result);
    await refreshStatus(statusBar);
  })));

  context.subscriptions.push(vscode.commands.registerCommand("dockyardOS.teamStart", () => guarded(async () => {
    const task = await vscode.window.showInputBox({ title: "Start DockyardOS Team", prompt: "Describe the project task/requirement", ignoreFocusOut: true });
    if (!task) return;
    const stackText = await vscode.window.showInputBox({ title: "Detected/known stack", prompt: "Comma-separated stack (optional)", placeHolder: "web,nextjs,react,postgres" });
    const args = ["team", "start", "--task", task, "--json"];
    if (stackText?.trim()) args.push("--stack", stackText.trim());
    const result = await runDockyard(args);
    showResult(context, "Team Started", result);
    await refreshStatus(statusBar);
  })));

  context.subscriptions.push(vscode.commands.registerCommand("dockyardOS.teamStatus", () => guarded(async () => {
    const result = await runDockyard(["team", "status", "--json"]);
    showResult(context, "Team Status", result);
    await refreshStatus(statusBar);
  })));

  context.subscriptions.push(vscode.commands.registerCommand("dockyardOS.hostDoctor", () => guarded(async () => {
    const configured = vscode.workspace.getConfiguration("dockyardOS").get("defaultHost", "antigravity");
    const host = await vscode.window.showQuickPick(HOSTS, { title: "Check Agent Host", placeHolder: configured });
    if (!host) return;
    const result = await runDockyard(["host", "doctor", "--host", host, "--json"]);
    showResult(context, `Host Doctor: ${host}`, result);
  })));

  context.subscriptions.push(vscode.commands.registerCommand("dockyardOS.hostInstall", () => guarded(async () => {
    const configured = vscode.workspace.getConfiguration("dockyardOS").get("defaultHost", "antigravity");
    const host = await vscode.window.showQuickPick(HOSTS, { title: "Install DockyardOS Agent Host Integration", placeHolder: configured });
    if (!host) return;
    const scopes = host === "codex" ? ["user", "project", "runtime"] : ["user", "project"];
    const scope = await vscode.window.showQuickPick(scopes, { title: "Integration scope", placeHolder: "user installs once across projects" });
    if (!scope) return;
    const plan = await runDockyard(["host", "plan", "--host", host, "--scope", scope, "--json"]);
    showResult(context, `Host Install Plan: ${host}`, plan);
    const decision = await vscode.window.showInformationMessage(`Install DockyardOS integration for ${host} at ${scope} scope? Existing different skill content will not be overwritten.`, { modal: true }, "Install");
    if (decision !== "Install") return;
    const result = await runDockyard(["host", "install", "--host", host, "--scope", scope, "--json"]);
    showResult(context, `Host Integration Installed: ${host}`, result);
    vscode.window.showInformationMessage(`DockyardOS ${host} integration completed for ${scope} scope.`);
  })));

  context.subscriptions.push(vscode.commands.registerCommand("dockyardOS.communityBrowse", () => guarded(async () => {
    await openCommunityHub(context);
  })));

  context.subscriptions.push(vscode.commands.registerCommand("dockyardOS.communityStatus", () => guarded(async () => {
    const result = await runDockyard(["community", "status", "--json"]);
    showResult(context, "Community Package Status", result);
  })));

  const workspaceWatcher = vscode.workspace.onDidChangeWorkspaceFolders(() => refreshStatus(statusBar));
  context.subscriptions.push(workspaceWatcher);
  refreshStatus(statusBar);
}

function deactivate() {
  activeContext = undefined;
  communityHubPanel = undefined;
}

module.exports = { activate, deactivate };
