# DockyardOS

**Build. Orchestrate. Ship.**

DockyardOS is a persistent autonomous-development layer for coding agents. It adds project memory, resumable checkpoints, approval policy, adaptive specialist teams, a curated capability/provider registry, security gates, testing, cross-host continuity, and safe community capability distribution around hosts such as Google Antigravity, Gemini CLI, Codex, Claude Code, Cursor, OpenCode, and VS Code.

## What works now

- project identity and memory stored outside the repository
- manual, timed, session-stop, and team-phase checkpoints
- `dockyard resume` context recovery
- Safe / Balanced / Autonomous approval modes
- broad skill/agent/tool/MCP catalogue with provenance, permissions, risk, compatibility, context cost, and update channels
- practical project recipes and bounded adaptive specialist selection
- phase-aware teams: discovery → architecture → planning → implementation → verification → security → release
- persistent team runs restored across sessions/accounts/models/agent hosts
- compact phase handoffs instead of replaying full chat transcripts
- isolated Git worktrees for parallel implementation writers
- independent QA/security/release reviewers separated from implementation write roles
- conservative team/agent outcome learning for future routing
- provider detection and capability-based fallback planning across Vercel, Cloudflare, Supabase and alternatives
- approval-gated authenticated provider actions for GitHub, Vercel, Cloudflare, and Supabase
- sequential verified preview provisioning across supported web/database/workflow providers
- runnable OWASP-aligned web/API/mobile/LLM security profiles
- Gitleaks, OSV-Scanner, Semgrep, and opt-in budget-bounded Strix execution
- proof → fix → same-scope rerun security regression gates
- portable Agent Skill and verified host adapters for Antigravity, Gemini CLI, Codex/Agents, Claude Code, Cursor, and OpenCode
- local stdio `dockyard-mcp` bridge for structured continuity across supported hosts
- one-time VS Code extension with a bundled DockyardOS Core fallback
- safe community package registry with quarantine, signatures, permission assessment, immutable versions, rollback, and local transparency metadata
- signed, size-bounded remote community registry synchronization with replay/equivocation protection
- collision-safe effective registry that can expose unique verified remote packages without allowing remote shadowing
- stored manifest snapshots so installed remote capabilities remain usable offline
- automatic-only safe update checking/application with no approval bypass
- local Ed25519 publisher/registry signing workflow without exposing private-key material
- fail-closed Docker/Podman dynamic canaries for quarantined capability code
- clearly separated sponsored/affiliate partner offers that never influence technical ranking, security, provider choice, or agent decisions
- one external DockyardOS state shared by every supported host

## Verified real-host compatibility

On 2026-09-28, DockyardOS Real Host Matrix run `36425594147` passed all six installed-host lanes against exact merged `main` commit `854434f26e6c084dba6d6e532ff689db60ced77f`:

- Google Antigravity (`agy`)
- Gemini CLI (`gemini`)
- OpenAI Codex (`codex`)
- Claude Code (`claude`)
- Cursor (`agent`)
- OpenCode (`opencode`)

The matrix installed the public host CLIs through their recorded installation mechanisms, verified each executable, and exercised DockyardOS host inspection/doctor/integration. The Antigravity lane also verified CLI-managed plugin discovery with `agy plugin install` followed by `agy plugin list`. The matrix did not authenticate to model providers, send prompts, or use model API keys.

See [`docs/REAL_HOST_MATRIX_EVIDENCE_2026-09-28.md`](docs/REAL_HOST_MATRIX_EVIDENCE_2026-09-28.md) for the exact run, job IDs, retained artifact IDs, and SHA-256 digests.

## Install once, use across projects

The normal user-facing setup is the VS Code extension. Release packaging puts DockyardOS Core inside the VSIX, so normal extension use does not require a separate global CLI.

After installing the VSIX:

1. Open a project folder.
2. Run `DockyardOS: Initialize Project` once for that project.
3. Run `DockyardOS: Install/Update Agent Host Integration` once for the agent host you use.
4. Give your requirement to the agent in normal language.
5. DockyardOS restores/creates the team workflow, selects bounded capabilities, checkpoints progress, and resumes later from the same external state.

Project/team state lives under:

```text
~/.dockyardos/projects/<project-id>/
```

Community capability state lives under:

```text
~/.dockyardos/community/
```

Local signing keys live separately under:

```text
~/.dockyardos/signing-keys/
```

It is not duplicated into `.claude`, `.cursor`, `.opencode`, or another host directory. Switching agent hosts therefore does not fork the project's memory.

See [`integrations/vscode/README.md`](integrations/vscode/README.md) for VSIX behavior and [`docs/HOSTS.md`](docs/HOSTS.md) for the host matrix.

## CLI development / advanced use

```bash
npm install
npm test
npm link

dockyard init
dockyard doctor
dockyard resume
```

Inspect and install host integrations:

```bash
dockyard host list
dockyard host inspect
dockyard host plan --host cursor --scope user
dockyard host install --host cursor --scope user
dockyard host doctor --host cursor
```

DockyardOS refuses to silently replace a different existing portable skill. Project scope is available when you intentionally want integration files in a repository; user scope is preferred for one installation across projects when the host supports it.

## Start a real project team

For substantial work:

```bash
dockyard team start \
  --task "Build a production SaaS dashboard" \
  --stack web,nextjs,react,supabase,postgres
```

DockyardOS selects a bounded best-fit capability set, creates the project/team checkpoint, and activates only the first relevant phase.

```bash
dockyard team status
```

Normal lifecycle:

```text
Discovery → Architecture → Planning → Implementation → Verification → Security → Release
```

When a phase is complete, save durable evidence/decisions and advance:

```bash
dockyard team advance \
  --artifact requirements.md \
  --decision "Use Postgres with row-level authorization"
```

The handoff carries decisions, blockers, required gates, outputs, and relevant context—not the full previous transcript.

If work is blocked:

```bash
dockyard team block --reason "Preview database is unavailable" --agent database-agent
dockyard team unblock
```

A stopped supported host can recover the active Dockyard team/phase through shared project state, so a later **continue** does not depend on reconstructing the project from one chat transcript.

## Parallel implementation without agents overwriting each other

During implementation, logical writer roles can receive isolated Git worktrees:

```bash
dockyard team worktree create \
  --run <team-run-id> \
  --task-id auth-api \
  --agent backend-agent
```

Worktrees are stored in DockyardOS external project state. DockyardOS enforces the phase's parallel-writer budget and refuses writer worktrees for reviewer-only roles.

## Safe community capabilities

DockyardOS separates **discovery** from **execution**. A repository can appear in a discovery catalogue without becoming installable. Installation requires an explicit DockyardOS package manifest with a declared source, ref, entrypoints, permissions, trust/risk metadata, host compatibility, license, size limits, and signature policy.

Browse from VS Code with:

```text
DockyardOS: Browse Community Packages
```

Or use the CLI:

```bash
dockyard community list
dockyard community search --query debugging
dockyard community inspect --id superpowers-core-skills
dockyard community resolve --id superpowers-core-skills
```

Resolution happens in an external quarantine directory. DockyardOS resolves the moving upstream ref to an immutable Git commit, checks package size/file limits, rejects symlinks/special files, verifies declared entrypoints, inspects scripts/binaries/install lifecycle hooks, infers permissions, applies signature policy, and produces one of:

```text
automatic | approval-required | quarantine
```

A package requiring approval can be installed only after review:

```bash
dockyard community install --id <package> --approve
```

`--approve` never bypasses quarantine.

Installed revisions are immutable and stored separately, so rollback does not need to re-fetch upstream:

```bash
dockyard community status --id <package>
dockyard community rollback --id <package>
```

Community-trust packages require a valid Ed25519 manifest signature from a trusted Dockyard publisher key. Updates are re-approved if permissions expand, trust decreases, or risk increases.

### Signed remote registries and the effective registry

Remote registries are disabled by default. When explicitly configured, DockyardOS requires HTTPS, an exact allowed hostname, a trusted Ed25519 registry key, response-size and age limits, and a trust ceiling. Signed envelope sequences protect against replay/rollback and same-sequence equivocation.

```bash
dockyard community remote sources
dockyard community remote sync
dockyard community remote cached
```

After successful synchronization, DockyardOS builds an **effective registry** from the bundled registry plus only re-verified, non-expired remote caches. A unique remote package can appear in `community list/search/inspect/resolve/install`, but a remote package can never shadow a bundled package. If two remotes claim the same package ID, every conflicting remote claim is excluded until the ambiguity is resolved.

Remote provenance is carried with effective-registry results. Installing a remote package still uses the same P6 quarantine, publisher-signature, permission, immutable-resolution, integrity, approval, activation, transparency, and rollback boundaries. DockyardOS stores the exact assessed manifest snapshot beside external community state so an already installed immutable remote capability remains self-describing and usable offline even if the registry cache later expires.

### Safe community updates

Check active packages against their current effective-registry candidates:

```bash
dockyard community updates check
dockyard community updates check --id <package>
```

Apply only updates that remain eligible for **automatic** activation after a fresh pinned assessment:

```bash
dockyard community updates apply-safe
dockyard community updates apply-safe --id <package>
```

`apply-safe` never supplies `--approve`. Permission expansion, trust downgrade, risk increase, invalid/missing signatures, quarantine findings, ambiguous/missing manifests, or any other approval-required state is skipped rather than silently accepted. The candidate is resolved and assessed again with the exact reviewed revision/content digest before activation, so an upstream ref moving between check and apply cannot be substituted silently.

### Publisher signing

Generate local Ed25519 signing keys and sign manifests without printing private-key material:

```bash
dockyard community publisher keygen --id <publisher> --key-id <key>
dockyard community publisher sign --file manifest.json --key-id <key> --out manifest.signed.json
```

Registry operators can similarly use `dockyard community registry-key keygen|sign`. Private key files are created with mode `0600` under DockyardOS external state.

### Isolated dynamic canaries

Quarantined capability code can be tested explicitly with Docker or Podman:

```bash
dockyard community canary plan \
  --id <package> \
  --image <image>@sha256:<digest> \
  --command <direct-command>

dockyard community canary run \
  --id <package> \
  --image <image>@sha256:<digest> \
  --command <direct-command>
```

DockyardOS refuses floating image tags, auto-pulls, direct host fallback, network access, writable package mounts, elevated Linux capabilities, or unbounded CPU/memory/PIDs/time/output. Missing backend/image produces `unavailable`, never a false pass.

See [`docs/COMMUNITY.md`](docs/COMMUNITY.md) for the complete distribution, remote-registry, signing, effective-registry, update, and canary trust model.

## Let DockyardOS choose providers

Inspect existing readiness without remote account calls:

```bash
dockyard providers inspect
```

Plan by capability rather than brand:

```bash
dockyard providers plan \
  --capability web-hosting,postgres,auth,object-storage \
  --stack web,nextjs,postgres \
  --environment preview \
  --free-first
```

The planner prefers compatible existing setup where useful, keeps ranked fallbacks, surfaces migration caveats, and does not pretend DNS/WAF/DDoS or different auth/realtime/storage models are interchangeable. `free-first` requires current pricing/free-tier validation before activation.

### Authenticated provider actions

Provider selection and provider mutation are separate decisions. Inspect the bounded write actions DockyardOS exposes:

```bash
dockyard providers actions
dockyard providers actions --provider vercel
```

Plan an action without changing anything:

```bash
dockyard providers action plan \
  --provider vercel \
  --action preview-deploy \
  --environment preview \
  --param prebuilt=true
```

Run only after explicit mutation approval:

```bash
dockyard providers action run \
  --provider vercel \
  --action preview-deploy \
  --environment preview \
  --approve
```

P9 supports bounded actions for GitHub, Vercel, Cloudflare, and Supabase. It verifies live authentication immediately before mutation, requires verified project linkage where the action depends on it, validates provider-specific inputs, executes with argv rather than shell interpolation, bounds/redacts output, and stores action evidence under DockyardOS external project state.

Production actions require an additional `--approve-production`; a normal `--approve` alone is insufficient.

### Verified preview provisioning

Compose a preview database branch and web deployment into one plan:

```bash
dockyard providers preview plan \
  --database supabase \
  --web vercel \
  --param supabase.project-ref=<project-ref> \
  --param supabase.branch=feature-login \
  --param vercel.prebuilt=true
```

Execute the reviewed plan with:

```bash
dockyard providers preview run \
  --database supabase \
  --web vercel \
  --param supabase.project-ref=<project-ref> \
  --param supabase.branch=feature-login \
  --param vercel.prebuilt=true \
  --approve
```

Supported web targets are `vercel`, `cloudflare-pages`, and `cloudflare-worker`; optional `--database supabase` and `--workflow github` steps can be composed. Steps run sequentially and each provider mutation must pass post-action verification before the next one starts. The sequence stops on the first failure or unverifiable result instead of claiming a partially provisioned preview is healthy. Preview orchestration contains no production actions.

See [`docs/PROVIDERS.md`](docs/PROVIDERS.md) for the action matrix, parameter boundaries, verification model, and production approval rules.

## Security verification

```bash
dockyard security profiles
dockyard security threat-model --profile web
dockyard security plan --profile web --target . --target-type source --mode standard
dockyard security scan --profile web --target . --target-type source --mode standard
```

DockyardOS stores normalized evidence outside the source repository. Missing required scanners produce `incomplete`, not a false clean result. Remote security targets require explicit authorization, and Strix is opt-in with an explicit positive budget.

After a verified finding is fixed:

```bash
dockyard security compare --before <first>/result.json --after <rerun>/result.json
```

The gate fails when high/critical findings remain or are newly introduced, or when the rerun is incomplete/error.

## Antigravity full plugin

Antigravity gets the richest current integration because its native plugin/hook lifecycle is available:

```bash
dockyard host install --host antigravity --scope user
```

The plugin restores project/team context before invocations, gates risky tool actions, checkpoints mutating work, and saves a final checkpoint on stop. It also includes independent architecture/security/QA workers and a reusable scoped implementation worker.

Other hosts use the portable skill and verified native mechanisms available to them; DockyardOS does not falsely claim identical hook/subagent behavior where the host does not expose it.

## Commercial neutrality and partner offers

DockyardOS can show clearly labeled sponsored or affiliate partner offers in a separate **Partners** area. Those offers are commercially separate from the decision engine: partner relationships never change capability scores, provider fallback order, pricing/free-tier evidence, security decisions, agent/subagent selection, package trust, approval requirements, or research conclusions.

The extension uses text-only offers with explicit disclosure, curated HTTPS destination allowlists, no third-party ad JavaScript, no remote ad images or tracking pixels, and no DockyardOS click telemetry. Release-time and optional hosted partner feeds accept only the documented public partner URL variables; deployment/API credentials are never part of that feed.

See [`docs/MONETIZATION.md`](docs/MONETIZATION.md) for the operator setup, approved partner surfaces, configuration names, and website/docs-only ad-network guidance.

## Approval philosophy

Balanced mode is the default:

- reversible project work can proceed automatically
- parallel writers are isolated and bounded
- independent reviewers do not share implementation write roles
- every authenticated provider mutation requires explicit approval
- production provider mutations require an additional production-specific approval
- production deploys, destructive database actions, force pushes, infrastructure deletion, DNS changes, secret rotation, and sensitive operations require approval
- obviously machine-destructive commands are denied
- community capability updates do not silently gain new sensitive permissions
- remote registries cannot shadow bundled packages or win ambiguous ID collisions
- safe update application never auto-approves an approval-required candidate
- dynamic community canaries never fall back to direct host execution
- remote dynamic security testing requires explicit authorization and never infers permission from public accessibility

## Provider philosophy

DockyardOS selects by **capability and fit**, not by brand. A project may prefer Supabase + Vercel + Cloudflare, while another may use Neon/Firebase/Appwrite/PocketBase plus Cloudflare/Render or another compatible combination. Availability, pricing/free-tier claims, and provider limits are live facts and must not be permanently hard-coded.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/CAPABILITY-REGISTRY.md`](docs/CAPABILITY-REGISTRY.md), [`docs/PROVIDERS.md`](docs/PROVIDERS.md), [`docs/SECURITY.md`](docs/SECURITY.md), [`docs/HOSTS.md`](docs/HOSTS.md), [`docs/COMMUNITY.md`](docs/COMMUNITY.md), [`docs/MONETIZATION.md`](docs/MONETIZATION.md), and [`docs/ROADMAP.md`](docs/ROADMAP.md).
