---
name: dockyardos
description: Resume DockyardOS project state, choose the best bounded skills/agents/tools, run phase-aware teams, preserve approvals, and checkpoint substantial Codex work.
---

# DockyardOS for Codex

Use the `dockyardos` MCP server as the continuity/orchestration source for substantial repository work.

1. At the beginning of substantial work, call `dockyard_context`. Pass the current repository/workspace path in `workspace` whenever the MCP process may have been launched from a plugin/cache directory.
2. Do not redo work marked completed in the latest checkpoint unless repository verification proves it is broken.
3. Use `dockyard_recommend` before large implementation tasks so only a bounded best-fit set of skills, specialist agents, tools, MCPs, providers, and security gates is activated.
4. Start a persistent phase team with `dockyard_team_start` when the task spans planning/implementation/review. Follow `dockyard_team_status` and advance phases with `dockyard_team_advance` only after required outputs/evidence exist.
5. Keep parallel writers isolated through DockyardOS worktree assignments and keep independent reviewers separate from implementation context.
6. Use provider selection by capability and compatibility; prefer existing/free suitable services where useful but verify current pricing/availability before activation.
7. Before high-impact shell actions, call `dockyard_policy`. Never use DockyardOS to weaken Codex sandbox/approval policy. Production deploys, destructive DB/DNS/secret operations, force pushes, and equivalent changes require user approval.
8. For production/high-risk work preserve threat modeling, OWASP coverage, secret/dependency/static analysis, independent security review, and authorized/budget-bounded Strix verification when selected.
9. Save `dockyard_checkpoint` at major milestones and before risky transitions so a later `continue` can restore exact project/team state.
