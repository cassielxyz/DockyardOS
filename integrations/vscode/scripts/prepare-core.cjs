const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const extensionRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(extensionRoot, "../..");
const coreRoot = path.join(extensionRoot, "core");
const distSource = path.join(repoRoot, "dist");

if (!fs.existsSync(path.join(distSource, "main.js"))) {
  throw new Error("DockyardOS dist/main.js is missing. Run `npm run build` at the repository root before packaging the VS Code extension.");
}
if (!fs.existsSync(path.join(distSource, "mcp-server.js"))) {
  throw new Error("DockyardOS dist/mcp-server.js is missing. Run the current DockyardOS build before packaging the VS Code extension.");
}

fs.rmSync(coreRoot, { recursive: true, force: true });
fs.mkdirSync(coreRoot, { recursive: true });
fs.cpSync(distSource, path.join(coreRoot, "dist"), { recursive: true });
fs.cpSync(path.join(repoRoot, "registry"), path.join(coreRoot, "registry"), { recursive: true });
fs.mkdirSync(path.join(coreRoot, "integrations"), { recursive: true });
fs.cpSync(path.join(repoRoot, "integrations", "portable"), path.join(coreRoot, "integrations", "portable"), { recursive: true });
fs.cpSync(path.join(repoRoot, "integrations", "antigravity", "plugin"), path.join(coreRoot, "integrations", "antigravity", "plugin"), { recursive: true });
const nativeSource = path.join(repoRoot, "integrations", "native");
if (fs.existsSync(nativeSource)) fs.cpSync(nativeSource, path.join(coreRoot, "integrations", "native"), { recursive: true });

const rootPackage = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
const corePackage = {
  name: "dockyardos-bundled-core",
  version: rootPackage.version,
  private: true,
  type: "module",
  dependencies: rootPackage.dependencies || {},
};
fs.writeFileSync(path.join(coreRoot, "package.json"), `${JSON.stringify(corePackage, null, 2)}\n`);

if (Object.keys(corePackage.dependencies).length) {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  execFileSync(npm, ["install", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"], {
    cwd: coreRoot,
    stdio: "inherit",
    windowsHide: true,
  });
}

console.log(`Prepared bundled DockyardOS Core with local MCP runtime and community registry at ${coreRoot}`);
