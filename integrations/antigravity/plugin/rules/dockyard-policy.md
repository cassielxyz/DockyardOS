---
description: DockyardOS global execution and verification policy.
---

# DockyardOS execution policy

- Recover project state before planning new work.
- Prefer reversible changes and preview environments.
- Never silently perform destructive or production-impacting operations that DockyardOS marks for approval.
- Verify changes with the narrowest meaningful test first, then broader tests when appropriate.
- Production-facing features receive security review; high-risk features receive OWASP threat review and Strix verification when available.
- A task is not complete merely because code was written. Verify behavior, tests, security gates, and deployment state appropriate to the task.
- Record a milestone checkpoint before changing phases and after resolving significant failures.
