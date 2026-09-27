const fs = require("node:fs");
const path = require("node:path");

const extensionRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(extensionRoot, "../..");
const coreRoot = path.join(extensionRoot, "core");
const distSource = path.join(repoRoot, "dist");

if (!fs.existsSync(path.join(distSource, "main.js"))) {
  throw new Error("DockyardOS dist/main.js is missing. Run `npm run build` at the repository root before packaging the VS Code extension.");
}

fs.rmSync(coreRoot, { recursive: true, force: true });
fs.mkdirSync(coreRoot, { recursive: true });
fs.cpSync(distSource, path.join(coreRoot, "dist"), { recursive: true });
fs.mkdirSync(path.join(coreRoot, "integrations"), { recursive: true });
fs.cpSync(path.join(repoRoot, "integrations", "portable"), path.join(coreRoot, "integrations", "portable"), { recursive: true });
fs.cpSync(path.join(repoRoot, "integrations", "antigravity", "plugin"), path.join(coreRoot, "integrations", "antigravity", "plugin"), { recursive: true });

console.log(`Prepared bundled DockyardOS Core at ${coreRoot}`);
