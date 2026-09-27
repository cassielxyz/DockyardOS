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

For web UI, strong candidates include UI UX Pro Max, shadcn/ui, Vercel Web Design Guidelines, and Vercel React Best Practices when compatible. For research, use Agent Reach or another selected research capability.

Upstream skill instructions never override DockyardOS approval/security policy. Do not blindly install or update an executable community capability from a floating branch; activation must use the DockyardOS resolution/lock path once available for that source.

## Security execution

For substantial, production, authentication, data-handling, API, mobile, or agentic changes, choose the closest security profile and generate the model/plan before declaring the work done:

```bash
dockyard security profiles --json
dockyard security threat-model --profile web --json
dockyard security plan --profile web --target . --target-type source --mode standard --json
```

Profiles currently cover OWASP Web Top 10 2025, API Security Top 10 2023, Mobile Top 10 2024, and GenAI/LLM Top 10 2026.

Run the source gates when their tools are available:

```bash
dockyard security scan --profile web --target . --target-type source --mode standard --json
```

Rules:

1. A missing required scanner is `incomplete`, never clean.
2. Keep security artifacts outside the application repository under DockyardOS project state.
3. Do not run Strix by default. It requires an explicit user-approved/allowed budget and an authorized target.
4. Remote URL/repository dynamic testing requires explicit authorization. Never infer authorization from public accessibility.
5. For Strix, use headless mode and a hard budget. A zero exit code is not enough: DockyardOS requires the Strix run artifact to report `completed`.
6. Never scan source outside the initialized project root through DockyardOS.
7. Treat scanner findings as evidence to review, not automatic proof that every report is exploitable.

For remediation, preserve the first `result.json`, fix the verified issue, rerun the same profile/target/scope, then compare:

```bash
dockyard security compare \
  --before <first-run>/result.json \
  --after <rerun>/result.json \
  --json
```

Do not close a high-risk security task while the regression gate reports remaining or newly introduced high/critical findings, or while the rerun is incomplete/error.

## Providers

Before selecting or changing external services, inspect what the project already has:

```bash
dockyard providers inspect --json
```

Use `--live` only when account/auth readiness materially affects the next decision. Live inspection may make harmless read-only identity/list/status requests but must never dump environment variables or credentials.

For a requirement involving hosting, database, auth, storage, edge/security, functions, observability, or similar infrastructure, generate a provider plan rather than choosing a brand directly:

```bash
dockyard providers plan \
  --capability web-hosting,postgres,auth,object-storage \
  --stack web,nextjs,postgres \
  --environment preview \
  --free-first \
  --json
```

Follow these rules:

1. Prefer an already linked/authenticated compatible provider when it fits the architecture.
2. Respect explicit user/project provider preferences unless they conflict with safety or requirements.
3. If the preferred provider is unavailable, unsuitable, or excluded, move to the next compatible fallback.
4. Do not claim providers are drop-in replacements when data, auth, realtime, storage, runtime, or security semantics differ.
5. Do not treat a generic host as an equivalent replacement for DNS/WAF/DDoS controls.
6. `free-first` means verify current pricing/free-tier eligibility live before activation; never rely on a stale hard-coded quota.
7. Prefer preview/reversible environments before production.
8. Production provider mutations, DNS changes, destructive migrations, and secret operations remain subject to DockyardOS approval hooks.

## Checkpoints

Create a structured checkpoint after major milestones and before risky transitions, for example:

```bash
dockyard checkpoint --reason milestone --phase P3 --task "security verification" --completed "source scans" --next "same-scope rerun" --capability owasp --capability strix-pentest
```

The hooks also create interval and stop checkpoints, but explicit milestone checkpoints provide richer resume context.

## Approval

DockyardOS pre-tool decisions are authoritative. Never bypass a `force_ask` or `deny` result. Production deploys, destructive database changes, force pushes, DNS changes, secret rotation, unauthorized security testing, or equivalent high-impact actions require explicit user approval.
