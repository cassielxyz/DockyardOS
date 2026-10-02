const vscode = require("vscode");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { normalizeConnections, providerDefinition, mcpDefinition } = require("./connections-model.js");
const {
  mcpSetupPlan,
  mergeJsonMcpConfig,
  platformExecutable,
  providerConnectPlan,
  terminalLine,
} = require("./connections-setup.js");
const { renderConnectionsHtml } = require("./connections-view.js");

const MAX_OUTPUT_BYTES = 128 * 1024;
let connectionsPanel;
let lastVerifiedConnections;

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

function runDockyard(context, args, options = {}) {
  return new Promise((resolve, reject) => {
    const invocation = dockyardInvocation(context);
    const child = spawn(invocation.command, [...invocation.prefix, ...args], {
      cwd: workspaceRoot(),
      shell: false,
      windowsHide: true,
      env: { ...process.env, ...(options.env || {}) },
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function providerSecretEnvironment(context, onlyId) {
  const env = {};
  for (const id of ["google-ai"]) {
    if (onlyId && onlyId !== id) continue;
    const definition = providerDefinition(id);
    if (!definition?.secretStorageKey || !definition?.secretEnvVar) continue;
    const secret = await context.secrets.get(definition.secretStorageKey);
    if (secret) env[definition.secretEnvVar] = secret;
  }
  return env;
}

async function verifyOneProvider(context, id, envOverride = {}) {
  const env = { ...(await providerSecretEnvironment(context, id)), ...envOverride };
  const output = await runDockyard(context, ["providers", "inspect", "--live", "--id", id, "--json"], { env });
  const probes = parseJson(output);
  if (!Array.isArray(probes) || probes.length !== 1) return undefined;
  return probes[0];
}

function openCommandTerminal(title, specs) {
  const terminal = vscode.window.createTerminal({ name: title, cwd: workspaceRoot() });
  terminal.show();
  for (const spec of specs) {
    const line = terminalLine({ command: platformExecutable(spec.command), args: spec.args || [] });
    terminal.sendText(line, true);
  }
  return terminal;
}

async function safeWriteMcpJson(plan) {
  const target = path.resolve(plan.path);
  const allowedRoot = path.resolve(plan.allowedRoot || path.dirname(target));
  await fsp.mkdir(path.dirname(target), { recursive: true });

  const [realParent, realAllowedRoot] = await Promise.all([
    fsp.realpath(path.dirname(target)),
    fsp.realpath(allowedRoot),
  ]);
  const relativeParent = path.relative(realAllowedRoot, realParent);
  if (relativeParent === ".." || relativeParent.startsWith(`..${path.sep}`) || path.isAbsolute(relativeParent)) {
    throw new Error("MCP configuration path escapes the selected host configuration root.");
  }

  let raw = "";
  let exists = false;
  try {
    const stat = await fsp.lstat(target);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error("Existing MCP configuration must be a regular file, not a symlink or special entry.");
    raw = await fsp.readFile(target, "utf8");
    exists = true;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const merged = mergeJsonMcpConfig(raw, plan);
  const stamp = `${process.pid}-${Date.now()}`;
  const temporary = `${target}.dockyard-tmp-${stamp}`;
  const rollback = `${target}.dockyard-rollback-${stamp}`;
  await fsp.writeFile(temporary, `${JSON.stringify(merged, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });

  try {
    if (exists) await fsp.rename(target, rollback);
    await fsp.rename(temporary, target);
    if (exists) await fsp.rm(rollback, { force: true });
  } catch (error) {
    await fsp.rm(temporary, { force: true }).catch(() => undefined);
    if (exists) {
      try {
        await fsp.access(rollback);
        await fsp.rename(rollback, target);
      } catch {}
    }
    throw error;
  }
}

async function watchProviderConnection(context, panel, id) {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    await sleep(attempt === 0 ? 3500 : 4000);
    try {
      const probe = await verifyOneProvider(context, id);
      if (probe?.authenticated === true || probe?.readiness === "authenticated" || probe?.readiness === "linked") {
        await postModel(context, panel, true, `${probe.displayName || id} connected and verified.`);
        return;
      }
    } catch {}
  }
  await panel.webview.postMessage({
    type: "notice",
    text: "Login/setup is still pending. Complete the provider browser/device flow, then use Verify connections.",
  });
}

function mergeVerifiedProviderState(localModel, verifiedModel) {
  if (!verifiedModel) return localModel;
  const verifiedById = new Map((verifiedModel.providers || []).map((provider) => [provider.id, provider]));
  const providers = (localModel.providers || []).map((provider) => {
    const verified = verifiedById.get(provider.id);
    if (!verified) return provider;
    const ready = verified.authenticated === true || verified.linked === true || verified.status?.level === "ready";
    return ready ? { ...provider, ...verified, liveChecked: true } : provider;
  });
  return {
    ...localModel,
    providers,
    summary: {
      ...(localModel.summary || {}),
      providerReady: providers.filter((item) => item.status?.level === "ready").length,
      providerAttention: providers.filter((item) => item.status?.level === "warning" || item.status?.level === "partial").length,
    },
  };
}

async function loadConnections(context, liveChecked) {
  const args = ["providers", "inspect", "--json"];
  if (liveChecked) args.push("--live");
  const output = await runDockyard(context, args, { env: await providerSecretEnvironment(context) });
  const probes = parseJson(output);
  if (!Array.isArray(probes)) throw new Error("DockyardOS provider readiness output was not a JSON array.");
  const model = normalizeConnections(probes, { liveChecked });
  if (liveChecked) {
    lastVerifiedConnections = model;
    return model;
  }
  return mergeVerifiedProviderState(model, lastVerifiedConnections);
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

function backgroundUri(context, webview) {
  return webview.asWebviewUri(vscode.Uri.file(path.join(context.extensionPath, "assets", "dockyard-graffiti-bg.svg"))).toString();
}

async function openProviderSetup(id) {
  const definition = providerDefinition(id);
  if (!definition?.setupUrl) throw new Error(`No setup documentation is registered for provider ${id}.`);
  await vscode.env.openExternal(safeUrl(definition.setupUrl));
}

async function connectProvider(context, panel, id) {
  const definition = providerDefinition(id);
  if (!definition) throw new Error(`Unknown provider connection: ${id}.`);

  if (definition.secretInput) {
    const value = await vscode.window.showInputBox({
      title: "Connect Google AI / Gemini API",
      prompt: "Paste a Gemini API key. DockyardOS verifies it read-only before storing it in VS Code SecretStorage.",
      password: true,
      ignoreFocusOut: true,
      validateInput: (raw) => {
        const key = String(raw || "").trim();
        if (key.length < 16) return "API key is too short.";
        if (key.length > 4096) return "API key is too long.";
        if (/\s/.test(key)) return "API key must not contain whitespace.";
        return undefined;
      },
    });
    if (value === undefined) return;
    const key = value.trim();
    const probe = await verifyOneProvider(context, id, { [definition.secretEnvVar]: key });
    if (probe?.authenticated !== true && probe?.readiness !== "authenticated") {
      throw new Error("Google AI rejected the key or the read-only verification request could not be authenticated. The key was not stored.");
    }
    await context.secrets.store(definition.secretStorageKey, key);
    await postModel(context, panel, true, "Google AI connected and verified. The API key is stored only in VS Code SecretStorage.");
    return;
  }

  const localModel = await loadConnections(context, false);
  const provider = localModel.providers.find((item) => item.id === id);
  const plan = providerConnectPlan(definition, provider, process.platform);

  if (!plan.commands.length) {
    if (plan.setupUrl) {
      await vscode.env.openExternal(safeUrl(plan.setupUrl));
      await panel.webview.postMessage({ type: "notice", text: `${provider?.name || id} needs provider-managed setup. Dockyard opened the official setup page.` });
      return;
    }
    throw new Error(`No safe automatic connection flow is registered for ${id}.`);
  }

  const commandPreview = plan.commands.map((spec) => terminalLine({ command: platformExecutable(spec.command), args: spec.args || [] })).join("\n");
  const answer = await vscode.window.showInformationMessage(
    `DockyardOS will start the official ${provider?.name || id} setup/login flow in a visible terminal. The provider owns the browser/device authorization and stores its own credentials; DockyardOS does not capture tokens.\n\n${commandPreview}`,
    { modal: true },
    plan.kind === "install-login" ? "Install & connect" : "Connect",
  );
  if (!answer) return;

  openCommandTerminal(`DockyardOS · ${provider?.name || id}`, plan.commands);
  await panel.webview.postMessage({
    type: "notice",
    text: `${provider?.name || id} login started. Complete the browser/device flow; DockyardOS is verifying in the background.`,
  });
  void watchProviderConnection(context, panel, id);
}

async function forgetProviderSecret(context, panel, id) {
  const definition = providerDefinition(id);
  if (!definition?.secretStorageKey) throw new Error(`Provider ${id} does not use DockyardOS-managed SecretStorage.`);
  const answer = await vscode.window.showWarningMessage(
    `Forget the stored ${id} credential from VS Code SecretStorage?`,
    { modal: true },
    "Forget credential",
  );
  if (answer !== "Forget credential") return;
  await context.secrets.delete(definition.secretStorageKey);
  await postModel(context, panel, false, `${id} credential removed from VS Code SecretStorage.`);
}

async function openMcpSetup(id) {
  const definition = mcpDefinition(id);
  if (!definition?.setupUrl) throw new Error(`No setup documentation is registered for MCP ${id}.`);
  await vscode.env.openExternal(safeUrl(definition.setupUrl));
}

async function configureMcp(context, panel, id) {
  const definition = mcpDefinition(id);
  if (!definition) throw new Error(`Unknown MCP connector: ${id}.`);
  if (!definition.endpoint) {
    await openMcpSetup(id);
    return;
  }

  const host = vscode.workspace.getConfiguration("dockyardOS").get("defaultHost", "antigravity");
  const plan = mcpSetupPlan(host, definition);
  if (plan.kind === "docs") {
    await openMcpSetup(id);
    return;
  }

  const detail = plan.kind === "json-file"
    ? `Update ${plan.path} and preserve all unrelated MCP servers.`
    : `Run ${terminalLine({ command: platformExecutable(plan.command), args: plan.args || [] })}.`;
  const answer = await vscode.window.showInformationMessage(
    `Configure ${definition.name} for ${host}?\n\n${detail}\n\nDockyardOS will not add credentials or OAuth tokens to the config. If authentication is required, the selected host remains responsible for its own OAuth flow.`,
    { modal: true },
    "Configure MCP",
  );
  if (answer !== "Configure MCP") return;

  if (plan.kind === "json-file") {
    await safeWriteMcpJson(plan);
  } else if (plan.kind === "command") {
    openCommandTerminal(`DockyardOS · ${definition.name} · ${host}`, [{ command: plan.command, args: plan.args }]);
  }

  const authText = definition.auth === "none"
    ? "No account login is required. Reload/restart the selected host if it does not pick up the server immediately."
    : "The MCP is configured. The selected host will perform OAuth/authentication when it starts the server; complete the browser prompt there.";
  await panel.webview.postMessage({ type: "notice", text: `${definition.name} configured for ${host}. ${authText}` });
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
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, "assets"))],
    },
  );
  connectionsPanel = panel;
  panel.webview.html = renderConnectionsHtml(panel.webview, model, backgroundUri(context, panel.webview));
  void postModel(context, panel, true, "Connected accounts verified automatically.").catch((error) => {
    void panel.webview.postMessage({ type: "notice", text: `Automatic account verification needs attention: ${error instanceof Error ? error.message : String(error)}` });
  });
  panel.onDidDispose(() => { if (connectionsPanel === panel) connectionsPanel = undefined; }, null, context.subscriptions);
  panel.webview.onDidReceiveMessage(async (message) => {
    try {
      if (!message || typeof message !== "object") throw new Error("Invalid Connections Center message.");
      const id = typeof message.id === "string" ? message.id : "";
      switch (message.type) {
        case "refresh-local": await postModel(context, panel, false, "Local readiness refreshed."); return;
        case "verify-live": await postModel(context, panel, true, "Read-only live verification completed."); return;
        case "provider-connect": await connectProvider(context, panel, id); return;
        case "provider-forget-secret": await forgetProviderSecret(context, panel, id); return;
        case "provider-setup": await openProviderSetup(id); return;
        case "mcp-setup": await openMcpSetup(id); return;
        case "mcp-configure": await configureMcp(context, panel, id); return;
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
  lastVerifiedConnections = undefined;
}

module.exports = { activateConnections, deactivateConnections, loadConnections };
