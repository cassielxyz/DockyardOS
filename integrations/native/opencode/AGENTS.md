# DockyardOS

Use the `dockyardos` MCP server for durable project continuity and orchestration.

Before substantial work, call `dockyard_context` with the current workspace. Resume the active checkpoint/team phase instead of restarting completed work. Use `dockyard_recommend` and phase-aware teams for large work so only relevant skills, agents, tools, MCPs, and providers are active.

Keep parallel writers isolated and use independent reviewers for QA/security/release. Preserve OpenCode permissions plus DockyardOS policy gates; never bypass approval for destructive production, database, DNS, secret, force-push, or equivalent operations.

For high-security projects keep threat modeling, OWASP review, secret/dependency/static analysis, independent review, and explicitly authorized budget-bounded Strix verification when selected. Save DockyardOS checkpoints at milestones and before risky transitions.
