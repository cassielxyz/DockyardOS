# DockyardOS Practical Workflows

P31 turns the P30 capability mega-registry into practical project teams and workflows.

A large catalogue is useful only if DockyardOS can select a small, coherent set of capabilities for the user's current request. P31 therefore adds two linked layers:

1. **practical recipes** for common project archetypes;
2. **data-driven specialist routing** so selected agents activate only in the phases where they belong.

The user still talks to the coding agent normally. DockyardOS classifies the request, selects a recipe, scores candidates, composes a bounded team, preserves security/approval gates, and injects only the phase-relevant context.

## Practical recipe families

The recipe registry now covers the original SaaS, landing page, e-commerce, API, mobile, security, refactor, performance, migration, release, and 3D workflows plus concrete production archetypes including:

- enterprise B2B SaaS, organizations, identity, and SSO;
- realtime collaboration, WebSockets, and presence;
- RAG / knowledge assistants, embeddings, vector search, and evals;
- data pipelines and analytics platforms;
- ML training/inference services;
- payments, subscriptions, billing, webhooks, and idempotency;
- authentication / identity integrations;
- file upload, media, object-storage, and CDN systems;
- background jobs, queues, events, and schedulers;
- Kubernetes service platforms;
- cloud infrastructure / Terraform / OpenTofu;
- developer CLIs and SDKs;
- MCP servers and connectors;
- VS Code / IDE extensions;
- browser extensions;
- monorepo architecture and cleanup;
- dependency/framework upgrades;
- search and retrieval systems;
- production incident investigation;
- document / office artifact automation;
- Expo / React Native production releases;
- desktop applications;
- multiplayer/realtime games.

Recipes are guidance and scoring inputs, not unrestricted execution authority. Provider mutations, production changes, community-package trust, security exceptions, and destructive operations continue through their existing approval boundaries.

## Natural-language routing

Specific project/failure intent is classified before broad words such as `server`, `feature`, `deploy`, or `new project`.

Examples:

```text
Build a RAG knowledge assistant with embeddings and vector search
→ rag-knowledge-system

Create a realtime collaborative editor with WebSockets and presence
→ realtime-collaboration

Add Stripe subscriptions and billing
→ payments-billing-feature

Build an MCP server that exposes safe tools
→ mcp-server-development

Create a VS Code extension for our developer workflow
→ ide-extension

Investigate a production outage and find the root cause
→ incident-response
```

Explicit failure intent remains authoritative over domain words. For example:

```text
Fix the crash when login token expires
→ bug-fix
```

rather than being incorrectly converted into an authentication-feature build.

## Data-driven agent phase routing

The old composer contained a fixed list of known agents and silently placed unknown agents into `implementation`. That is unsafe for a growing specialist catalogue because a reviewer, architect, privacy specialist, or release specialist could receive the wrong execution role.

P31 replaces that fallback with an explicit routing table. Every registered Dockyard agent declares:

- one or more allowed phases;
- its role: `specialist`, `implementer`, or `reviewer`;
- optional lead phases.

The phases remain:

```text
discovery
→ architecture
→ planning
→ implementation
→ verification
→ security
→ release
```

Examples:

- `solution-architect-agent` → architecture/planning;
- `rag-agent` → implementation;
- `evals-agent` → verification;
- `prompt-safety-agent` → security;
- `release-manager-agent` → release;
- `security-reviewer-agent` → independent security review.

A registered agent without routing is now a registry validation error. An unknown selected agent fails closed instead of silently becoming an implementation worker.

## Isolation and writer safety

Routing metadata also controls isolation.

- **reviewer** → `review-only`;
- **implementer during implementation** → `worktree-write`;
- **specialist / implementer outside implementation** → `shared-read`;
- phase leads coordinate evidence and handoffs but do not gain extra mutation authority merely by being lead.

This means an auth specialist can advise architecture using shared-read context and later become a scoped implementation writer, while an RLS/security reviewer remains read-only.

## Phase budgets

DockyardOS knows about a large registry but deliberately keeps active teams small.

Typical maximum phase-agent budgets are:

| Workflow | Implementation | Verification/Security | Other phases |
| --- | ---: | ---: | ---: |
| Fast | 2 | 1 | 1 |
| Standard | 3 | 2 | 2 |
| Full | 5 | 3 | 3 |

Parallel writer limits remain bounded separately. The full workflow allows at most three parallel worktree writers even when many implementation specialists are available.

Candidate scores from the selection engine are preserved as phase-priority weights. Recipe relevance, trust, capability/stack fit, maintenance/maturity, context cost, risk, and project/user preferences therefore influence which eligible specialists fit into the bounded phase budget.

## Registry integrity

`dockyard registry verify` now validates the combined system rather than only catalogue rows.

It checks:

- catalogue/provider structural validity;
- recipe IDs and required/preferred candidate references;
- recipe agent references and candidate kinds;
- every registered agent has explicit routing;
- routing does not reference missing agents;
- routing has no duplicate phases;
- every declared lead phase is also an allowed phase.

This means adding a new agent or recipe cannot silently leave DockyardOS with a dangling workflow reference.

## Security remains mandatory where applicable

Recipe expansion does not weaken the existing security workflow.

High-security recipes continue to force the mandatory security capability set and gates, including OWASP-oriented review, secret scanning, dependency scanning, Strix verification where configured, and post-fix regression evidence.

Review roles remain independent from implementation writers, and provider/package/production approval systems remain authoritative.

## Verification

P31 regression coverage verifies:

- practical recipe breadth and candidate validity;
- concrete recipe selection from natural-language requests;
- compatibility with existing bug-fix/security/landing-page task inference;
- explicit routing for every registered agent;
- phase-correct expanded specialists;
- reviewer vs writer isolation;
- bounded phase/writer budgets;
- fail-closed behavior for missing routing;
- integrated `registry verify` coverage.

The intended result is not to load more context. It is to let DockyardOS know about more capabilities while activating a smaller, better-matched team for each phase.
