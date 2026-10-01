const vscode = require("vscode");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { normalizeConnections, providerDefinition, mcpDefinition } = require("./connections-model.js");
const { renderConnectionsHtml } = require("./connections-view.js");

const MAX_OUTPUT_BYTES = 128 * 1024;
let connectionsPanel;

function workspaceRoot() {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) throw new Error("Open a project folder before using DockyardOS Connections.");
  return folder.uri.fsPath;
}

function dockyardInvocation(context) {
  const configured = vscode.workspace.getConfiguration("dockyardOS").get("cliPath", "").trim();
  if (configured) return { command: configured, prefix: [] };
  const bundled = path.join(context.extensionPath, "core", "dist", "main.js");
  if (fs.existsSync(bundled)) return { command: process.execPath, prefix: [bundled] };
  return { command: "dockyard", prefix: [] };
}

function runDockyard(context, args) {
  return new Promise((resolve, reject) => {
    const invocation = dockyardInvocation(context);
    const child = spawn(invocation.command, [...invocation.prefix, ...args], {
      cwd: workspaceRoot(),
      shell: false,
      windowsHide: true,
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const append = (current, chunk) => {
      const next = current + chunk.toString("utf8");
      if (Buffer.byteLength(next, "utf8") <= MAX_OUTPUT_BYTES) return next;
      return `${next.slice(0, MAX_OUTPUT_BYTES)}\n[output truncated]`;
    };
    child.stdout.on("data", (chunk) => { stdout = append(stdout, chunk); });
    child.stderr.on("data", (chunk) => { stderr = append(stderr, chunk); });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      if (error.code === "ENOENT") reject(new Error("DockyardOS Core is unavailable. Reinstall the extension or configure dockyardOS.cliPath."));
      else reject(error);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      if (code === 0) resolve(stdout.trim());
      else reject(new Error((stderr || stdout || `DockyardOS exited with code ${code}`).trim()));
    });
  });
}

function parseJson(text) {
  try { return JSON.parse(text); } catch { return undefined; }
}

async function loadConnections(context, liveChecked) {
  const args = ["providers", "inspect", "--json"];
  if (liveChecked) args.push("--live");
  const output = await runDockyard(context, args);
  const probes = parseJson(output);
  if (!Array.isArray(probes)) throw new Error("DockyardOS provider readiness output was not a JSON array.");
  return normalizeConnections(probes, { liveChecked });
}

async function postModel(context, panel, liveChecked, notice) {
  const model = await loadConnections(context, liveChecked);
  await panel.webview.postMessage({ type: "model", model, notice });
}

function safeUrl(raw) {
  const url = new URL(raw);
  if (url.protocol !== "https:") throw new Error("DockyardOS Connections only opens HTTPS setup pages.");
  return vscode.Uri.parse(url.toString());
}

async function openProviderSetup(id) {
  const definition = providerDefinition(id);
  if (!definition?.setupUrl) throw new Error(`No setup documentation is registered for provider ${id}.`);
  await vscode.env.openExternal(safeUrl(definition.setupUrl));
}

async function openProviderLogin(id) {
  const definition = providerDefinition(id);
  if (!definition?.loginCommand) {
    await openProviderSetup(id);
    return;
  }
  const answer = await vscode.window.showInformationMessage(
    `DockyardOS will open a visible terminal and run the official ${id} login command. Credentials are handled by that provider CLI and are not captured by DockyardOS.\n\nCommand: ${definition.loginCommand}`,
    { modal: true },
    "Open login terminal",
  );
  if (answer !== "Open login terminal") return;
  const terminal = vscode.window.createTerminal({ name: `DockyardOS · ${id} login`, cwd: workspaceRoot() });
  terminal.show();
  terminal.sendText(definition.loginCommand, true);
}

async function openMcpSetup(id) {
  const definition = mcpDefinition(id);
  if (!definition?.setupUrl) throw new Error(`No setup documentation is registered for MCP ${id}.`);
  await vscode.env.openExternal(safeUrl(definition.setupUrl));
}

async function runMcpSetupCommand(id) {
  const definition = mcpDefinition(id);
  if (!definition?.setupCommand) {
    await openMcpSetup(id);
    return;
  }
  const answer = await vscode.window.showInformationMessage(
    `DockyardOS will run this connector's official setup command in a visible terminal. Review any configuration changes before accepting them.\n\nCommand: ${definition.setupCommand}`,
    { modal: true },
    "Open setup terminal",
  );
  if (answer !== "Open setup terminal") return;
  const terminal = vscode.window.createTerminal({ name: `DockyardOS · ${definition.name}`, cwd: workspaceRoot() });
  terminal.show();
  terminal.sendText(definition.setupCommand, true);
}

async function copyMcpEndpoint(id) {
  const definition = mcpDefinition(id);
  if (!definition?.endpoint) throw new Error(`No endpoint is registered for MCP ${id}.`);
  await vscode.env.clipboard.writeText(definition.endpoint);
  vscode.window.showInformationMessage(`${definition.name} endpoint copied.`);
}

async function openConnectionsCenter(context) {
  if (!vscode.workspace.isTrusted) throw new Error("Workspace trust is required before DockyardOS checks local provider configuration.");
  if (connectionsPanel) {
    connectionsPanel.reveal(vscode.ViewColumn.One, true);
    await postModel(context, connectionsPanel, false, "Local readiness refreshed.");
    return;
  }

  const model = await loadConnections(context, false);
  const panel = vscode.window.createWebviewPanel(
    "dockyardOS.connections",
    "DockyardOS Connections",
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [] },
  );
  connectionsPanel = panel;
  panel.webview.html = renderConnectionsHtml(panel.webview, model);
  panel.onDidDispose(() => { if (connectionsPanel === panel) connectionsPanel = undefined; }, null, context.subscriptions);
  panel.webview.onDidReceiveMessage(async (message) => {
    try {
      if (!message || typeof message !== "object") throw new Error("Invalid Connections Center message.");
      const id = typeof message.id === "string" ? message.id : "";
      switch (message.type) {
        case "refresh-local": await postModel(context, panel, false, "Local readiness refreshed."); return;
        case "verify-live": await postModel(context, panel, true, "Read-only live verification completed."); return;
        case "provider-login": await openProviderLogin(id); return;
        case "provider-setup": await openProviderSetup(id); return;
        case "mcp-setup": await openMcpSetup(id); return;
        case "mcp-command": await runMcpSetupCommand(id); return;
        case "mcp-copy-endpoint": await copyMcpEndpoint(id); return;
        default: throw new Error("Unsupported Connections Center action.");
      }
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      void panel.webview.postMessage({ type: "error", message: messageText });
      vscode.window.showErrorMessage(`DockyardOS: ${messageText}`);
    }
  }, null, context.subscriptions);
}

function activateConnections(context) {
  context.subscriptions.push(vscode.commands.registerCommand("dockyardOS.connections", () => openConnectionsCenter(context)));
}

function deactivateConnections() {
  connectionsPanel = undefined;
}

module.exports = { activateConnections, deactivateConnections, loadConnections };
