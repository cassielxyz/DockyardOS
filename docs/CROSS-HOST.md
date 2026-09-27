# Cross-host support

DockyardOS keeps project continuity in one external state engine and adapts it to each supported coding host. Hosts do not get separate memory databases or separate workflow logic.

## Shared runtime

The same DockyardOS project state is used by:

- Google Antigravity
- Gemini CLI
- OpenAI Codex
- Claude Code
- Cursor
- OpenCode
- Visual Studio Code

The portable host surface is available from the CLI:

```bash
dockyard hosts list
dockyard hosts inspect
dockyard hosts context --id codex
dockyard hosts install-info --id gemini-cli
```

Lifecycle-capable hosts can call:

```bash
dockyard hosts event --id <host> --event after-tool --mutating
dockyard hosts event --id <host> --event pre-compress
dockyard hosts event --id <host> --event stop
```

Policy-aware integrations can query:

```bash
dockyard hosts gate --id <host> --command "git push --force origin main"
```

These commands never replace the host's own permission/sandbox system. DockyardOS adds another decision boundary; it does not weaken the native one.

## Local MCP server

`dockyard-mcp` is a local stdio MCP server. It does not listen on a network port and currently exposes orchestration/state operations only:

- `dockyard_context`
- `dockyard_recommend`
- `dockyard_team_start`
- `dockyard_team_status`
- `dockyard_team_advance`
- `dockyard_checkpoint`
- `dockyard_policy`

The MCP server deliberately does **not** expose provider mutations, secrets, DNS changes, production deployment, destructive database actions, or arbitrary shell execution.

Every MCP tool accepts an optional `workspace` path. Hosts that launch plugins from a cache/plugin directory should pass the actual project root so DockyardOS resolves the correct project identity.

## Host bundles

### Antigravity

`integrations/antigravity/plugin`

Uses native Antigravity skills, specialist subagents, rules, and lifecycle hooks. This remains the richest automatic integration: context restore, approval gating, autosave and stop checkpoints are automatic.

### Gemini CLI

`integrations/gemini-cli`

Includes `gemini-extension.json`, `GEMINI.md`, DockyardOS Agent Skill, local MCP registration, and lifecycle hooks for context injection, post-tool autosave, pre-compression checkpointing, and session-end checkpointing.

### Codex

`integrations/codex`

Uses the supported `.codex-plugin/plugin.json` compatibility package, a DockyardOS skill, and `.mcp.json` pointing at the local `dockyard-mcp` server. The skill instructs Codex to pass the current workspace explicitly when needed and to preserve Codex sandbox/approval policy.

### Claude Code

`integrations/claude-code`

Uses project `CLAUDE.md`, `.mcp.json`, and `.claude/skills/dockyardos/SKILL.md`. Claude Code keeps its native permissions, subagent/team features and resume facilities; DockyardOS adds cross-host project/team continuity.

### Cursor

`integrations/cursor`

Uses `.cursor/rules/dockyardos.mdc` plus project `.cursor/mcp.json`. The always-on rule is intentionally compact and tells the Agent to retrieve current DockyardOS state rather than embedding historical project context in the rule.

### OpenCode

`integrations/opencode`

Uses `opencode.jsonc` with the local MCP server, `AGENTS.md`, and a read-only `.opencode/agents/dockyard-reviewer.md` subagent. The reviewer cannot edit files or run shell commands.

### VS Code

`integrations/vscode`

The VS Code extension is an install-once control surface. It can coexist with any coding agent and provides commands for initialization, doctor, resume context, checkpoints, team start/status/advance, and a status-bar view of the active DockyardOS phase.

Build/package it with:

```bash
cd integrations/vscode
npm install
npm run build
npm run package
```

Install the resulting VSIX once, then initialize each project once.

## Continuity model

A host change does not create a new project memory. For example:

```text
Antigravity session
   ↓ checkpoint/team state
~/.dockyardos/projects/<project-id>
   ↓
Codex / Claude / Cursor / Gemini / OpenCode / VS Code
```

The next host reads the same latest checkpoint, active team phase, decisions, blockers, security gates and worktree assignments. This is why `continue` can recover project state even after changing the coding agent or model.
