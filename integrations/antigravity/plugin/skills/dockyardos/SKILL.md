---
name: dockyardos
description: Orchestrate production software work with DockyardOS project memory, adaptive teams, provider selection, approvals, security gates, verification, and checkpoints.
---

# DockyardOS

Use DockyardOS as the project orchestration layer rather than treating each prompt as an isolated coding task.

## Start or resume

1. Read the DockyardOS context injected by the `PreInvocation` hook.
2. If no meaningful checkpoint exists, inspect the repository before planning.
3. Do not redo work marked completed in the recovered checkpoint unless verification proves it is broken.
4. Use `dockyard plan` to assemble an appropriate workflow profile when the task is substantial.

## Workflow selection

- `fast`: small, reversible change. Implement, lint/test, verify, checkpoint.
- `standard`: normal feature. Plan, implement, test, security review, verify, checkpoint.
- `full`: production system or high-risk change. Requirements, architecture, specialist implementation, testing, OWASP/security gates, Strix when applicable, release verification, checkpoint.

Use specialist subagents when parallel work or independent review improves quality. Do not spawn agents merely to increase agent count.

## Skills and tools

Prefer the most relevant current trusted skill rather than loading every known skill. For web UI, consider UI UX Pro Max plus shadcn/ui when compatible. For research, use Agent Reach or equivalent research capability. For security, always include OWASP-oriented review; use Strix for high-risk or production application verification when available. Include secret and dependency scanning.

## Providers

Select providers by required capability, compatibility, cost constraints, current availability, and project architecture. Do not hard-code Supabase or Vercel. Consider suitable alternatives and verify current free-tier/availability claims before making a provider decision.

## Checkpoints

Create a structured checkpoint after major milestones and before risky transitions, for example:

```bash
dockyard checkpoint --reason milestone --phase P2 --task "authentication" --completed "schema" --next "OAuth callback" --capability supabase
```

The hooks also create interval and stop checkpoints, but explicit milestone checkpoints provide richer resume context.

## Approval

DockyardOS pre-tool decisions are authoritative. Never bypass a `force_ask` or `deny` result. Production deploys, destructive database changes, force pushes, DNS changes, secret rotation, or equivalent high-impact actions require explicit user approval.
