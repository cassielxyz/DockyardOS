# DockyardOS

**Build. Orchestrate. Ship.**

DockyardOS is a persistent autonomous-development layer for coding agents. It adds project memory, resumable checkpoints, approval policy, adaptive specialist teams, a curated capability/provider registry, security gates, testing, and deployment orchestration around agent hosts such as Google Antigravity.

## What works now

- project identity and memory stored outside the repository
- manual, timed, session-stop, and team-phase checkpoints
- Git status plus bounded patch capture for uncommitted tracked changes
- `dockyard resume` context recovery
- Safe / Balanced / Autonomous approval modes
- Antigravity `PreInvocation`, `PreToolUse`, `PostToolUse`, and `Stop` hook integration
- broad skill/agent/tool/MCP catalogue with provenance, permissions, risk, host compatibility, context cost, and update channels
- practical project recipes and bounded adaptive specialist selection
- phase-aware teams: discovery → architecture → planning → implementation → verification → security → release
- persistent team runs restored across sessions/accounts/models through external DockyardOS state
- compact phase handoffs instead of replaying full chat transcripts
- isolated Git worktrees for parallel implementation writers
- independent QA/security/release reviewers separated from implementation write roles
- conservative team/agent outcome learning for future routing
- provider detection and capability-based fallback planning across Vercel, Cloudflare, Supabase and alternatives
- local-only provider inspection plus optional safe live account/status probes
- `free-first` provider plans that require live pricing/free-tier validation before activation
- runnable OWASP-aligned web/API/mobile/LLM security profiles
- Gitleaks, OSV-Scanner, Semgrep, and opt-in budget-bounded Strix execution
- persistent threat-model and normalized security result artifacts outside source repositories
- proof → fix → same-scope rerun regression gates
- capability locks with exact revisions/content hashes and permission-aware update approval

## Local development

```bash
npm install
npm test
npm link

dockyard init
dockyard doctor
dockyard resume
```

DockyardOS project state is stored under `~/.dockyardos/projects/` rather than adding private runtime state to your application repository.

## Start a real project team

You can still inspect recommendations directly:

```bash
dockyard recommend \
  --task "Build a production SaaS dashboard" \
  --stack web,nextjs,react,supabase,postgres
```

For substantial work, start a resumable DockyardOS team instead:

```bash
dockyard team start \
  --task "Build a production SaaS dashboard" \
  --stack web,nextjs,react,supabase,postgres
```

DockyardOS selects the bounded best-fit capabilities, creates the project/team checkpoint, and activates only the first relevant phase. Inspect it with:

```bash
dockyard team status
```

The normal lifecycle is:

```text
Discovery → Architecture → Planning → Implementation → Verification → Security → Release
```

When a phase is complete, save durable evidence/decisions and advance:

```bash
dockyard team advance \
  --artifact requirements.md \
  --decision "Use Postgres with row-level authorization"
```

The returned handoff is intentionally compact. It carries the task, decisions, unresolved blockers, required gates, phase outputs and relevant context—not the full previous transcript.

If work is blocked:

```bash
dockyard team block --reason "Preview database is unavailable" --agent database-agent
dockyard team unblock
```

A stopped Antigravity session still saves the active team run/phase in the project checkpoint, so a later **continue** can recover the correct phase instead of reconstructing the project from chat history.

## Parallel implementation without agents overwriting each other

During the implementation phase, logical writer roles can receive isolated Git worktrees:

```bash
dockyard team worktree create \
  --run <team-run-id> \
  --task-id auth-api \
  --agent backend-agent
```

Worktrees are stored in DockyardOS external project state rather than inside the application repository. DockyardOS enforces the phase's parallel-writer budget and refuses worktrees for reviewer-only roles.

The Antigravity plugin includes a reusable `dockyard-phase-worker` that receives one logical role, one scoped task, acceptance criteria, relevant context, and the isolated worktree path. Independent QA/security/release reviewers remain separate and do not self-approve implementation work.

## Team learning

DockyardOS stores recipe/agent outcomes outside the repository. Repeated successful or blocked runs produce a small historical routing adjustment for the same task class. The adjustment is deliberately conservative and cannot override required security gates, trust rules, explicit preferences, or provider requirements.

```bash
dockyard team metrics
```

## Let DockyardOS choose providers

Inspect existing project/provider readiness without remote account calls:

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

The planner prefers compatible existing setup where useful, keeps ranked fallbacks, surfaces migration caveats, and does not pretend DNS/WAF/DDoS or different auth/realtime/storage models are interchangeable. Add `--live` only when read-only account readiness is necessary for the decision.

## Security verification

List the available security baselines and build a project-scoped plan:

```bash
dockyard security profiles
dockyard security threat-model --profile web
dockyard security plan --profile web --target . --target-type source --mode standard
```

Run the configured source security gates when the scanner tools are installed:

```bash
dockyard security scan --profile web --target . --target-type source --mode standard
```

DockyardOS normalizes findings into external project-state artifacts. Missing required scanners produce an `incomplete` result rather than a false clean result. Remote security targets require explicit authorization, and Strix is opt-in with an explicit positive budget.

After a verified finding is fixed, rerun the same scope and compare the two `result.json` files:

```bash
dockyard security compare --before <first>/result.json --after <rerun>/result.json
```

The regression gate fails when high/critical findings remain or are newly introduced, or when the rerun is incomplete/error.

## Antigravity plugin

After building/linking the CLI, install the plugin directory:

```bash
agy plugin install ./integrations/antigravity/plugin
```

The plugin restores DockyardOS project and team context before model invocations, gates risky tool actions, checkpoints mutating work, and saves a final checkpoint when the Antigravity execution loop stops. Substantial requests can be routed through `dockyard team start`, infrastructure work uses provider inspection/planning, isolated implementation can use `dockyard-phase-worker`, and high-risk work uses independent security verification.

## Approval philosophy

Balanced mode is the default:

- reversible project work can proceed automatically
- parallel writers are isolated and bounded rather than unrestricted
- independent reviewers do not share implementation write roles
- production deploys, destructive database actions, force pushes, infrastructure deletion, and sensitive operations force an approval prompt
- obviously machine-destructive commands are denied
- community capability updates do not silently gain new sensitive permissions
- production provider plans are read-only until explicit approval permits the mutation step
- remote dynamic security testing requires explicit authorization and never infers permission from public accessibility

## Provider philosophy

DockyardOS selects by **capability and fit**, not by brand. A project may prefer Supabase + Vercel + Cloudflare, while another may use Neon/Firebase/Appwrite/PocketBase plus Cloudflare/Render or another compatible combination. Availability, pricing/free-tier claims, and provider limits must be checked live at selection time rather than permanently hard-coded.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/CAPABILITY-REGISTRY.md`](docs/CAPABILITY-REGISTRY.md), [`docs/PROVIDERS.md`](docs/PROVIDERS.md), [`docs/SECURITY.md`](docs/SECURITY.md), and [`docs/ROADMAP.md`](docs/ROADMAP.md).
