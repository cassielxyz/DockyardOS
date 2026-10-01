# DockyardOS for VS Code

The DockyardOS VS Code extension is the normal user control surface over one shared DockyardOS runtime/state model. Install the extension once; initialize each project once.

## Install for normal users

The guarded Marketplace publication has not happened yet, so the current normal-user install is the verified VSIX artifact:

1. Open the repository's **Actions** page.
2. Open a successful **VS Code Extension** workflow run for the version you want.
3. Download the `dockyardos-vscode-<version>` artifact and extract the `.vsix` if GitHub downloaded a ZIP.
4. In VS Code open **Extensions → ... → Install from VSIX...**.
5. Select the DockyardOS `.vsix` and reload VS Code.
6. Open your project folder.
7. Run `DockyardOS: Initialize Project` and choose `balanced` unless you intentionally need another policy mode.
8. Run `DockyardOS: Connections` to inspect provider/MCP setup.
9. Run `DockyardOS: Install/Update Agent Host Integration`; for Google Antigravity, `user` scope is normally the easiest one-time setup.
10. Run `DockyardOS: Run Doctor` and `DockyardOS: Check Agent Host`.
11. Give your task to the coding agent normally. DockyardOS handles project restoration, bounded capability selection, workflow/team state, verification and checkpoints.

After the first guarded Marketplace publication, users can install **DockyardOS** by publisher `cassielxyz` directly from the VS Code Extensions view and then continue from step 6.

## What the VSIX contains

Release packaging stages a built DockyardOS Core inside the extension under `core/`. By default the extension runs that bundled Core through the VS Code Node runtime, so a separate global `dockyard` install is not required.

The bundled Core includes:

- DockyardOS CLI/runtime
- local `dockyard-mcp` runtime and production dependencies
- portable/native host integration assets
- capability and community package registry metadata
- creative UI routing metadata such as Inspo MCP, Taste Skill, and Awesome Design Skills
- trusted publisher-key registry

For development or when intentionally using a newer external CLI, set `dockyardOS.cliPath` to an executable path. If left blank, the bundled Core is preferred.

## Commands

Open the Command Palette and use:

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

The status bar shows whether the project is uninitialized, ready, or currently in a DockyardOS team phase. In an untrusted workspace it stays locked and DockyardOS does not run project commands automatically.

## Connections Center

`DockyardOS: Connections` is a local extension webview over the existing DockyardOS provider-readiness and MCP connection model. It is **not a credential store**.

The first view uses local-only readiness checks. It can show whether known provider CLIs/config/link markers are present without making remote account calls. Press **Verify connections** only when you want DockyardOS to run the existing bounded read-only identity/status probes.

Provider account actions follow these rules:

- only provider IDs registered by the extension are accepted;
- the webview cannot supply a URL or shell command;
- setup pages come from fixed HTTPS definitions in the extension;
- supported login actions open the provider's own CLI login flow in a visible terminal only after a modal confirmation;
- provider passwords, OAuth tokens, API keys and secret values are not captured or written into DockyardOS project/checkpoint state;
- a missing provider CLI shows setup guidance instead of pretending a login can run;
- live authentication/readiness never grants permission for a deployment, database mutation, DNS change, Git write, production action, or destructive action.

MCP connector cards cover useful project systems such as GitHub, Vercel, Supabase, Neon, Cloudflare, Figma, Linear, Notion, Atlassian, MongoDB, Hugging Face, Sentry and Inspo.

MCP status is deliberately conservative: setup metadata is not called “connected.” P36 connection truth is host-session scoped, so the active coding-agent host must successfully use/attest the MCP before DockyardOS can treat the current host session as connected.

### Inspo MCP

Inspo is registered as a low-risk, read-only design-reference MCP:

```text
https://inspomcp.dev/mcp
```

It currently requires no account login. The Connections Center can copy the endpoint, open the official setup page, or—after confirmation—open a terminal with the official installer:

```bash
npx -y inspo-mcp install
```

“No login required” means the service has no account-auth step; it does **not** mean DockyardOS fabricates a connected state before the host verifies actual MCP use.

## Creative UI routing

DockyardOS Core now has a dedicated `creative-web-ui` recipe. Natural-language requests that ask for real design inspiration, premium/creative interfaces, or explicitly reject a generic AI-generated look can add signals such as:

- `design-inspiration`
- `visual-reference`
- `macrostructure`
- `anti-slop`
- `design-taste`
- `visual-direction`

The recipe prefers a bounded combination of:

- Inspo MCP for real interface references and design-system context
- Taste Skill for anti-slop frontend/design direction
- Awesome Design Skills for design-style/system discovery
- UI UX Pro Max
- Vercel Web Design Guidelines
- shadcn/ui
- Playwright MCP / Playwright
- independent browser QA, accessibility and performance review

The workflow is reference synthesis, not site cloning. Third-party skill selection remains subject to DockyardOS trust/readiness/fulfillment rules.

## Community Hub

`Open Community Hub` is a local VS Code webview over the existing DockyardOS community registry and installed-package state. It does not create a second registry, does not fetch package code directly from the webview, and does not bypass the CLI trust boundary.

The Hub provides:

- full-text package search across package ID, source, capabilities, permissions, trust, risk, origin, channel, and update state,
- trust, risk, bundled/remote origin, and update-state filters,
- installed revision/version visibility,
- discovery-source browsing without turning discovery metadata into install buttons,
- explicit remote-registry verification/expiry metadata,
- registry conflict visibility instead of silently selecting a colliding package,
- manifest inspection and quarantine assessment inside the Hub,
- install/update actions that still require the immutable assessed Git revision and content SHA-256.

The activation flow remains:

```text
select explicit package manifest
        ↓
review manifest OR resolve/assess
        ↓
GitHub ref → immutable commit in quarantine
        ↓
static scan / entrypoint / permissions / signature policy
        ↓
automatic | approval-required | quarantine
        ↓
install only with the assessed revision + content digest
```

For `approval-required`, VS Code shows the policy reasons in a modal before it passes `--approve`. `quarantine` cannot be overridden from the Hub. Webview messages are limited to explicit package actions, and package IDs are revalidated by the extension before any CLI call.

The Hub and Connections Center both use restrictive Content Security Policy headers with nonce-bound scripts/styles. Data strings are escaped and rendered through DOM text nodes instead of becoming arbitrary HTML.

## Scheduled safe community updates

Scheduled community update checks are optional and **disabled by default**. Enabling the scheduler does not grant approval to any package and does not change publisher or registry trust.

The VS Code settings are:

- `dockyardOS.communityUpdates.enabled` — enable recurring checks; default `false`.
- `dockyardOS.communityUpdates.intervalMinutes` — check cadence; default 360 minutes, bounded to 60 minutes through 7 days.
- `dockyardOS.communityUpdates.applySafeAutomatically` — separately opt in to unattended activation of only updates that still qualify for the existing `apply-safe` path; default `false`.
- `dockyardOS.communityUpdates.notifyWhenNoUpdates` — optionally show a notification when everything is already current; default `false`.

With only `enabled` turned on, the extension runs the equivalent of:

```bash
dockyard community updates check --json
```

If `applySafeAutomatically` is also explicitly enabled, the background scheduler may run only:

```bash
dockyard community updates apply-safe --json
```

The scheduler never invokes `community install`, never passes `--approve`, and cannot turn an approval-required or quarantined candidate into an unattended update. Permission expansion, trust downgrade, risk increase, invalid signatures, registry ambiguity, missing manifests, and quarantine findings remain review/blocking states.

Additional scheduler safeguards:

- no scheduled checks run in untrusted workspaces;
- only one scheduled update cycle may run at a time;
- the last attempt is stored per workspace so restarts do not create a rapid retry loop;
- failed cycles are rescheduled at the bounded cadence rather than silently disabling future checks;
- review-required/skipped/error results remain visible instead of being reported as successful updates;
- notifications can open the Community Hub for inspection.

## Project separation

The extension does not create its own memory database. Every project uses the same DockyardOS external state layout as the CLI:

```text
~/.dockyardos/projects/<project-id>/
```

Community capability state is also external:

```text
~/.dockyardos/community/
```

Opening a different repository resolves a different DockyardOS project ID. Switching between Antigravity, Gemini CLI, Codex, Claude Code, Cursor, OpenCode, and VS Code does not create separate copies of the project checkpoint/team state.

## Agent host integration

`Install/Update Agent Host Integration` first shows the DockyardOS install plan and then asks before modifying the selected host integration location. Existing different `dockyardos` integration content is not overwritten silently.

User scope is preferred when the host supports it because it installs once across projects. Project scope is available when you intentionally want host integration files in a repository. Antigravity project scope installs the full DockyardOS workspace plugin at `.agents/plugins/dockyardos`; portable-skill hosts use their verified `.agents/skills` or host-specific skill location. Project-scope writes are confined to non-symlinked paths inside the current workspace.

## Build a VSIX locally

From the repository root with Node.js 20+:

```bash
npm ci
npm test
cd integrations/vscode
npm ci
npm run package
```

The packaging step copies the already-built DockyardOS runtime, registry metadata, portable/native integration assets, and production MCP dependencies into the VSIX staging directory before invoking `vsce`.

## Marketplace release channel

`.github/workflows/vscode-extension.yml` is the guarded release workflow. Ordinary pull requests do not publish anything. Tag pushes and manual runs can package a VSIX, but **Marketplace publication happens only on an explicit manual dispatch** with all of these conditions satisfied:

1. `publish_marketplace=true` is selected manually.
2. `release_tag` is supplied and exactly equals `v<integrations/vscode/package.json version>`.
3. The checked-out commit is actually pointed to by that exact tag.
4. The repository has a `VSCE_PAT` Actions secret for the `cassielxyz` Marketplace publisher.
5. The full DockyardOS tests and VSIX manifest/package checks pass before `vsce publish` runs.

For the current `0.1.0` extension version, publication therefore requires an existing `v0.1.0` tag on the intended release commit plus the configured publisher token. DockyardOS intentionally does not create tags or silently publish from a normal push.

The workflow uploads the validated VSIX as a GitHub Actions artifact before the optional Marketplace mutation, so the exact package can be inspected independently.

## Opt-in real-host CI

`.github/workflows/real-host-matrix.yml` remains opt-in because it downloads current third-party host CLIs. It can be started either with a manual `workflow_dispatch` or by a maintainer creating/pushing a branch matching:

```text
verify/real-host/**
```

Normal pull requests, `main` pushes, and ordinary work branches do **not** start the expensive matrix.

The matrix currently covers:

- Antigravity CLI (`agy`)
- Gemini CLI (`gemini`)
- OpenAI Codex CLI (`codex`)
- Claude Code (`claude`)
- Cursor CLI (`agent`)
- OpenCode (`opencode`)

Real Host Matrix run `#13` (`36425594147`) completed successfully on exact merged `main` SHA `854434f26e6c084dba6d6e532ff689db60ced77f`. The six artifact IDs and GitHub-reported SHA-256 digests are preserved in [`docs/REAL_HOST_MATRIX_EVIDENCE_2026-09-28.md`](../../docs/REAL_HOST_MATRIX_EVIDENCE_2026-09-28.md).

## Verify

Normal CI plus the focused Connections/creative-UI lane verify:

1. the root DockyardOS build and test suite,
2. capability registry structural validity and creative UI selection,
3. Connections Center local/live state normalization without false connected states,
4. allowlisted provider/MCP setup metadata and HTTPS destinations,
5. Connections Center nonce CSP and model-string escaping,
6. extension JavaScript syntax,
7. bundled Core staging,
8. actual VSIX packaging,
9. inclusion of `main.js`, Connections Center files, creative catalog/recipe code, Core and MCP runtime inside the produced VSIX,
10. existing community, security, provider, host, release, and checkpoint regression suites.

After installing the VSIX, open a project and run `DockyardOS: Initialize Project`, `DockyardOS: Connections`, then `DockyardOS: Run Doctor`. Close/reopen VS Code and use `DockyardOS: Project Status` or `Resume Context` to confirm persistent state recovery.
