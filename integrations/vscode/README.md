# DockyardOS for VS Code

The DockyardOS VS Code extension is a thin control surface over one shared DockyardOS runtime/state model. Install the extension once; initialize each project once.

## What the VSIX contains

Release packaging stages a built DockyardOS Core inside the extension under `core/`. By default the extension runs that bundled Core through the VS Code Node runtime, so a separate global `dockyard` install is not required.

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

The status bar shows whether the project is uninitialized, ready, or currently in a DockyardOS team phase.

## Project separation

The extension does not create its own memory database. Every project uses the same DockyardOS external state layout as the CLI:

```text
~/.dockyardos/projects/<project-id>/
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

The packaging step copies the already-built DockyardOS `dist/` plus the portable/Antigravity integration assets into the VSIX staging directory before invoking `vsce`.

## Verify

CI verifies:

1. the root DockyardOS test suite,
2. extension JavaScript syntax,
3. bundled Core staging,
4. bundled Core CLI execution,
5. actual VSIX packaging,
6. cross-host install/doctor smoke tests.

After installing the VSIX, open a project and run `DockyardOS: Initialize Project`, then `DockyardOS: Run Doctor`. Close/reopen VS Code and use `DockyardOS: Project Status` or `Resume Context` to confirm persistent state recovery.
