# DockyardOS for VS Code

The DockyardOS VS Code extension is the normal user-facing control surface for DockyardOS. The VSIX bundles DockyardOS Core, so normal users do not need a separate global CLI install.

## Universal Control Center

When a trusted project opens, DockyardOS can open a full control center instead of expecting the user to remember commands.

The UI contains:

- Dashboard
- Project
- Agents
- Skills
- Connections
- Memory
- Workflows
- Security
- Community
- Settings

The dashboard, Connections Center and Community Hub share the same dark graffiti-inspired Dockyard visual system, glass panels, cards, status chips, spacing and action patterns.

The production UI uses a repository-owned lightweight SVG background under `assets/dockyard-graffiti-bg.svg`, so the VSIX does not depend on a remote image or third-party asset host.

## Auto Initialize

The main dashboard exposes **Auto Initialize** as a one-click onboarding path.

After confirmation it can:

1. detect whether Dockyard state already exists for the workspace;
2. initialize the project using the configured default mode;
3. plan and install/update the configured default agent-host integration;
4. use the configured user/project host scope;
5. run Dockyard Doctor;
6. refresh the Control Center with the resulting project state.

Automatic initialization on project open is separately opt-in through `dockyardOS.autoInitialize.enabled` and remains disabled by default.

The Control Center itself opens on trusted-workspace startup by default. Users can disable that behavior in the Settings page or through `dockyardOS.dashboard.openOnStartup`.

## Settings UI

The Dockyard Settings page currently exposes the most useful user preferences directly in the Control Center:

- default agent host;
- default Safe / Balanced / Autonomous mode;
- automatic workspace initialization;
- host installation during Auto Initialize;
- user/project integration scope;
- Control Center startup behavior;
- scheduled community update checks;
- unattended application of only updates that remain eligible for the existing `apply-safe` path.

Settings messages are allowlisted in the extension controller. The webview cannot invent a setting key or arbitrary command.

## Connections Center

Connections is the provider/MCP setup and readiness UI. It is not a credential vault.

The first view uses local-only provider checks. **Verify connections** explicitly runs the existing bounded read-only identity/status probes.

Provider account actions follow these rules:

- only extension-owned provider IDs are accepted;
- the webview cannot submit a shell command or arbitrary URL;
- setup links are fixed HTTPS definitions;
- supported logins run the provider's own CLI in a visible terminal after confirmation;
- passwords, OAuth tokens, API keys and MCP credentials are not written into Dockyard project/checkpoint state;
- installed/configured MCP metadata is not called connected;
- host-session evidence remains the authority for current-session MCP connectivity;
- connection readiness never grants deployment, database, DNS, Git, destructive or production approval.

Useful cards include GitHub, Vercel, Supabase, Cloudflare, Neon, Firebase, Figma, Linear, Notion, Atlassian, MongoDB, Hugging Face, Sentry and Inspo.

### Inspo MCP

Inspo is a read-only/no-login design-reference MCP:

```text
https://inspomcp.dev/mcp
```

The Connections Center can copy the endpoint, open the official setup page, or open the official installer in a visible terminal after confirmation:

```bash
npx -y inspo-mcp install
```

“No login required” does not mean “already connected”. The active host still needs to verify actual MCP use for current-session connection truth.

## Creative UI workflow

Dockyard Core includes the `creative-web-ui` recipe for requests such as:

- make this premium;
- use real website inspiration;
- improve UI/UX creatively;
- avoid the generic AI-generated website look.

The bounded creative stack can include:

- Inspo MCP
- Taste Skill
- Awesome Design Skills
- UI UX Pro Max
- Vercel Web Design Guidelines
- shadcn/ui
- Playwright / Playwright MCP
- browser QA
- accessibility review
- performance review

Reference material is used for original synthesis, not site cloning.

## Community Hub

The Community Hub shares the Dockyard Control Center theme but preserves the existing trust boundary.

It supports:

- full-text capability search;
- trust/risk/origin/update filters;
- immutable installed revision visibility;
- remote-registry provenance;
- conflict visibility;
- package inspection and quarantine assessment;
- explicit approval for approval-required packages;
- no UI override for quarantine;
- scheduled safe-update visibility;
- separately disclosed partner offers that do not affect technical ranking.

Discovery is still different from execution. A discovery source never becomes trusted code merely because it appears in the UI.

## Install for normal users

### GitHub prerelease

DockyardOS **v0.1.0 Preview 1** is available from GitHub Releases:

[Download DockyardOS v0.1.0 Preview 1](https://github.com/cassielxyz/DockyardOS/releases/tag/v0.1.0-preview.1)

1. Download `dockyardos-vscode.vsix`.
2. Optionally verify it with the attached `dockyardos-vscode.vsix.sha256`.
3. In VS Code use **Extensions → ... → Install from VSIX...**.
4. Select the VSIX and reload.
5. Open a trusted project and use the DockyardOS Control Center.
6. Click **Auto Initialize** for one-click project/host setup.

Preview 1 is the source-development edition and does not pretend the stable public gate is configured.

### Stable official-public release

The guarded `.github/workflows/vscode-extension.yml` workflow remains the versioned stable packaging path. It tests Dockyard Core, stamps the required official-public release gate, packages the VSIX, asserts that the universal dashboard/theme/background and bundled Core are inside the package, and uploads the VSIX artifact before any optional Marketplace publication.

Stable `v0.1.0` still requires a real `DOCKYARD_PUBLIC_CONTROL_URL` plus the existing Marketplace publisher/token/tag gates. Those requirements are deliberately not bypassed.

## Build locally

From the repository root with Node.js 20+:

```bash
npm install --ignore-scripts
npm test

cd integrations/vscode
npm install --ignore-scripts
npm run package
```

The package includes the Dockyard Core fallback, dashboard controller/view, shared theme, Connections Center, Community Hub and branded background asset.

## Commands

The UI is the preferred path, but commands remain available for automation and troubleshooting:

- `DockyardOS: Open Control Center`
- `DockyardOS: Auto Initialize Project`
- `DockyardOS: Initialize Project`
- `DockyardOS: Run Doctor`
- `DockyardOS: Project Status`
- `DockyardOS: Resume Context`
- `DockyardOS: Start Project Team`
- `DockyardOS: Team Status`
- `DockyardOS: Check Agent Host`
- `DockyardOS: Install/Update Agent Host Integration`
- `DockyardOS: Connections`
- `DockyardOS: Open Community Hub`
- `DockyardOS: Community Package Status`
- `DockyardOS: Check Community Updates Now`

## Project separation

The extension does not create a second memory database. It uses the same DockyardOS external state as the CLI and agent hosts:

```text
~/.dockyardos/projects/<project-id>/
```

Community capability state remains under:

```text
~/.dockyardos/community/
```

Switching between Antigravity, Gemini CLI, Codex, Claude Code, Cursor, OpenCode and VS Code therefore does not create separate Dockyard project brains.

## Host integration

The selected host still keeps its real capabilities and limitations.

Antigravity has the richest current integration. Other hosts use their supported portable/native mechanisms such as skill directories, instruction files and local MCP configuration.

Dockyard does not claim that every host exposes identical hooks or native conversation-resume behavior.

## Security notes

- Webviews use nonce-bound Content Security Policy.
- Dashboard actions and settings are allowlisted.
- Spawned Dockyard Core commands use `shell: false`.
- Connections setup URLs/commands come from extension-owned definitions.
- Provider credentials are not stored in project checkpoints.
- Auto Initialize requires workspace trust; automatic initialization is opt-in.
- Community quarantine cannot be bypassed from the UI.
- Provider connection readiness never grants mutation approval.

## Verify the VSIX

The focused **P38 Universal Control Center** workflow verifies:

1. Dockyard Core builds;
2. P37 Connections/creative-UI regressions still pass;
3. dashboard CSP and safe model serialization;
4. dashboard command/settings allowlists;
5. shared fixed-background visual system;
6. lightweight repository-owned graffiti background;
7. extension JavaScript syntax;
8. actual VSIX packaging;
9. packaged `dashboard-controller.js`, `dashboard-view.js`, `ui-theme.js`, branded background, Connections, Community and bundled Core;
10. an uploaded prebuilt preview VSIX artifact.
