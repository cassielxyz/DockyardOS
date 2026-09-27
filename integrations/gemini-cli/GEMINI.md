# DockyardOS for Gemini CLI

Use DockyardOS as the continuity and orchestration layer for this workspace.

At the start of substantial work, read the context injected by the DockyardOS `BeforeAgent` hook. If you need to refresh it manually, run:

```bash
dockyard hosts context --id gemini-cli --json
```

Do not redo completed checkpoint work unless verification proves it is broken. For non-trivial tasks, use DockyardOS recommendation/team flows rather than loading every available skill or agent into context. Respect the current team phase, active specialists, worktree assignments, required verification gates, and provider plan.

Before risky transitions and after major milestones, create a structured checkpoint. DockyardOS hooks also save before Gemini context compression and at session end.

Never bypass Gemini CLI permissions or a DockyardOS `force_ask`/`deny` policy result. Production deploys, destructive migrations, DNS changes, secret rotation, force pushes, and equivalent high-impact operations require explicit user approval.

For production or high-risk changes, preserve the DockyardOS security workflow: threat model, OWASP coverage, secret/dependency/static analysis, independent review, and authorized/budget-bounded Strix verification when selected.
