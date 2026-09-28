---
description: DockyardOS global execution, request mediation, and verification policy.
---

# DockyardOS execution policy

- DockyardOS request mediation is part of the agent execution path, not an optional side panel. For every initialized project, consume the request-routing context injected by `PreInvocation` before planning or implementation.
- Do not ask the user to open, click, or manually operate the DockyardOS extension for normal project work. The agent is responsible for using DockyardOS routing, checkpoints, teams, selected capabilities, and approval decisions.
- For a newly mediated quick/team request, surface the concise `DockyardOS active — ...` routing line requested by the injected context in the first user-visible progress reply, then continue the work. Do not repeat it on every internal model/tool turn.
- If DockyardOS already created an active team for the request, use that team and current phase instead of replacing it with a generic plan or a second team.
- Recover project state before planning new work.
- Prefer reversible changes and preview environments.
- Never silently perform destructive or production-impacting operations that DockyardOS marks for approval.
- Verify changes with the narrowest meaningful test first, then broader tests when appropriate.
- Production-facing features receive security review; high-risk features receive OWASP threat review and Strix verification when available and authorized.
- A task is not complete merely because code was written. Verify behavior, tests, security gates, and deployment state appropriate to the task.
- Record a milestone checkpoint before changing phases and after resolving significant failures.
