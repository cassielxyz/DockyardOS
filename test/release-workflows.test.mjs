import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const marketplaceWorkflow = await readFile(".github/workflows/vscode-extension.yml", "utf8");
const realHostWorkflow = await readFile(".github/workflows/real-host-matrix.yml", "utf8");
const extensionPackage = JSON.parse(await readFile("integrations/vscode/package.json", "utf8"));

test("VS Code Marketplace metadata includes navigable listing fields", () => {
  assert.equal(extensionPackage.publisher, "cassielxyz");
  assert.equal(extensionPackage.repository?.url, "https://github.com/cassielxyz/DockyardOS.git");
  assert.equal(extensionPackage.repository?.directory, "integrations/vscode");
  assert.equal(extensionPackage.homepage, "https://github.com/cassielxyz/DockyardOS#readme");
  assert.equal(extensionPackage.bugs?.url, "https://github.com/cassielxyz/DockyardOS/issues");
  for (const keyword of ["agents", "orchestration", "checkpoint", "security", "mcp"]) {
    assert.ok(extensionPackage.keywords.includes(keyword), `missing Marketplace keyword ${keyword}`);
  }
});

test("Marketplace publication is manual, tag/version bound, and token gated", () => {
  assert.match(marketplaceWorkflow, /workflow_dispatch:/);
  assert.match(marketplaceWorkflow, /publish_marketplace:/);
  assert.match(marketplaceWorkflow, /release_tag:/);
  assert.match(marketplaceWorkflow, /VSCE_PAT:\s*\$\{\{\s*secrets\.VSCE_PAT\s*\}\}/);
  assert.match(marketplaceWorkflow, /EXPECTED_TAG="v\$\{VERSION\}"/);
  assert.match(marketplaceWorkflow, /git tag --points-at HEAD/);
  assert.match(marketplaceWorkflow, /if:\s*\$\{\{ github\.event_name == 'workflow_dispatch' && inputs\.publish_marketplace == true \}\}/);
  assert.match(marketplaceWorkflow, /vsce publish --packagePath dockyardos-vscode\.vsix/);
});

test("real-host matrix is opt-in only and covers current public CLI surfaces", () => {
  assert.match(realHostWorkflow, /workflow_dispatch:/);
  assert.doesNotMatch(realHostWorkflow, /\n\s*pull_request:/);
  assert.doesNotMatch(realHostWorkflow, /\n\s*push:/);
  const expected = [
    ["gemini-cli", "gemini", "@google/gemini-cli"],
    ["codex", "codex", "@openai/codex"],
    ["claude-code", "claude", "https://claude.ai/install.sh"],
    ["cursor", "agent", "https://cursor.com/install"],
    ["opencode", "opencode", "@opencode/cli"],
  ];
  for (const [host, executable, source] of expected) {
    assert.ok(realHostWorkflow.includes(`host: ${host}`), `missing ${host} matrix entry`);
    assert.ok(realHostWorkflow.includes(`executable: ${executable}`), `missing ${host} executable`);
    assert.ok(realHostWorkflow.includes(source), `missing ${host} install source`);
  }
  assert.match(realHostWorkflow, /npm view "\$DOCKYARD_INSTALL_SOURCE" version/);
  assert.match(realHostWorkflow, /sha256sum "\$INSTALLER"/);
  assert.match(realHostWorkflow, /host doctor --host "\$DOCKYARD_REAL_HOST" --json/);
  assert.match(realHostWorkflow, /host install --host "\$DOCKYARD_REAL_HOST" --scope project --json/);
});
