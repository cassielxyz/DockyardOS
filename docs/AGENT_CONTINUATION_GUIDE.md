# DockyardOS Agent Continuation Guide

This is the durable operating manual for any AI coding agent that continues DockyardOS, including Google Antigravity, ChatGPT/Codex-style agents, Gemini CLI, Claude Code, Cursor, OpenCode, or another future host.

The purpose of this file is to make project continuation independent from one chat session, one model, one account, or one agent host.

**Do not treat chat history as the project source of truth. The repository is the source of truth.**

---

## 1. Project identity and purpose

Repository: `cassielxyz/DockyardOS`

DockyardOS is a persistent autonomous-development orchestration layer that sits around coding agents. It is not a replacement model or IDE.

The agent host supplies model execution and tools. DockyardOS supplies:

- persistent project identity and memory;
- resumable checkpoints;
- request mediation from natural language;
- adaptive project/workflow classification;
- a large curated capability registry of skills, agents, tools, MCPs, and providers;
- bounded capability selection instead of loading everything into context;
- specialist agent/subagent team composition;
- phase-aware execution and independent reviewers;
- approval and safety policy;
- provider selection, fallback planning, and approved external actions;
- security verification using OWASP-oriented workflows, Gitleaks, OSV-Scanner, Semgrep, Strix, and regression evidence;
- cross-host continuity across Antigravity, Gemini CLI, Codex, Claude Code, Cursor, OpenCode, and VS Code;
- safe community capability discovery, quarantine, signatures, updates, rollback, and provenance;
- runtime readiness checks so a selected skill is not falsely described as installed, connected, or ready;
- verification, CI, release, and durable project handoff.

The intended user experience is simple: the user talks to the AI agent in normal language, and DockyardOS reconstructs the correct project context, selects the best bounded team/capabilities, performs the work under existing safety rules, verifies the result, and stores enough durable state for a future `continue` request.

---

## 2. Mandatory source-of-truth order

Before changing any code, inspect these sources in this order.

### 2.1 Git repository state

First inspect:

1. current `main` HEAD;
2. recent commits after the last recorded checkpoint;
3. open pull requests;
4. active work branches;
5. recent merged pull requests;
6. current GitHub Actions results;
7. current diff/status if working locally.

Never assume the milestone written in this file is still the latest milestone.

### 2.2 Durable checkpoint

Read:

- `docs/CURRENT_CHECKPOINT.md`
- `docs/checkpoints/latest.json`
- `docs/checkpoints/README.md`

`docs/checkpoints/latest.json` is the machine-readable pointer.

`docs/CURRENT_CHECKPOINT.md` is the human-readable explanation.

The `verifiedCodeSha` is the last completed production-code anchor. A later documentation-only checkpoint commit does not make the checkpoint stale by itself.

If production code exists after `verifiedCodeSha`, inspect it before doing anything. If a newer production milestone is already merged, that newer state is authoritative and the checkpoint must be repaired before continuing.

### 2.3 Roadmap

Read:

- `docs/ROADMAP.md`

Do not implement a roadmap checkbox merely because it is unchecked. First verify whether newer code/PRs already implemented it and the roadmap is stale.

### 2.4 Feature documentation

Read the documentation relevant to the area being changed. Important documents include:

- `README.md` — current product behavior and user-facing overview
- `docs/ARCHITECTURE.md` — core architecture
- `docs/CAPABILITY_MEGAREGISTRY.md` — broad skills/agents/tools/MCP/provider catalogue
- `docs/PRACTICAL_WORKFLOWS.md` — recipes and specialist routing
- `docs/CURATED_SKILL_MATERIALIZATION.md` — verified package materialization/readiness rules
- `docs/HOSTS.md` — agent-host integration model
- `docs/HOST_NATIVE_MERGE.md` — safe project-native host configuration merging
- `docs/PROVIDERS.md` and provider milestone docs — provider planning/actions/verification
- `docs/SECURITY.md` and security milestone docs — security evidence and gates
- `docs/COMMUNITY.md` — community package trust/update model
- `docs/MAINTAINER_TRUST.md` — publisher/contribution trust operations
- `docs/PACKAGE_TRANSPARENCY_ANCHOR.md` — public transparency witness model
- `docs/RELEASES.md` — release and host verification gates
- `docs/MONETIZATION.md` and `docs/PUBLIC_EDITION_ADS.md` — commercial surfaces and neutrality rules
- `integrations/vscode/README.md` — VS Code extension behavior

A chat summary is lower authority than all of the above.

---

## 3. Current durable checkpoint when this guide was introduced

At the time this guide was introduced, the repository checkpoint recorded:

- completed production milestones: **P0 through P35**;
- last completed production milestone: **P35 — runtime connection readiness**;
- next continuation target: **P36 — verified host/MCP connection readiness**.

Do **not** use this static paragraph as the continuation pointer if `docs/checkpoints/latest.json` says something newer. The live checkpoint always wins.

### P36 target from the current checkpoint

DockyardOS must distinguish clearly between:

1. capability selected;
2. capability package installed and integrity-verified;
3. required local executable/runtime present;
4. provider or MCP configured;
5. provider or MCP actually verified usable by the current host/session;
6. permission/approval to perform a specific mutation.

Key P36 invariants:

- selected/configured must never be reported as connected unless verified;
- required MCP/provider prerequisites fail closed when live verification is unavailable;
- optional connections stay advisory and should not create unnecessary live probes;
- credentials/tokens must not be persisted in checkpoint/project metadata;
- connection verification never implies production/destructive approval;
- readiness must remain bound to the immutable installed package manifest snapshot;
- `continue` should reuse the current project/team/capability state instead of rerunning unrelated selection.

Before starting P36, inspect current host adapters, MCP bridge, host doctor/native-info surfaces, provider detection, capability fulfillment, tests, CI, and any newer upstream/merged work.

---

## 4. What is already implemented — do not rebuild it

The detailed implementation history is in merged PRs and the roadmap. The following major systems already exist in merged production state and must be reused rather than recreated.

### 4.1 Core project memory and checkpoints

DockyardOS already has:

- stable project identity;
- external project state under `~/.dockyardos/projects/<project-id>/`;
- manual checkpoints;
- timed/autosave checkpoints;
- stop checkpoints;
- Git status and bounded patch capture;
- resume context;
- persistent team-run state;
- compact phase handoffs;
- continuation across models/accounts/agent hosts.

Do not create a second memory database inside a project repository.

### 4.2 Approval policy

DockyardOS already supports Safe / Balanced / Autonomous modes and distinguishes actions such as:

- reversible local work;
- approval-required external mutations;
- production-sensitive actions;
- destructive/high-impact operations;
- denied machine-destructive actions.

Existing approval boundaries are authoritative. A new feature must use them or introduce an equally explicit reviewed boundary; it must not silently bypass them.

### 4.3 Capability mega-registry

DockyardOS has a broad catalogue of:

- skills;
- specialist agents/subagents;
- tools;
- MCP/connector metadata;
- providers;
- project recipes;
- provenance/trust/risk/permissions/context-cost metadata;
- update channels.

The registry is intentionally much larger than the active context.

DockyardOS selects a small bounded set for each task/phase. Do not load the entire catalogue into the agent context.

### 4.4 Practical workflows and specialist routing

Workflows cover many archetypes such as:

- SaaS and enterprise/SSO;
- landing pages and e-commerce;
- APIs and backend services;
- mobile and desktop apps;
- RAG/vector/evals systems;
- data/ML pipelines;
- realtime collaboration;
- payments/billing;
- auth/identity;
- storage/media/CDN;
- background jobs/events;
- Kubernetes/IaC;
- CLIs/SDKs;
- MCP servers;
- IDE/browser extensions;
- monorepos/upgrades;
- production incidents;
- document automation;
- multiplayer/realtime games;
- performance/security/refactor/release work.

Normal phases are:

`discovery -> architecture -> planning -> implementation -> verification -> security -> release`

Agent routing is data-driven. Reviewers remain review-only. Implementation writers receive bounded worktree-write isolation only in implementation phases. Unknown/missing routing fails closed.

### 4.5 Agent-native request mediation

DockyardOS can mediate a user's normal language request before execution. It can:

- detect request type;
- detect stack/project signals;
- distinguish quick/advisory/substantial/continuation work;
- select bounded capabilities;
- start/reuse a persistent project team;
- avoid duplicate team creation for repeated invocations;
- preserve only bounded routing metadata rather than raw full conversation history.

Do not make the user manually reconstruct the project or manually choose every skill for normal work.

### 4.6 Curated high-value skills

The capability system includes real materialized package manifests for high-value skills such as:

- Vercel React Best Practices;
- Vercel Composition Patterns;
- Vercel Web Design Guidelines;
- Supabase Postgres Best Practices;
- UI UX Pro Max;
- shadcn/ui Skill;
- Agent Reach;
- Supabase Agent Skill;
- Cloudflare Platform skill.

This is not an exhaustive list. The broader catalogue/discovery system remains larger.

Selection is not readiness. A skill can be known/selected but still be discovery-only, installable, approval-required, missing-runtime, needs-connection, or ready.

### 4.7 Truthful capability fulfillment

DockyardOS already separates capability states so an agent does not claim a capability is active merely because its name was selected.

Current readiness concepts include:

- selected;
- bundled/ready;
- package installable/unassessed;
- installed and integrity-verified;
- missing runtime executable;
- needs external connection;
- discovery-only;
- approval-required/quarantined where relevant.

P35 extended this to package-declared provider/MCP connection requirements and immutable installed-manifest runtime requirements.

Future work must preserve this truthfulness.

### 4.8 Providers and free/fallback platforms

DockyardOS already uses capability-based provider planning rather than hard-coding one vendor.

The provider system includes first-class and alternative platforms across categories such as:

- hosting/deployment;
- CDN/DNS/WAF/security;
- PostgreSQL/database;
- auth;
- object storage;
- backend/BaaS;
- observability;
- jobs/events;
- cloud/runtime services.

Examples include Vercel, Cloudflare, Supabase and alternatives such as Neon, Firebase, Appwrite, PocketBase, Render, Railway, Fly.io, Turso, Cloud Run, Sentry and others represented by current registry/provider metadata.

Implemented provider work includes:

- safe local detection/readiness;
- capability-based fallback planning;
- free-first planning with evidence/freshness rules;
- authenticated actions for supported providers;
- verified preview provisioning;
- alternative-provider action work;
- pricing/free-tier evidence work;
- provider health evidence;
- transactional PostgreSQL migration/rollback artifacts.

Never treat incompatible services as drop-in replacements merely because both have a free tier.

### 4.9 Security

DockyardOS already has runnable security workflows, including:

- OWASP-oriented Web/API/Mobile/GenAI-LLM profiles;
- threat-model artifacts;
- Gitleaks;
- OSV-Scanner;
- Semgrep CE;
- opt-in budget-bounded Strix;
- proof -> fix -> same-scope rerun regression gates;
- normalized evidence/results;
- fail-closed missing-scanner behavior;
- project-specific expiring security exceptions;
- SARIF export;
- approved GitHub SARIF upload flow;
- expiry reminders;
- independent security review agents.

A missing scanner, failed scanner, or unverifiable run must never be converted into a clean result.

### 4.10 Host integration

DockyardOS supports host adapters for:

- Google Antigravity;
- Gemini CLI;
- OpenAI Codex;
- Claude Code;
- Cursor;
- OpenCode;
- VS Code extension/bundled Core.

Antigravity has the richest native plugin/hook integration. Other hosts receive the verified mechanisms they actually support; DockyardOS must not pretend all hosts expose identical lifecycle/subagent capabilities.

A six-host real-host matrix has already been executed successfully and has durable evidence in the repository.

### 4.11 Safe host-native configuration merging

Review-first native host files are merged through explicit per-host rules. DockyardOS does not recursively overwrite arbitrary user configuration. Existing customized/conflicting config becomes review-required.

Do not replace this with a generic recursive copy or `--force` overwrite mechanism.

### 4.12 Community capability distribution

DockyardOS already includes:

- bundled installable manifests separated from metadata-only discovery sources;
- GitHub quarantine fetcher;
- immutable revision resolution;
- file/size/depth bounds;
- symlink/special-file rejection;
- entrypoint validation;
- script/binary/install-lifecycle detection;
- conservative permission inference;
- Ed25519 publisher signatures and registry signatures;
- approval-required/quarantine decisions;
- immutable installed revisions;
- rollback;
- local transparency chain;
- signed remote registries;
- replay/equivocation protection;
- collision-safe effective registry;
- offline installed-manifest snapshots;
- automatic-only safe updates with no approval bypass;
- Docker/Podman sandbox canaries;
- third-party contribution staging/validation;
- maintainer-controlled publisher onboarding/rotation/revocation and promotion;
- public package-action transparency anchoring;
- VS Code Community Hub.

Do not let a remote registry, community PR, or selected skill bypass package/signature/permission/quarantine rules.

### 4.13 Scheduled updates and reminders

Scheduled community update checks and security-policy expiry reminders already exist. They are bounded, opt-in/read-only or safe-only as designed. Do not convert them into unattended approval paths.

### 4.14 Public/commercial surfaces

DockyardOS has sponsored/affiliate/public-edition monetization work. Technical decisions must remain commercially neutral.

Sponsored relationships must never alter:

- capability ranking;
- provider selection/fallback order;
- pricing/free-tier evidence;
- security findings;
- agent/subagent selection;
- package trust;
- approval decisions;
- research conclusions.

Read monetization docs before changing this area.

---

## 5. Skills, agents, tools, MCPs, and providers — how to use them

DockyardOS is not a static list of skill names.

The correct pattern is:

1. understand the user's request;
2. inspect the current project stack/state;
3. infer task/project archetype;
4. select a bounded recipe;
5. score candidate skills/agents/tools/MCPs/providers;
6. check real readiness;
7. activate only phase-relevant verified capabilities;
8. request approval for capabilities/actions that cross an approval boundary;
9. perform the task;
10. verify with independent evidence;
11. checkpoint.

Do not hard-code a single provider or one preferred skill when the registry already models alternatives.

Do not assume `selected` means `installed`.

Do not assume `installed` means required runtime executables are present.

Do not assume `configured` means an MCP/provider is currently connected.

Do not assume `connected` grants permission for production/destructive changes.

This separation is especially important for P36 and later work.

---

## 6. Mandatory continuation/preflight algorithm

When the user says something like:

- `continue`
- `continue the project`
- `resume DockyardOS`
- `continue according to the checkpoint`

perform this procedure before writing code.

### Step 1 — refresh repository truth

Inspect/fetch current remote state. Do not work from an old clone without checking remote `main`.

### Step 2 — inspect current main

Record current `main` SHA and recent commits.

### Step 3 — read durable checkpoint files

Read:

- `docs/checkpoints/latest.json`
- `docs/CURRENT_CHECKPOINT.md`

### Step 4 — inspect production commits after the checkpoint anchor

If there are production commits after `verifiedCodeSha`, understand them before deciding the next milestone.

### Step 5 — inspect open PRs and active work branches

If another agent already started the intended milestone, inspect that branch/PR and continue/reconcile it instead of creating a duplicate implementation.

### Step 6 — inspect CI

Distinguish:

- real test/build failure;
- workflow-definition failure;
- external provider failure;
- GitHub runner/infrastructure failure;
- zero-step/`runner_id: 0` failure.

Never claim validation passed when CI never executed.

### Step 7 — inspect roadmap and relevant feature docs

Verify the proposed work is genuinely missing.

### Step 8 — inspect existing implementation/tests

Reuse current modules, types, policies, scanners, host adapters, provider planners, package trust functions, and test fixtures rather than creating parallel subsystems.

### Step 9 — choose the smallest correct milestone

Prefer one coherent production milestone over unrelated changes.

### Step 10 — create/continue a dedicated branch

Recommended naming:

`work/p<id>-<short-description>`

Never commit substantial milestone work directly to `main`.

---

## 7. Parallel-agent safety — especially while ChatGPT Ultra and Antigravity may both work

This section is mandatory.

More than one agent may work on DockyardOS at different times. Assume remote state can change while you are working.

### Before starting a milestone

Always refresh:

- `main`;
- open PRs;
- active branches;
- latest checkpoint.

### Before every important push/PR merge

Refresh `main` again.

If `main` advanced, inspect the new commits before reconciling your branch.

### Never do these

- never force-push over another agent's branch;
- never reset `main` backwards;
- never overwrite newer files just to make your earlier patch apply;
- never recreate a milestone that another merged PR already completed;
- never silently delete another agent's checkpoint/docs/tests;
- never mark an old failing PR as authoritative if newer merged code superseded it;
- never assume an old branch name means active work.

### If the same milestone already has a branch/PR

Inspect:

- branch head;
- diff;
- PR description;
- comments/reviews;
- CI evidence;
- commits after its base.

Continue that work when safe instead of creating a competing implementation.

### If another agent merged newer code while you were working

Do not force the old branch over `main`.

Reconcile with the newer `main`, preserve both valid sets of work, rerun all relevant tests, and update the PR/checkpoint explanation.

If the newer work makes your milestone obsolete, stop and update the checkpoint rather than merging redundant code.

---

## 8. Implementation workflow for every production milestone

Use this sequence unless the feature's own docs require stricter steps.

### A. Discovery

- inspect current implementation;
- inspect relevant docs;
- inspect tests;
- inspect recent PRs for related work;
- inspect upstream/current external API/CLI behavior if the feature depends on an external platform.

### B. Architecture/plan

Write down:

- what is missing;
- what existing module should own it;
- trust/approval implications;
- persistence/checkpoint implications;
- host/provider/community/security boundaries;
- verification strategy.

Do not create a new subsystem when an existing one can be extended cleanly.

### C. Tests first or alongside implementation

Add deterministic tests for:

- successful behavior;
- boundary conditions;
- malformed input;
- stale/replay/tamper cases when applicable;
- approval failures;
- path/symlink traversal where filesystem mutation exists;
- credential/token leakage risk where external services are involved;
- fail-closed behavior.

Network/live-provider tests should be opt-in/focused, not required for every normal contributor PR unless already designed that way.

### D. Implement

Prefer small typed modules and reuse existing helpers/policies.

Avoid shell interpolation when argument-vector execution exists.

Do not persist secrets.

Do not expand permissions implicitly.

Do not change unrelated behavior merely to make a feature easier.

### E. Documentation

Update the relevant feature docs in the same milestone.

If the change alters architecture, trust model, host behavior, CLI/API contract, provider behavior, security behavior, community package behavior, release behavior, or user setup, documentation is part of the implementation—not optional follow-up work.

### F. Local/static verification

At minimum run the repository's current standard test/build commands. Current project conventions include `npm test`, registry verification, CLI smoke checks, and VSIX/bundled-Core checks where relevant.

Use the repository's existing focused workflows for the touched area.

### G. Draft PR

Open a draft PR early enough for exact-head CI to catch integration/build/package problems.

The PR body must describe:

- implemented behavior;
- safety/trust boundaries;
- verification performed;
- unresolved/manual/external gates;
- relationship to previous milestone/checkpoint.

### H. Exact-head CI

Do not merge based on an earlier green commit if the final head changed.

Require a real runner and real executed steps.

A zero-step infrastructure failure is not a passing run and not a code failure.

A genuine compiler/test failure must be fixed, not dismissed as infrastructure.

### I. Merge

Prefer the repository's established clean/squash history pattern when appropriate.

Pin the expected PR head for sensitive merges when the tooling supports it.

### J. Post-merge verification

Check merged `main`, not only the PR head.

Ensure no workflow parser/push-only defect appeared after merge.

### K. Update durable checkpoint immediately

After the production milestone is merged:

1. update `docs/CURRENT_CHECKPOINT.md`;
2. update `docs/checkpoints/latest.json`;
3. record exact merged code SHA;
4. record exact verification evidence;
5. set the next milestone;
6. commit/merge the checkpoint before unrelated later work.

This step is mandatory.

---

## 9. Documentation contract

Documentation is part of DockyardOS's state machine for future agents.

### Update by area

Use this map as guidance:

- core architecture/state/checkpoints -> `docs/ARCHITECTURE.md`
- capabilities/registry/selection -> `docs/CAPABILITY_MEGAREGISTRY.md`, capability registry docs
- curated packages/readiness -> `docs/CURATED_SKILL_MATERIALIZATION.md`
- recipes/agents/subagents/routing -> `docs/PRACTICAL_WORKFLOWS.md`
- providers/actions/fallback/pricing/migration -> provider docs
- security/scanners/exceptions/SARIF -> `docs/SECURITY.md` and milestone security docs
- hosts/plugin/MCP/native integration -> `docs/HOSTS.md`, `docs/HOST_NATIVE_MERGE.md`
- community packages/remote registries/update/signing -> `docs/COMMUNITY.md`
- publisher/key trust -> `docs/MAINTAINER_TRUST.md`
- transparency -> `docs/PACKAGE_TRANSPARENCY_ANCHOR.md`
- VS Code extension -> `integrations/vscode/README.md`
- release/real-host evidence -> `docs/RELEASES.md` and evidence docs
- monetization/public edition -> monetization/public-edition docs
- current continuation point -> `docs/CURRENT_CHECKPOINT.md` + `docs/checkpoints/latest.json`

### Do not duplicate truth unnecessarily

This guide explains how to operate the project. It should not become a duplicate copy of every feature specification.

Feature-specific details belong in their feature docs.

Checkpoint-specific current state belongs in checkpoint files.

Roadmap status belongs in `docs/ROADMAP.md`.

---

## 10. Security and trust invariants that must survive every future milestone

Do not weaken these unless there is an explicit reviewed design decision and corresponding tests/docs.

- No secret/token persistence in project checkpoints or committed files.
- Community code is untrusted until it passes current trust/quarantine policy.
- `--approve` never bypasses quarantine.
- Permission expansion/trust downgrade/risk increase cannot become unattended safe updates.
- Selected/configured capability does not equal connected/authorized capability.
- Provider/MCP connection does not equal permission for production mutation.
- Production/high-impact/destructive actions require their existing explicit approvals.
- Reviewers must remain independent from writer roles where the workflow requires independence.
- Missing required security tools/verification cannot produce false clean evidence.
- Security exceptions never erase raw findings.
- External targets/actions must stay explicit and authorized.
- Project-local mutation paths must remain bounded against traversal/symlink escape.
- External command output must remain bounded/redacted where current helpers provide this.
- Commercial relationships must not influence technical recommendations.

---

## 11. How to make decisions efficiently

DockyardOS should improve agent effectiveness, not create process overhead for trivial tasks.

Use the existing fast/standard/full workflow logic and practical recipes.

Examples:

### Tiny reversible change

Use a small scoped path:

inspect -> edit -> relevant test/lint -> verify -> checkpoint

Do not spawn an unnecessary large team.

### Substantial production feature

Use the full project workflow:

requirements/discovery -> architecture -> plan -> bounded specialist implementation -> verification -> security -> release -> checkpoint

### High-security feature

Preserve mandatory security gates and independent review.

### External provider mutation

Plan first, verify readiness/authentication, require current approval, perform mutation, verify result, store evidence.

### Unknown/new ecosystem capability

Do not blindly install it because it is popular. Evaluate provenance, compatibility, current maintenance, permissions, scripts/binaries, trust/risk, context cost, and project fit through the existing capability/community model.

---

## 12. Handling external/upstream changes

DockyardOS depends on external CLIs/APIs/skills/providers that can change.

Before implementing or repairing integrations:

- verify current official documentation/current CLI behavior;
- inspect current package/release versions where relevant;
- update tests to enforce the verified contract;
- distinguish current external failure from DockyardOS code failure;
- record durable evidence for real-host/live-provider verification when the project already has a pattern for it.

Do not preserve a stale command or API shape only because an older DockyardOS doc once mentioned it.

---

## 13. Antigravity-specific continuation behavior

Antigravity should be treated as a host/runtime for DockyardOS, not the whole DockyardOS architecture.

When using Antigravity:

- use the DockyardOS Antigravity plugin/integration already present in the repository;
- let DockyardOS restore project/team/checkpoint context;
- let PreInvocation/request mediation determine the current request/continuation state;
- preserve PreToolUse approval gates;
- preserve checkpoint hooks after successful mutating work;
- use specialist subagents only for roles/scopes allowed by the current recipe/routing;
- do not replace the external DockyardOS project state with Antigravity-only chat memory;
- do not create a parallel Antigravity-only skill registry that ignores DockyardOS registry/trust/readiness rules.

If Antigravity's own product/plugin behavior changes, verify the current official host contract and update DockyardOS's host adapter/tests/docs rather than bypassing the adapter.

---

## 14. What to do if the checkpoint is stale or contradictory

If `docs/CURRENT_CHECKPOINT.md`, `latest.json`, roadmap, main, and PRs disagree:

1. trust merged Git history and executed CI evidence first;
2. inspect the newest production PRs/commits;
3. determine the true latest completed milestone;
4. verify whether newer work is merged, draft, abandoned, or superseded;
5. repair the checkpoint/docs before starting another unrelated milestone;
6. never delete newer valid work just to make the old checkpoint true again.

A stale checkpoint should be fixed forward, not by rolling the project backward.

---

## 15. Final continuation rule

When asked to continue DockyardOS, the agent should be able to say internally:

> I have verified the current repository state, durable checkpoint, open/merged PRs, active branches, roadmap, relevant docs, tests, and CI. I know what is already implemented, what is actually unfinished, what safety boundaries apply, and which existing modules I must extend. I will continue the newest valid milestone without replaying completed work or overwriting newer changes.

Only after that preflight should implementation begin.
