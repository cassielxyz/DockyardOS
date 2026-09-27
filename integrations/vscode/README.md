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
- `DockyardOS: Browse Community Packages`
- `DockyardOS: Community Package Status`

The status bar shows whether the project is uninitialized, ready, or currently in a DockyardOS team phase.

## Community package browser

`Browse Community Packages` intentionally shows only packages with an explicit DockyardOS install manifest. Broad discovery-source entries are not install buttons.

The browser flow is:

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
install only when policy allows
```

For `approval-required`, VS Code shows the policy reasons in a modal before it passes `--approve`. `quarantine` cannot be overridden from the extension.

Installed package versions remain under DockyardOS external state and can be inspected through `Community Package Status`. Rollback is currently exposed by the CLI so the exact target revision stays explicit.

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

`Install/Update Agent Host Integration` first shows the DockyardOS install plan and then asks before modifying the selected host integration location. Existing different `dockyardos` skill content is not overwritten silently.

User scope is preferred when the host supports it because it installs once across projects. Project scope is available when you intentionally want host integration files in a repository.

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

`.github/workflows/real-host-matrix.yml` is deliberately `workflow_dispatch`-only. It is not part of every PR because it downloads current third-party host CLIs.

The matrix currently covers:

- Gemini CLI (`gemini`)
- OpenAI Codex CLI (`codex`)
- Claude Code (`claude`)
- Cursor CLI (`agent`)
- OpenCode (`opencode`)

For npm-distributed hosts, the workflow resolves the current registry version first and records that exact version before installation. For official installer-script hosts, it downloads the installer over HTTPS, records its SHA-256, and only then executes it. Each job records the executable path and reported version, then verifies DockyardOS `host inspect`, `host doctor`, and project-scope portable integration against that actually installed CLI. It does not send prompts to a model or require model/API credentials.

Antigravity remains covered by DockyardOS static plugin/package tests until a stable official noninteractive public CI-install surface is available and verified. The matrix does not invent one.

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
10. the opt-in real-host matrix definition and supported install surfaces.

The separate manual real-host workflow supplies evidence that the current external CLIs are still discoverable by DockyardOS.

After installing the VSIX, open a project and run `DockyardOS: Initialize Project`, then `DockyardOS: Run Doctor`. Close/reopen VS Code and use `DockyardOS: Project Status` or `Resume Context` to confirm persistent state recovery. Use `Browse Community Packages` to verify the manifest-first community workflow.
