---
name: dockyardos
description: Resume and orchestrate software projects with DockyardOS persistent checkpoints, request mediation, phase-aware teams, capability selection, provider planning, approval gates, security verification, and safely installed community capabilities. Use for project work when DockyardOS is initialized.
---

# DockyardOS portable skill

DockyardOS is the source of durable project state and execution routing. Host conversation memory is supplementary and must not replace DockyardOS checkpoints/team state.

## Agent-native behavior

The user should not have to open a DockyardOS panel or manually invoke DockyardOS after initialization. On hosts without Antigravity's native `PreInvocation` hook, treat every substantive project request as requiring DockyardOS mediation before implementation:

1. recover current DockyardOS context/team state;
2. route the user's actual request through DockyardOS capability selection;
3. start a bounded team only when the request is substantial and no active team already exists;
4. use selected skills/agents/tools/MCPs/providers/security gates instead of a generic one-model workflow;
5. surface one concise `DockyardOS active — ...` line in the first user-visible progress reply for a new quick/team request;
6. never tell the user to open the extension for normal execution.

On MCP-capable hosts prefer `dockyard_context`, `dockyard_recommend`, and `dockyard_team_start`. Otherwise use the equivalent CLI commands.

## Resume first

At the start of project work in an initialized project:

```bash
dockyard status --json
dockyard team status --json
```

If an active team exists, continue only its current phase. Do not recreate completed work because the current host lacks the previous chat transcript.

If no active team exists and the request is substantial:

```bash
dockyard team start --task "<concise requirement>" --stack <detected,stack> --json
```

For a tiny reversible change, avoid creating unnecessary agents but still use DockyardOS's selected fast path and approval policy.

## Phase contract

Normal lifecycle:

`discovery → architecture → planning → implementation → verification → security → release`

Use only the current phase's selected specialists, skills, tools, MCPs, gates, and expected outputs. When complete:

```bash
dockyard team advance --artifact "<evidence>" --decision "<durable decision>" --json
```

Use the compact handoff returned by DockyardOS plus relevant repository files. Do not replay or reconstruct the entire prior conversation.

## Installed community capabilities

Do not load the full community catalogue or every installed package into context. When the current phase could benefit from an installed community capability, inspect only integrity-verified active packages:

```bash
dockyard community active --json
```

On MCP-capable hosts use `dockyard_community_active`. If one active package is relevant, read only the manifest-declared entrypoint needed for the task with `dockyard_community_entrypoint` or:

```bash
dockyard community read --id <package> --entrypoint <declared/path> --json
```

Never read an undeclared package path as a substitute. DockyardOS re-verifies the immutable package digest before exposing active metadata or entrypoints. Discovery-source listings are metadata only and are not executable capabilities.

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
