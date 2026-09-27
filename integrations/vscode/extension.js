const vscode = require("vscode");
const { spawn } = require("node:child_process");

const MAX_OUTPUT_BYTES = 256 * 1024;

function workspaceRoot() {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) throw new Error("Open a project folder before running DockyardOS.");
  return folder.uri.fsPath;
}

function cliPath() {
  return vscode.workspace.getConfiguration("dockyardOS").get("cliPath", "dockyard");
}

function runDockyard(args, cwd = workspaceRoot()) {
  return new Promise((resolve, reject) => {
    const child = spawn(cliPath(), args, {
      cwd,
      shell: false,
      windowsHide: true,
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    const append = (current, chunk) => {
      const next = current + chunk.toString("utf8");
      return Buffer.byteLength(next, "utf8") <= MAX_OUTPUT_BYTES ? next : `${next.slice(0, MAX_OUTPUT_BYTES)}\n[output truncated]`;
    };
    child.stdout.on("data", (chunk) => { stdout = append(stdout, chunk); });
    child.stderr.on("data", (chunk) => { stderr = append(stderr, chunk); });
    child.on("error", (error) => {
      if (error.code === "ENOENT") reject(new Error(`DockyardOS CLI was not found at '${cliPath()}'. Install/link DockyardOS once or set dockyardOS.cliPath.`));
      else reject(error);
    });
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout: stdout.trim(), stderr: stderr.trim(), code });
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
  channel.appendLine("");
  channel.appendLine(result.stdout || "(no output)");
  if (result.stderr) {
    channel.appendLine("");
    channel.appendLine("# stderr");
    channel.appendLine(result.stderr);
  }
  channel.show(true);
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

function activate(context) {
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
    const host = await vscode.window.showQuickPick(["antigravity", "gemini-cli", "codex", "claude-code", "cursor", "opencode"], { title: "Check Agent Host", placeHolder: configured });
    if (!host) return;
    const result = await runDockyard(["host", "doctor", "--host", host, "--json"]);
    showResult(context, `Host Doctor: ${host}`, result);
  })));

  const workspaceWatcher = vscode.workspace.onDidChangeWorkspaceFolders(() => refreshStatus(statusBar));
  context.subscriptions.push(workspaceWatcher);
  refreshStatus(statusBar);
}

function deactivate() {}

module.exports = { activate, deactivate };
