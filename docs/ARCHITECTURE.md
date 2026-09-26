# DockyardOS Architecture

DockyardOS is an orchestration layer, not a replacement model or IDE. Antigravity (and later other agent hosts) supplies model execution and tools; DockyardOS supplies persistent project state, policy, capability selection, provider routing, workflow composition, and verification gates.

## Core layers

1. **Project identity** — stable identity derived from a sanitized Git remote when available, otherwise the workspace path.
2. **Persistent state** — stored outside the project under `~/.dockyardos/projects/<id>` so agent-operating files do not pollute source repositories.
3. **Checkpoints** — milestone, timed, and stop snapshots containing structured task state plus Git status and a bounded text patch for uncommitted tracked changes.
4. **Approval policy** — classifies agent tool actions as allow, ask, force-ask, or deny.
5. **Capability registry** — skills, tools, MCPs, agents, and providers grouped by capability rather than hard-coded single vendors.
6. **Workflow composer** — builds fast, standard, or full specialist teams and security gates.
7. **Host adapters** — Antigravity first; additional hosts can translate their lifecycle/tool contracts into DockyardOS events.

## Antigravity adapter

The initial adapter is packaged as an Antigravity plugin containing:

- `PreInvocation`: auto-initialize the project if necessary and inject recovered context.
- `PreToolUse`: apply DockyardOS approval policy.
- `PostToolUse`: create throttled automatic checkpoints after successful mutating actions.
- `Stop`: force a final checkpoint.
- reusable skill/rules plus architect, security, and QA subagents.

The design uses Agent Skills rather than legacy Antigravity Workflows so DockyardOS stays aligned with the open skill ecosystem.

## Security model

DockyardOS treats community capabilities as untrusted until curated. Registry updates will include provenance, pinned revisions, permissions, evaluation results, and quarantine for updates that expand permissions or execute new scripts.
