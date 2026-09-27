const vscode = require("vscode");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const MAX_OUTPUT_BYTES = 256 * 1024;
let activeContext;

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

function runDockyard(args, cwd = workspaceRoot()) {
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
      if (code === 0) resolve({ stdout: stdout.trim(), stderr: stderr.trim(), code, runtime: invocation.source });
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

function communityQuickPickItems(data) {
  const packages = Array.isArray(data?.packages) ? data.packages : [];
  return packages.map((pkg) => ({
    label: pkg.name || pkg.id,
    description: pkg.id,
    detail: `${pkg.trust || "unknown"} trust · ${pkg.risk || "unknown"} risk · ${(pkg.permissions || []).join(", ") || "no declared permissions"} · ${pkg.source || "unknown source"}`,
    packageId: pkg.id,
  }));
}

async function browseCommunityPackages(context) {
  const listResult = await runDockyard(["community", "list", "--json"]);
  const list = parseJson(listResult.stdout);
  const items = communityQuickPickItems(list);
  if (!items.length) {
    vscode.window.showInformationMessage("DockyardOS has no explicitly installable community package manifests in this build.");
    return;
  }

  const selected = await vscode.window.showQuickPick(items, {
    title: "DockyardOS Community Packages",
    placeHolder: "Only explicit installable manifests are shown; discovery-source entries are metadata-only.",
    matchOnDescription: true,
    matchOnDetail: true,
  });
  if (!selected) return;

  const manifestResult = await runDockyard(["community", "inspect", "--id", selected.packageId, "--json"]);
  const action = await vscode.window.showQuickPick([
    { label: "$(shield) Resolve & assess", description: "Fetch into quarantine, pin immutable commit, scan without execution", action: "assess" },
    { label: "$(eye) Show manifest", description: "Review declared source, permissions, trust, risk, entrypoints, and limits", action: "manifest" },
    { label: "$(package) Install / update", description: "Assess first; approval is requested when policy requires it", action: "install" },
  ], { title: selected.label, placeHolder: "Choose a safe package action" });
  if (!action) return;

  if (action.action === "manifest") {
    showResult(context, `Community Manifest: ${selected.packageId}`, manifestResult);
    return;
  }

  const assessmentResult = await runDockyard(["community", "resolve", "--id", selected.packageId, "--json"]);
  showResult(context, `Community Assessment: ${selected.packageId}`, assessmentResult);
  if (action.action !== "install") return;

  const assessed = parseJson(assessmentResult.stdout);
  const decision = assessed?.assessment?.decision;
  const reasons = Array.isArray(assessed?.assessment?.reasons) ? assessed.assessment.reasons : [];
  if (decision === "quarantine") {
    vscode.window.showWarningMessage(`DockyardOS kept ${selected.packageId} in quarantine. ${reasons.join("; ")}`);
    return;
  }

  let approve = false;
  if (decision === "approval-required") {
    const confirmation = await vscode.window.showWarningMessage(
      `DockyardOS requires explicit approval for ${selected.packageId}.\n\n${reasons.join("\n")}`,
      { modal: true },
      "Approve and install",
    );
    if (confirmation !== "Approve and install") return;
    approve = true;
  } else if (decision !== "automatic") {
    throw new Error(`Unexpected community assessment decision: ${decision || "missing"}`);
  }

  const args = ["community", "install", "--id", selected.packageId, "--json"];
  if (approve) args.push("--approve");
  const installed = await runDockyard(args);
  showResult(context, `Community Package Installed: ${selected.packageId}`, installed);
  vscode.window.showInformationMessage(`DockyardOS activated ${selected.packageId} after quarantine assessment.`);
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
    vscode.window.showErrorMessage(`DockyardOS: ${error instanceof Error ? error.message : String(error)}`);
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
    await browseCommunityPackages(context);
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
}

module.exports = { activate, deactivate };
