---
name: dockyardos
description: Resume and orchestrate software projects with DockyardOS persistent checkpoints, phase-aware teams, capability selection, provider planning, approval gates, and security verification. Use for substantial coding/project work when DockyardOS is initialized.
---

# DockyardOS portable skill

DockyardOS is the source of durable project state. Host conversation memory is supplementary and must not replace DockyardOS checkpoints/team state.

## Resume first

At the start of substantial work in an initialized project:

```bash
dockyard status --json
dockyard team status --json
```

If an active team exists, continue only its current phase. Do not recreate completed work because the current host lacks the previous chat transcript.

If no active team exists and the request is substantial:

```bash
dockyard team start --task "<concise requirement>" --stack <detected,stack> --json
```

For a tiny reversible change, avoid creating unnecessary agents.

## Phase contract

Normal lifecycle:

`discovery → architecture → planning → implementation → verification → security → release`

Use only the current phase's selected specialists, skills, tools, MCPs, gates, and expected outputs. When complete:

```bash
dockyard team advance --artifact "<evidence>" --decision "<durable decision>" --json
```

Use the compact handoff returned by DockyardOS plus relevant repository files. Do not replay or reconstruct the entire prior conversation.

## Parallel writers

If multiple implementation writers are useful, obey the Dockyard parallel-writer budget and create isolated worktrees:

```bash
dockyard team worktree create --run <run-id> --task-id <task> --agent <logical-agent> --json
```

Independent QA/security/release reviewers must remain separate from implementation write roles.

## Providers

Choose infrastructure by capability and fit, not brand:

```bash
dockyard providers inspect --json
dockyard providers plan --capability <requirements> --stack <stack> --environment preview --free-first --json
```

Do not assume current free-tier limits without live validation. Production mutations remain approval-gated.

## Security

Use the matching Dockyard security profile for material attack-surface changes:

```bash
dockyard security threat-model --profile web --json
dockyard security scan --profile web --target . --target-type source --mode standard --json
```

Missing required scanners mean incomplete, not clean. Remote dynamic testing requires explicit authorization. Strix is opt-in, authorized, and budget-bounded. After remediation, compare the original and same-scope rerun results with `dockyard security compare`.

## Approval and safety

DockyardOS approval decisions are authoritative. Never bypass a deny/approval requirement for production deploys, destructive database operations, DNS changes, secret rotation, force pushes, unauthorized security testing, or equivalent high-impact actions.

Do not store credentials, raw secrets, full transcripts, or unrelated agent scratch context in DockyardOS handoffs.
