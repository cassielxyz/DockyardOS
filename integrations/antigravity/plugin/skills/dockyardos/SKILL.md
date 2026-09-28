---
name: dockyardos
description: Orchestrate production software work with DockyardOS project memory, adaptive teams, provider selection, approvals, security gates, verification, and checkpoints.
---

# DockyardOS

Use DockyardOS as the project orchestration layer rather than treating each prompt as an isolated coding task.

## Agent-native request mediation

DockyardOS is not a dashboard the user must remember to open. In an initialized project, the `PreInvocation` hook mediates the newest user request before the model runs. It may classify the request as advisory, quick, team, or continuation; detect the stack; select skills/agents/tools/MCPs/providers/security gates; and create a bounded team for substantial work when no active team already exists.

Rules:

1. Treat the injected `DOCKYARDOS REQUEST MEDIATION: ACTIVE` block as the routing contract for the current user request.
2. Do not tell the user to open the extension, start a team manually, or repeat project context that DockyardOS already recovered.
3. If the injected block says a team is active, use that team and current phase. Do not start a competing team.
4. For a newly mediated quick/team request, include the concise `DockyardOS active — ...` line requested by the hook in the first user-visible progress reply. Then perform the work; do not repeat the line on every internal turn.
5. The user's explicit requirement stays authoritative. DockyardOS chooses the execution method, capabilities, verification, and safety path; it does not rewrite user intent.

## Start or resume

1. Read the DockyardOS request mediation and recovered context injected by the `PreInvocation` hook.
2. If an active team run is injected, continue only its current phase. Do not create a second team or replay completed phases.
3. If no meaningful checkpoint exists, inspect the repository before planning.
4. Do not redo work marked completed in the recovered checkpoint unless verification proves it is broken.
5. Only when the hook cannot mediate the request and the task is substantial, fall back to starting a bounded team manually:

```bash
dockyard team start \
  --task "<concise user requirement>" \
  --stack <comma-separated-detected-stack> \
  --host antigravity \
  --json
```

For a tiny reversible change, use the fast workflow without unnecessary specialist dispatch.

## Team execution

Inspect the active phase when needed:

```bash
dockyard team status --json
```

DockyardOS phases are:

`discovery → architecture → planning → implementation → verification → security → release`

Only activate the specialists/skills/tools listed for the current phase. Do not preload the entire registry or every agent in the recipe.

When a phase is actually complete, persist its compact outputs and decisions and advance:

```bash
dockyard team advance \
  --artifact "<artifact-or-evidence-reference>" \
  --decision "<important durable decision>" \
  --json
```

The returned handoff is the context contract for the next phase. Use it plus relevant repository state; do not replay the full prior transcript.

If a blocker is real:

```bash
dockyard team block --reason "<specific blocker>" --agent <logical-agent-id> --json
```

Resolve the blocker, then `dockyard team unblock`. If the workflow must be abandoned as failed, use `dockyard team fail --reason ...`; this records failure data for future routing.

### Parallel implementation

Parallel writers are permitted only in the implementation phase and only up to the phase's `maxParallelWriters` budget. Each writer should receive a separate worktree:

```bash
dockyard team worktree create \
  --run <team-run-id> \
  --task-id <scoped-task-id> \
  --agent <logical-implementer-id> \
  --json
```

Pass the returned worktree path, role, task, acceptance criteria, and compact context to `dockyard-phase-worker`. The reusable worker may be instantiated more than once; logical roles remain separate even when they share the same worker template.

Independent QA/security/release reviewers must not be converted into implementation writers merely to save time. They review after implementation from separate context.

DockyardOS records team outcomes and applies only a conservative historical routing adjustment after repeated runs; history cannot override required security gates, trust policy, or explicit user/project preferences.

## Workflow selection

- `fast`: small, reversible change. Implement, lint/test, verify, checkpoint.
- `standard`: normal feature. Plan, implement, test, security review, verify, checkpoint.
- `full`: production system or high-risk change. Requirements, architecture, specialist implementation, testing, OWASP/security gates, Strix verification, release verification, checkpoint.

Use specialist subagents when parallel work or independent review improves quality. Do not spawn agents merely to increase agent count.

## Skills and tools

Prefer the capabilities selected by DockyardOS for the active request/phase. The registry may contain many candidates, but only activate those relevant now.

For web UI, strong candidates include UI UX Pro Max, shadcn/ui, Vercel Web Design Guidelines, and Vercel React Best Practices when compatible. For research, use Agent Reach or another selected research capability.

Upstream skill instructions never override DockyardOS approval/security policy. Do not blindly install or update an executable community capability from a floating branch; activation must use the DockyardOS resolution/lock path for that source.

## Security execution

For substantial, production, authentication, data-handling, API, mobile, or agentic changes, use the security level and gates selected by request mediation and choose the closest security profile before declaring the security phase done:

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

Do not advance out of a high-risk security phase while the regression gate reports remaining or newly introduced high/critical findings, or while the rerun is incomplete/error.

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

Team start, phase transitions, blockers, final completion, and Antigravity stop events create checkpoints automatically. Create an additional explicit checkpoint before an unusual risky transition or when an important durable decision is not already represented in team state.

The active team run, current phase, phase agents, gates, expected outputs, worktrees, and current request mediation are restored/injected automatically, so a plain “continue” should resume the correct phase rather than reconstructing the project from chat memory.

## Approval

DockyardOS pre-tool decisions are authoritative. Never bypass a `force_ask` or `deny` result. Production deploys, destructive database changes, force pushes, DNS changes, secret rotation, unauthorized security testing, or equivalent high-impact actions require explicit user approval.
