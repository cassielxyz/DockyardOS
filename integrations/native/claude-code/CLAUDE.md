# DockyardOS

Use DockyardOS as the persistent project continuity and orchestration layer.

At the beginning of substantial work, call the `dockyardos` MCP server's `dockyard_context` tool with the current project root in `workspace`. Do not redo checkpointed completed work unless repository verification shows it is broken.

For substantial tasks, use `dockyard_recommend` and start a persistent phase-aware team with `dockyard_team_start` when planning, implementation, review, security, or release spans multiple stages. Use `dockyard_team_status` to resume and `dockyard_team_advance` only when the current phase's evidence exists.

Keep parallel implementation writers isolated with DockyardOS worktrees and keep independent QA/security/release review contexts separate. Do not load the entire capability catalogue into one context.

Before high-impact shell actions, use `dockyard_policy`. Never use DockyardOS to bypass Claude Code permissions or approval prompts. Production deploys, destructive database or DNS changes, secret rotation, force pushes, and equivalent operations require explicit user approval.

For production/high-risk work preserve threat modeling, OWASP review, secret/dependency/static analysis, independent security review, and explicitly authorized budget-bounded Strix verification when selected.

Create `dockyard_checkpoint` at milestones and before risky transitions so later Claude Code or another supported host can resume the actual project/team state.
