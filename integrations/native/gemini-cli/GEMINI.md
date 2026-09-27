# DockyardOS

Use DockyardOS as the durable project continuity and orchestration layer for this workspace.

At the beginning of substantial work, call the local `dockyardos` MCP tool `dockyard_context` with the current project path in `workspace`. Do not recreate work already marked completed unless repository verification shows it is broken.

Use `dockyard_recommend` before large tasks and `dockyard_team_start/status/advance` for multi-phase work. Keep capabilities bounded to the current phase. Parallel implementation writers must use DockyardOS worktree isolation; QA/security/release reviewers stay independent from implementation write context.

Preserve Gemini CLI permissions and DockyardOS policy. High-impact production, database, DNS, secret, force-push, or equivalent operations still require explicit user approval.

For production/high-risk changes keep threat modeling, OWASP coverage, secret/dependency/static analysis, independent security review, and explicitly authorized budget-bounded Strix verification when selected.

Save a DockyardOS checkpoint at major milestones and before risky transitions so later sessions or another supported agent can resume the same project/team state.
