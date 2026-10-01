import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { renderDashboardHtml } = require("../integrations/vscode/dashboard-view.js");
const { dockyardThemeCss } = require("../integrations/vscode/ui-theme.js");

const packageUrl = new URL("../integrations/vscode/package.json", import.meta.url);
const dashboardControllerUrl = new URL("../integrations/vscode/dashboard-controller.js", import.meta.url);
const extensionMainUrl = new URL("../integrations/vscode/main.js", import.meta.url);
const backgroundUrl = new URL("../integrations/vscode/assets/dockyard-graffiti-bg.svg", import.meta.url);
const activityIconUrl = new URL("../integrations/vscode/assets/dockyard-activity.svg", import.meta.url);

function sampleModel() {
  return {
    workspaceName: "example",
    workspacePath: "/tmp/example",
    trusted: true,
    settings: {
      defaultHost: "antigravity",
      defaultMode: "balanced",
      autoInitializeEnabled: false,
      autoInstallHost: true,
      hostScope: "user",
      openOnStartup: true,
      updatesEnabled: false,
      applySafe: false,
    },
    memoryPath: "~/.dockyardos/projects/example/",
    summary: {
      initialized: true,
      phase: "implementation",
      teamStatus: "active",
      readyConnections: 3,
      latestCheckpoint: "checkpoint-1",
      projectId: "example",
      gitState: "clean",
    },
    agents: [{ name: "Frontend Agent", status: "working", current: true }],
    connections: { providers: 4, providerReady: 3, providerAttention: 1, mcps: 8, noAuthMcps: 1 },
  };
}

test("P38 VS Code package exposes the universal dashboard and Auto Initialize", async () => {
  const pkg = JSON.parse(await readFile(packageUrl, "utf8"));
  assert.ok(pkg.activationEvents.includes("onCommand:dockyardOS.dashboard"));
  assert.ok(pkg.activationEvents.includes("onCommand:dockyardOS.autoInitialize"));
  assert.ok(pkg.activationEvents.includes("onView:dockyardOS.overview"));
  assert.ok(pkg.contributes.commands.some((x) => x.command === "dockyardOS.dashboard"));
  assert.ok(pkg.contributes.commands.some((x) => x.command === "dockyardOS.autoInitialize"));
  assert.equal(pkg.contributes.configuration.properties["dockyardOS.autoInitialize.enabled"].default, false);
  assert.equal(pkg.contributes.configuration.properties["dockyardOS.autoInitialize.installHostIntegration"].default, true);
  assert.equal(pkg.contributes.configuration.properties["dockyardOS.defaultMode"].default, "balanced");
  assert.ok(pkg.contributes.viewsContainers?.activitybar?.some((x) => x.id === "dockyardOS" && x.icon === "assets/dockyard-activity.svg"));
  assert.ok(pkg.contributes.views?.dockyardOS?.some((x) => x.id === "dockyardOS.overview"));
  assert.match(pkg.scripts.check, /dashboard-controller\.js/);
  assert.match(pkg.scripts.check, /dashboard-view\.js/);
  assert.match(pkg.scripts.check, /ui-theme\.js/);
});

test("P38 dashboard renders a nonce CSP, fixed branded visual system, and UI-backed settings", () => {
  const html = renderDashboardHtml({ cspSource: "vscode-webview:" }, sampleModel(), "vscode-resource:/dockyard-graffiti-bg.svg");
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /script-src 'nonce-/);
  assert.match(html, /Auto Initialize/);
  assert.match(html, /Connections Center/);
  assert.match(html, /Persistent project brain/);
  assert.match(html, /data-setting="defaultHost"/);
  assert.match(html, /data-setting="autoInitialize\.enabled"/);
  assert.match(html, /dockyard-graffiti-bg\.svg/);
});

test("P38 dashboard model serialization cannot inject executable HTML", () => {
  const model = sampleModel();
  model.workspaceName = "</script><script>throw new Error('xss')</script>";
  const html = renderDashboardHtml({ cspSource: "vscode-webview:" }, model, "");
  assert.ok(!html.includes("</script><script>throw new Error('xss')</script>"));
});

test("P38 shared theme is fixed-background, responsive, and uses one Dockyard visual vocabulary", () => {
  const css = dockyardThemeCss("vscode-resource:/asset.svg");
  assert.match(css, /background-attachment:fixed/);
  assert.match(css, /dy-shell/);
  assert.match(css, /dy-sidebar/);
  assert.match(css, /dy-panel/);
  assert.match(css, /dy-chip/);
  assert.match(css, /@media/);
});

test("P38 dashboard controller keeps settings and command actions allowlisted", async () => {
  const source = await readFile(dashboardControllerUrl, "utf8");
  assert.match(source, /const SETTING_KEYS = new Map/);
  assert.match(source, /const COMMAND_ACTIONS = new Map/);
  assert.match(source, /shell: false/);
  assert.match(source, /showInformationMessage/);
  assert.match(source, /Auto Initialize/);
  assert.match(source, /--no-host-integration/);
  assert.doesNotMatch(source, /eval\s*\(/);
  assert.doesNotMatch(source, /new Function\s*\(/);
});


test("P38 extension registers a visible DockyardOS Activity Bar home", async () => {
  const source = await readFile(extensionMainUrl, "utf8");
  assert.match(source, /registerTreeDataProvider\("dockyardOS\.overview"/);
  await access(activityIconUrl);
  const svg = await readFile(activityIconUrl, "utf8");
  assert.match(svg, /<svg/);
  assert.match(svg, /currentColor/);
});

test("P38 graffiti background asset is packaged as repository-owned SVG", async () => {
  await access(backgroundUrl);
  const svg = await readFile(backgroundUrl, "utf8");
  assert.match(svg, /DockyardOS graffiti background/);
  assert.match(svg, /DOCKYARD/);
  assert.ok(svg.length < 32 * 1024, "background should stay lightweight for a universal VSIX");
});
