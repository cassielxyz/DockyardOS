# DockyardOS Host Adapters

DockyardOS project state is host-independent. A host adapter only teaches a coding agent how to discover/invoke DockyardOS; it does not create another memory database.

All hosts ultimately reuse:

```text
~/.dockyardos/projects/<project-id>/
```

This is what lets the same project resume after switching VS Code, Antigravity, Gemini CLI, Codex, Claude Code, Cursor, or OpenCode.

## Host matrix

| Host | Preferred DockyardOS surface | User-wide option | Native hooks/subagents | Dockyard durable resume |
|---|---|---|---|---|
| Google Antigravity | full DockyardOS plugin | `agy plugin install ...` | yes | yes |
| Gemini CLI | Agent Skill / extension | `~/.agents/skills/dockyardos` | richer extension path available | yes |
| OpenAI Codex / Agents | Agent Skill / plugin / Agents API capability directory | runtime-dependent | host-dependent | yes |
| Claude Code | Agent Skill / plugin | `~/.claude/skills/dockyardos` | yes | yes |
| Cursor | portable Agent Skill | `~/.agents/skills/dockyardos` | host-native features | yes |
| OpenCode | portable Agent Skill | `~/.config/opencode/skills/dockyardos` or interoperable alias | limited Dockyard hook parity | yes |

The `yes` in the final column means DockyardOS itself can restore the project/team state even when the host has no native conversation resume feature.

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

Preview an install:

```bash
dockyard host plan --host cursor --scope user
```

Install the portable integration where a verified path exists:

```bash
dockyard host install --host cursor --scope user
```

DockyardOS refuses to silently replace a different existing `dockyardos` skill. `--force` exists for an intentional reviewed replacement.

## Portable skill

The canonical host-neutral skill lives at:

```text
integrations/portable/skills/dockyardos/SKILL.md
```

It tells compatible agents to:

1. restore DockyardOS status/team state first,
2. continue only the active phase,
3. use bounded selected capabilities,
4. use isolated worktrees for parallel writers,
5. keep QA/security/release review independent,
6. use provider planning and security gates,
7. respect Dockyard approval decisions.

The portable skill intentionally does not duplicate provider credentials, memory, checkpoints, or agent scratch state.

## Verified host behavior

### Gemini CLI

Current Gemini CLI documentation recognizes user skills under `~/.gemini/skills/` **or the interoperable `~/.agents/skills/` alias**, and workspace skills under `.gemini/skills/` or `.agents/skills/`. Extensions can bundle skills plus richer tools such as hooks/MCP/subagents. DockyardOS prefers `.agents/skills` for the portable path because other compatible hosts can share the same skill copy.

### Claude Code

Current Claude Code documentation recognizes personal skills at `~/.claude/skills/<name>/SKILL.md` and project skills at `.claude/skills/<name>/SKILL.md`. Claude Code also supports plugin skills and richer skill features. DockyardOS still uses its own project/team checkpoint state so native Claude conversation resume is helpful but not required.

### OpenAI Codex / Agents

OpenAI's current Agents API documents open Agent Skills loaded through sandbox capability directories, and OpenAI plugins can package skills plus MCP configuration. DockyardOS does **not** invent a local Codex client search path where current OpenAI documentation does not guarantee one. The `runtime` install plan therefore describes the documented capability-directory integration; project `.agents/skills` is exposed only as a portable option whose discovery must be verified by the active client.

### Cursor and OpenCode

Both currently support open Agent Skills-compatible locations. DockyardOS prefers the interoperable `.agents/skills` path when possible to avoid maintaining duplicated copies for multiple coding agents.

## VS Code

The DockyardOS VS Code extension is not another agent runtime. It is a one-time control surface over the same Core and project state. Release packaging includes a built Core fallback inside the VSIX, so users do not need a separate global CLI for normal extension usage.

Use `DockyardOS: Install/Update Agent Host Integration` to preview and install a selected agent host integration from VS Code.

## Safety

Host adapters must never:

- copy `~/.dockyardos/projects` into a repository,
- store provider/API credentials in a skill,
- silently overwrite a different existing host skill,
- claim unsupported hook/subagent parity,
- treat a host conversation transcript as the authoritative project state,
- bypass Dockyard approval/security gates.
