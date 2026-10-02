const os = require("node:os");
const path = require("node:path");

const SAFE_TOKEN = /^[A-Za-z0-9@._:/=+,-]+$/;
const MAX_CONFIG_BYTES = 1024 * 1024;

function platformExecutable(command, platform = process.platform) {
  if (platform === "win32" && (command === "npm" || command === "npx")) return `${command}.cmd`;
  return command;
}

function terminalLine(spec) {
  const tokens = [spec.command, ...(spec.args || [])];
  for (const token of tokens) {
    if (typeof token !== "string" || !SAFE_TOKEN.test(token)) {
      throw new Error("DockyardOS refused an unsafe connection command token.");
    }
  }
  return tokens.join(" ");
}

function providerConnectPlan(definition, provider, platform = process.platform) {
  if (!definition) return { kind: "unsupported", commands: [] };
  if (definition.setupOnly) return { kind: "docs", commands: [], setupUrl: definition.setupUrl || null };

  const installed = provider?.installed === true;
  if (installed && definition.login) {
    return { kind: "login", commands: [definition.login], setupUrl: definition.setupUrl || null };
  }
  if (definition.fallbackLogin) {
    return { kind: "login", commands: [definition.fallbackLogin], setupUrl: definition.setupUrl || null, ephemeral: true };
  }
  const installer = definition.installers?.[platform];
  if (installer && definition.login) {
    return { kind: "install-login", commands: [installer, definition.login], setupUrl: definition.setupUrl || null };
  }
  if (definition.login) {
    return { kind: "docs", commands: [], setupUrl: definition.setupUrl || null };
  }
  return { kind: "docs", commands: [], setupUrl: definition.setupUrl || null };
}

function mcpSetupPlan(host, definition, options = {}) {
  if (!definition?.endpoint) return { kind: "docs", setupUrl: definition?.setupUrl || null };
  const name = definition.serverName || definition.id;
  const endpoint = definition.endpoint;
  const home = options.home || os.homedir();

  if (host === "antigravity") {
    const configRoot = options.antigravityConfigRoot || process.env.DOCKYARD_ANTIGRAVITY_CONFIG_ROOT || path.join(home, ".gemini", "config");
    return {
      kind: "json-file",
      host,
      path: path.join(configRoot, "mcp_config.json"),
      rootKey: "mcpServers",
      name,
      entry: { serverUrl: endpoint },
    };
  }
  if (host === "cursor") {
    return {
      kind: "json-file",
      host,
      path: path.join(home, ".cursor", "mcp.json"),
      rootKey: "mcpServers",
      name,
      entry: { url: endpoint },
    };
  }
  if (host === "gemini-cli") {
    return { kind: "command", host, command: "gemini", args: ["mcp", "add", name, endpoint, "--transport", "http", "--scope", "user"] };
  }
  if (host === "codex") {
    return { kind: "command", host, command: "codex", args: ["mcp", "add", name, "--url", endpoint] };
  }
  if (host === "claude-code") {
    return { kind: "command", host, command: "claude", args: ["mcp", "add", "--transport", "http", "--scope", "user", name, endpoint] };
  }
  if (host === "opencode") {
    return { kind: "command", host, command: "opencode", args: ["mcp", "add", name, "--global", "--url", endpoint] };
  }
  return { kind: "docs", host, setupUrl: definition.setupUrl || null };
}

function mergeJsonMcpConfig(raw, plan) {
  if (plan.kind !== "json-file") throw new Error("MCP config merge requires a json-file plan.");
  if (Buffer.byteLength(raw || "", "utf8") > MAX_CONFIG_BYTES) throw new Error("Existing MCP configuration is too large for safe automatic merge.");
  let parsed = {};
  if ((raw || "").trim()) {
    parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Existing MCP configuration must be a JSON object.");
  }
  const existingMap = parsed[plan.rootKey];
  if (existingMap !== undefined && (!existingMap || typeof existingMap !== "object" || Array.isArray(existingMap))) {
    throw new Error(`Existing ${plan.rootKey} must be a JSON object.`);
  }
  return {
    ...parsed,
    [plan.rootKey]: {
      ...(existingMap || {}),
      [plan.name]: plan.entry,
    },
  };
}

module.exports = {
  MAX_CONFIG_BYTES,
  mcpSetupPlan,
  mergeJsonMcpConfig,
  platformExecutable,
  providerConnectPlan,
  terminalLine,
};
