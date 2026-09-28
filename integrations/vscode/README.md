# DockyardOS for VS Code

The DockyardOS VS Code extension is a thin control surface over one shared DockyardOS runtime/state model. Install the extension once; initialize each project once.

## What the VSIX contains

Release packaging stages a built DockyardOS Core inside the extension under `core/`. By default the extension runs that bundled Core through the VS Code Node runtime, so a separate global `dockyard` install is not required.

The bundled Core includes:

- DockyardOS CLI/runtime
- local `dockyard-mcp` runtime and production dependencies
- portable/native host integration assets
- community package registry metadata
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
- `DockyardOS: Open Community Hub`
- `DockyardOS: Community Package Status`
- `DockyardOS: Check Community Updates Now`

The status bar shows whether the project is uninitialized, ready, or currently in a DockyardOS team phase. In an untrusted workspace it stays locked and DockyardOS does not run project commands automatically.

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

For `approval-required`, VS Code shows the policy reasons in a modal before it passes `--approve`. `quarantine` cannot be overridden from the Hub. Webview messages are limited to `refresh` plus the explicit `inspect`, `assess`, and `install` package actions, and package IDs are revalidated by the extension before any CLI call.

The Hub uses a restrictive Content Security Policy with nonce-bound local scripts/styles. Registry strings are serialized with script-breaking characters escaped and rendered through DOM text nodes instead of HTML injection.

Installed package versions remain under DockyardOS external state and can also be inspected through `Community Package Status`. Rollback stays exposed by the CLI so the exact target revision remains explicit.

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

It reports automatic-safe candidates separately from packages that require approval, are quarantined, are unavailable/ambiguous, or returned errors. `DockyardOS: Check Community Updates Now` performs the same check manually and never auto-applies, even when scheduled safe apply is enabled.

If `applySafeAutomatically` is also explicitly enabled, the background scheduler may run only:

```bash
dockyard community updates apply-safe --json
```

That command performs a fresh pinned assessment and calls the package activation boundary with `approve: false`. The scheduler never invokes `community install`, never passes `--approve`, and cannot turn an approval-required or quarantined candidate into an unattended update. Permission expansion, trust downgrade, risk increase, invalid signatures, registry ambiguity, missing manifests, and quarantine findings remain review/blocking states.

Additional scheduler safeguards:

- no scheduled checks run in untrusted workspaces;
- only one scheduled update cycle may run at a time;
- the last attempt is stored per workspace so restarts do not create a rapid retry loop;
- failed cycles are rescheduled at the bounded cadence rather than silently disabling future checks;
- review-required/skipped/error results remain visible instead of being reported as successful updates;
- notifications can open the Community Hub for inspection.

The extension activates at VS Code startup so an explicitly enabled schedule can run, but when scheduling is disabled it does not run DockyardOS project commands just because VS Code started.

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

From the repository root:

```bash
npm install
npm run build
cd integrations/vscode
npm install
npm run package
```

The packaging step copies the already-built DockyardOS runtime, registry metadata, portable/native integration assets, and production MCP dependencies into the VSIX staging directory before invoking `vsce`.

## Marketplace release channel

`.github/workflows/vscode-extension.yml` is the release workflow. Ordinary pull requests do not publish anything. Tag pushes and manual runs can package a VSIX, but **Marketplace publication happens only on an explicit manual dispatch** with all of these conditions satisfied:

1. `publish_marketplace=true` is selected manually.
2. `release_tag` is supplied and exactly equals `v<integrations/vscode/package.json version>`.
3. The checked-out commit is actually pointed to by that exact tag.
4. The repository has a `VSCE_PAT` Actions secret for the `cassielxyz` Marketplace publisher.
5. The full DockyardOS tests and VSIX manifest/package checks pass before `vsce publish` runs.

For the current `0.1.0` extension version, the first publish therefore requires an existing `v0.1.0` tag on the intended release commit plus the configured publisher token. DockyardOS intentionally does not create tags or silently publish from a normal push.

The workflow always uploads the validated VSIX as a GitHub Actions artifact before the optional Marketplace mutation, so the exact package can be inspected independently.

## Opt-in real-host CI

`.github/workflows/real-host-matrix.yml` remains opt-in because it downloads current third-party host CLIs. It can be started either with a manual `workflow_dispatch` or by a maintainer creating/pushing a branch matching:

```text
verify/real-host/**
```

Normal pull requests, `main` pushes, and ordinary work branches do **not** start the expensive matrix. The verification-branch trigger exists so authenticated repository automation can request the same full matrix without weakening the opt-in boundary.

The matrix currently covers:

- Antigravity CLI (`agy`)
- Gemini CLI (`gemini`)
- OpenAI Codex CLI (`codex`)
- Claude Code (`claude`)
- Cursor CLI (`agent`)
- OpenCode (`opencode`)

For npm-distributed hosts, the workflow resolves the current registry version first and records that exact version before installation. For official installer-script hosts, it downloads the installer over HTTPS, records its SHA-256, and only then executes it. Each job records the executable path and reported version, then verifies DockyardOS `host inspect`, `host doctor`, and project-scope integration against that actually installed CLI. It does not send prompts to a model or require model/API credentials.

Antigravity uses the verified official noninteractive installer surface, confirms `agy --version`, installs the full project workspace plugin through DockyardOS, and separately runs `agy plugin list` against a fixture workspace to prove native plugin discovery without invoking a model.

## Verify

Normal CI verifies:

1. the root DockyardOS test suite,
2. community registry and publisher-key JSON,
3. extension JavaScript syntax,
4. bundled Core staging,
5. bundled Core CLI/community execution,
6. actual VSIX packaging,
7. required Core/community/MCP files inside the produced VSIX,
8. cross-host install/doctor smoke tests using DockyardOS fixtures,
9. Marketplace workflow guardrails and listing metadata,
10. the opt-in real-host matrix definition, restricted verification-branch trigger, and supported install surfaces,
11. Community Hub CSP/serialization/state normalization and pinned-install guardrails,
12. scheduled-update opt-in defaults, cadence bounds, workspace-trust guard, no-approval safe-apply boundary, and scheduler file inclusion in the VSIX.

The separate opt-in real-host workflow supplies evidence that the current external CLIs are still discoverable by DockyardOS.

After installing the VSIX, open a project and run `DockyardOS: Initialize Project`, then `DockyardOS: Run Doctor`. Close/reopen VS Code and use `DockyardOS: Project Status` or `Resume Context` to confirm persistent state recovery. Use `DockyardOS: Open Community Hub` to verify the searchable manifest-first community workflow, and use `DockyardOS: Check Community Updates Now` before enabling any recurring update policy.
