# DockyardOS Host Adapters

DockyardOS project state is host-independent. A host adapter only teaches a coding agent how to discover/invoke DockyardOS; it does not create another memory database.

All hosts ultimately reuse:

```text
~/.dockyardos/projects/<project-id>/
```

This is what lets the same project resume after switching VS Code, Antigravity, Gemini CLI, Codex, Claude Code, Cursor, or OpenCode.

## Host matrix

| Host | Preferred surface | Optional richer bridge | User-wide option | Dockyard durable resume |
|---|---|---|---|---|
| Google Antigravity | full DockyardOS plugin | native plugin/hook lifecycle | `agy plugin install ...` | yes |
| Gemini CLI | portable Agent Skill | native extension + local MCP + lifecycle hooks | `~/.agents/skills/dockyardos` | yes |
| OpenAI Codex / Agents | Agent Skill / capability directory | compatibility plugin + local MCP | runtime-dependent | yes |
| Claude Code | personal/project Agent Skill | `CLAUDE.md` + local MCP template | `~/.claude/skills/dockyardos` | yes |
| Cursor | portable Agent Skill | project rule + local MCP template | `~/.agents/skills/dockyardos` | yes |
| OpenCode | portable Agent Skill | MCP/config + read-only reviewer template | `~/.config/opencode/skills/dockyardos` or interoperable alias | yes |

The final column means DockyardOS itself restores project/team state even when the host has no native conversation-resume feature.

## Install and inspect

List verified host adapters:

```bash
dockyard host list
```

Inspect the current machine/project without changing anything:

```bash
dockyard host inspect
dockyard host inspect --host claude-code
```

Preview/install the safe portable integration:

```bash
dockyard host plan --host cursor --scope user
dockyard host install --host cursor --scope user
```

DockyardOS refuses to silently replace a different existing `dockyardos` skill. `--force` exists only for an intentional reviewed replacement.

Inspect whether a richer native bridge is packaged:

```bash
dockyard host native-info --host gemini-cli
dockyard host native-info --host codex
```

Native project-file bundles for Claude/Cursor/OpenCode are intentionally **review-first**: DockyardOS will not silently overwrite an existing `CLAUDE.md`, `.cursor/mcp.json`, Cursor rules, OpenCode config, or similar user configuration.

## Portable skill

The canonical host-neutral skill lives at:

```text
integrations/portable/skills/dockyardos/SKILL.md
```

It tells compatible agents to restore project/team state first, continue only the active phase, use bounded capabilities, isolate parallel writers, keep reviewers independent, use provider/security gates, and preserve Dockyard approval decisions.

## Local structured MCP bridge

DockyardOS also ships `dockyard-mcp`, a **local stdio** MCP server. It opens no network listener. Its tool surface is deliberately limited to orchestration/state:

- `dockyard_context`
- `dockyard_recommend`
- `dockyard_team_start`
- `dockyard_team_status`
- `dockyard_team_advance`
- `dockyard_checkpoint`
- `dockyard_policy`

Every tool accepts an optional `workspace` path so a host that launches an MCP process from a plugin/cache directory still resolves the correct DockyardOS project identity.

The MCP bridge does **not** expose arbitrary shell execution, provider credentials, provider mutations, DNS changes, destructive database actions, or production deployment. Those remain behind the normal DockyardOS/provider/host approval paths.

## Native bundle locations

Optional richer integrations are packaged under:

```text
integrations/native/gemini-cli/
integrations/native/codex/
integrations/native/claude-code/
integrations/native/cursor/
integrations/native/opencode/
```

The portable skill remains the default because it is easy to update safely and share across hosts. Native bundles are additive when the host-specific lifecycle/MCP features materially improve automation.

### Gemini CLI

The native bundle includes `gemini-extension.json`, `GEMINI.md`, local MCP registration, and lifecycle hooks. The hooks restore DockyardOS context before agent work and create checkpoints around mutating/session lifecycle events while failing softly if DockyardOS is not initialized.

### OpenAI Codex / Agents

The native compatibility bundle contains `.codex-plugin/plugin.json`, `.mcp.json`, and a DockyardOS skill. The skill instructs Codex to pass the current workspace explicitly to MCP tools where plugin/cache launch paths differ from the repository root and never weakens Codex sandbox/approval policy.

### Claude Code

The optional native template contains project `CLAUDE.md` plus `.mcp.json`. The existing portable installer remains the safe way to install the DockyardOS skill; users review/merge the richer project files with any existing Claude configuration.

### Cursor

The optional native template contains project `.cursor/mcp.json` plus a compact always-on DockyardOS rule. It is not automatically copied over existing Cursor project configuration.

### OpenCode

The optional native template contains local MCP configuration, compact `AGENTS.md`, and a read-only Dockyard reviewer subagent. The reviewer denies edit/shell permissions so it cannot self-approve implementation changes.

## VS Code

The DockyardOS VS Code extension is a one-time control surface over the same Core and project state. Release packaging includes a built Core fallback inside the VSIX. P5.1 additionally bundles the local MCP runtime, production MCP dependencies, and native host templates into that Core; CI inspects the produced VSIX to prove those artifacts are present.

The existing VS Code host installer still defaults to safe portable-skill installation. Review-first native project files are not sprayed into repositories automatically.

## Safety invariants

Host adapters must never:

- copy `~/.dockyardos/projects` into a repository,
- store provider/API credentials in a skill or MCP template,
- silently overwrite a different existing host skill or project config,
- claim identical hook/subagent behavior where a host does not expose it,
- treat a host conversation transcript as authoritative project state,
- bypass host-native or Dockyard approval/security gates,
- expose destructive/provider mutation actions merely because MCP is available.
