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
4. bootstrap every materializable skill into Dockyard's PC-wide user library, reusing already-active immutable revisions;
5. keep approval-required or quarantined packages staged but inactive;
6. run Dockyard Doctor;
7. refresh the Control Center with the resulting project state.

The global skill library is **not** dumped into every model prompt. When a project request arrives, Dockyard selects the current task/phase capabilities and automatically loads only the selected integrity-verified skill entrypoints into the agent invocation, with bounded context limits.

Automatic initialization on project open is separately opt-in through `dockyardOS.autoInitialize.enabled` and remains disabled by default.


For **Antigravity**, Auto Initialize does not require the optional `agy` launcher to exist on PATH. If the verified CLI plugin install route is unavailable, DockyardOS falls back to Antigravity's IDE-global plugin directory and reports that method in the resulting host state. A missing `agy` executable is therefore a host-readiness warning, not a reason to lose project initialization.

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

- every provider card has a primary **Connect / Reconnect / Configure** action instead of making users infer the next step from CLI state;
- only extension-owned provider IDs are accepted;
- the webview cannot submit a shell command or arbitrary URL;
- supported browser/device logins run through fixed allowlisted provider commands in a visible terminal;
- Vercel, Cloudflare, Supabase, Neon, Firebase, Appwrite and Railway can use a bounded `npx` launcher when their global CLI is absent;
- Dockyard automatically polls the provider's existing read-only live probe after login and only shows a verified account state when that probe succeeds;
- provider-managed/self-hosted cases open the official setup surface instead of inventing credentials or OAuth behavior;
- passwords, OAuth tokens, API keys and MCP credentials are not written into Dockyard project/checkpoint state;
- installed/configured MCP metadata is not called connected;
- host-session evidence remains the authority for current-session MCP connectivity;
- connection readiness never grants deployment, database, DNS, Git, destructive or production approval.

Useful cards include GitHub, Vercel, Supabase, Cloudflare, Neon, Firebase, Figma, Linear, Notion, Atlassian, MongoDB, Hugging Face, Sentry and Inspo.

### Inspo MCP

Inspo is a read-only/no-login design-reference MCP:

```text
https://inspomcp.dev/api/mcp
```

The Connections Center configures this hosted endpoint **directly for the selected Dockyard host**. Dockyard does not invoke `inspo-mcp install`, so Windows shell quoting in that third-party installer cannot corrupt the VS Code setup path.

“No login required” does not mean “already connected”. The active host still needs to load/use the server before current-session connection truth is established.

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


## Finding DockyardOS after installing a VSIX

A GitHub prerelease installed from a VSIX is a **local installed extension**, not a Marketplace listing.

- Use the **DockyardOS icon in the Activity Bar** to open the extension's quick actions.
- In the Extensions view, search with `@installed DockyardOS` to find the locally installed package.
- A normal Marketplace search will not show DockyardOS until the guarded Marketplace publication is completed.

This distinction is expected VS Code behavior; the extension does not self-register into Marketplace search.

## Install for normal users

### GitHub prerelease

DockyardOS **v0.1.1 Preview 2** is available from GitHub Releases:

[Download DockyardOS v0.1.1 Preview 2](https://github.com/cassielxyz/DockyardOS/releases/tag/v0.1.1-preview.2)

1. Download `dockyardos-vscode.vsix`.
2. Optionally verify it with the attached `dockyardos-vscode.vsix.sha256`.
3. In VS Code use **Extensions → ... → Install from VSIX...**.
4. Select the VSIX and reload.
5. Open a trusted project and use the DockyardOS Control Center.
6. Click **Auto Initialize** for one-click project/host setup.

Preview 2 is the source-development edition. It fixes Auto Initialize when `agy` is unavailable, adds the Antigravity IDE-global fallback, and adds the DockyardOS Activity Bar home. It does not pretend the stable public gate is configured.

### Stable official-public release

The guarded `.github/workflows/vscode-extension.yml` workflow remains the versioned stable packaging path. It tests Dockyard Core, stamps the required official-public release gate, packages the VSIX, asserts that the universal dashboard/theme/background and bundled Core are inside the package, and uploads the VSIX artifact before any optional Marketplace publication.

Stable `v0.1.1` still requires a real `DOCKYARD_PUBLIC_CONTROL_URL` plus the existing Marketplace publisher/token/tag gates. Those requirements are deliberately not bypassed.

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
