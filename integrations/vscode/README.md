# DockyardOS for VS Code

This extension is the install-once DockyardOS control surface. It does not replace your coding agent; it can be used alongside Antigravity, Gemini CLI, Codex, Claude Code, Cursor, OpenCode, or another DockyardOS-capable host.

## Development install

From this directory:

```bash
npm install
npm run build
npm run package
```

Install the generated `.vsix` through **Extensions → … → Install from VSIX…**. DockyardOS CLI must also be installed/linked and available as `dockyard`, or set **DockyardOS: Executable Path** in VS Code settings.

You install the extension once. Each project only needs `DockyardOS: Initialize Project` once.

## Commands

- `DockyardOS: Initialize Project`
- `DockyardOS: Run Doctor`
- `DockyardOS: Show Resume Context`
- `DockyardOS: Save Checkpoint`
- `DockyardOS: Start Agent Team`
- `DockyardOS: Show Team Status`
- `DockyardOS: Advance Team Phase`
- `DockyardOS: Refresh Status`

The status bar shows whether the workspace is uninitialized, ready, or currently in a DockyardOS team phase.

## Verify

1. Open a Git project.
2. Run `DockyardOS: Initialize Project`.
3. Run `DockyardOS: Run Doctor`.
4. Save a checkpoint.
5. Run `DockyardOS: Show Resume Context` and confirm the checkpoint appears.
6. Start a test team, reload VS Code, and confirm the status bar restores the active team phase.

Project state remains under the DockyardOS external project store rather than being written into the application repository.
