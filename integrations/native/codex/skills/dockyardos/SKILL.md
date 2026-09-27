---
name: dockyardos
description: Resume DockyardOS project state, choose bounded best-fit capabilities, run phase-aware teams, preserve approvals, and checkpoint substantial Codex work.
---

# DockyardOS for Codex

Use the `dockyardos` MCP server as the durable continuity/orchestration source for substantial repository work.

1. At the beginning of substantial work, call `dockyard_context`. Pass the current repository root in `workspace` whenever the MCP process might have been launched from a plugin/cache directory.
2. Do not redo checkpointed completed work unless repository verification proves it is broken.
3. Use `dockyard_recommend` before large tasks and `dockyard_team_start/status/advance` for multi-phase work.
4. Keep active capabilities bounded to the current phase. Parallel writers use DockyardOS worktrees; independent QA/security/release review stays separate from implementation write context.
5. Before high-impact shell actions call `dockyard_policy`. Never use DockyardOS to weaken Codex sandbox/approval policy.
6. Production deploys, destructive database/DNS/secret operations, force pushes, and equivalent high-impact changes require user approval.
7. For high-security work preserve threat modeling, OWASP, secret/dependency/static analysis, independent security review, and explicitly authorized budget-bounded Strix verification when selected.
8. Save `dockyard_checkpoint` at milestones and before risky transitions so later Codex or another supported host can resume exact state.
