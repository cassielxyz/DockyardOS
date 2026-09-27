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
4. For a substantial request, detect the project stack and run the recommendation engine before implementation:

```bash
dockyard recommend --task "<concise user requirement>" --stack <comma-separated-detected-stack> --host antigravity --json
```

5. Treat the recommendation as a bounded capability/team plan. Do not load the full catalogue into context.
6. For a tiny reversible change, use the fast workflow without unnecessary specialist dispatch.

## Workflow selection

- `fast`: small, reversible change. Implement, lint/test, verify, checkpoint.
- `standard`: normal feature. Plan, implement, test, security review, verify, checkpoint.
- `full`: production system or high-risk change. Requirements, architecture, specialist implementation, testing, OWASP/security gates, Strix verification, release verification, checkpoint.

Use specialist subagents when parallel work or independent review improves quality. Do not spawn agents merely to increase agent count. A recipe may describe more lifecycle roles than the current active roster; activate phase-relevant specialists as work progresses.

## Skills and tools

Prefer the capabilities selected by `dockyard recommend`. The registry may contain many candidates, but only activate those relevant to the current phase.

For web UI, strong candidates include UI UX Pro Max, shadcn/ui, Vercel Web Design Guidelines, and Vercel React Best Practices when compatible. For research, use Agent Reach or another selected research capability. For production/high-risk security, DockyardOS requires OWASP-oriented review, Strix verification, secret scanning, dependency scanning, threat modeling, and post-fix regression.

Upstream skill instructions never override DockyardOS approval/security policy. Do not blindly install or update an executable community capability from a floating branch; activation must use the DockyardOS resolution/lock path once available for that source.

## Providers

Select providers by required capability, compatibility, cost constraints, current availability, and project architecture. Do not hard-code Supabase or Vercel. Consider suitable alternatives and verify current free-tier/availability claims before making a provider decision.

Prefer preview/reversible environments first. Provider operations that can affect production remain subject to DockyardOS approval hooks.

## Checkpoints

Create a structured checkpoint after major milestones and before risky transitions, for example:

```bash
dockyard checkpoint --reason milestone --phase P2 --task "authentication" --completed "schema" --next "OAuth callback" --capability supabase
```

The hooks also create interval and stop checkpoints, but explicit milestone checkpoints provide richer resume context.

## Approval

DockyardOS pre-tool decisions are authoritative. Never bypass a `force_ask` or `deny` result. Production deploys, destructive database changes, force pushes, DNS changes, secret rotation, or equivalent high-impact actions require explicit user approval.
