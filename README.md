# DockyardOS

**Build. Orchestrate. Ship.**

DockyardOS is a persistent autonomous-development layer for coding agents. It adds project memory, resumable checkpoints, approval policy, adaptive specialist teams, a curated capability/provider registry, security gates, testing, and deployment orchestration around agent hosts such as Google Antigravity.

## What works now

- project identity and memory stored outside the repository
- manual, timed, and session-stop checkpoints
- Git status plus bounded patch capture for uncommitted tracked changes
- `dockyard resume` context recovery
- `dockyard doctor`
- Safe / Balanced / Autonomous approval modes
- Antigravity `PreInvocation`, `PreToolUse`, `PostToolUse`, and `Stop` hook integration
- broad skill/agent/tool/MCP catalogue with provenance, permissions, risk, host compatibility, context cost, and update channels
- practical project recipes and bounded adaptive specialist selection
- natural-language task classification through `dockyard recommend`
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
dockyard checkpoint --reason milestone --phase P3 --task "security execution" --next "agent team composer"
dockyard resume
```

DockyardOS project state is stored under `~/.dockyardos/projects/` rather than adding private runtime state to your application repository.

## Let DockyardOS choose the team

```bash
dockyard categories
dockyard catalog --query react --host antigravity

dockyard recommend \
  --task "Build a production SaaS dashboard" \
  --stack web,nextjs,react,supabase,postgres
```

DockyardOS matches the task against practical recipes, then scores compatible skills, agents, tools, MCPs, and providers. A large registry stays available for discovery, while only a bounded best-fit set is selected for the active workflow.

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

The plugin restores DockyardOS context before model invocations, gates risky tool actions, creates throttled checkpoints after successful mutating operations, and saves a final checkpoint when the Antigravity execution loop stops. For substantial work it routes through DockyardOS capability recommendations; infrastructure work uses provider inspection/planning; high-risk work can use the independent Dockyard security reviewer and runnable evidence gates.

## Approval philosophy

Balanced mode is the default:

- reversible project work can proceed automatically
- production deploys, destructive database actions, force pushes, infrastructure deletion, and sensitive operations force an approval prompt
- obviously machine-destructive commands are denied
- community capability updates do not silently gain new sensitive permissions
- production provider plans are read-only until explicit approval permits the mutation step
- remote dynamic security testing requires explicit authorization and never infers permission from public accessibility

## Provider philosophy

DockyardOS selects by **capability and fit**, not by brand. A project may prefer Supabase + Vercel + Cloudflare, while another may use Neon/Firebase/Appwrite/PocketBase plus Cloudflare/Render or another compatible combination. Availability, pricing/free-tier claims, and provider limits must be checked live at selection time rather than permanently hard-coded.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/CAPABILITY-REGISTRY.md`](docs/CAPABILITY-REGISTRY.md), [`docs/PROVIDERS.md`](docs/PROVIDERS.md), [`docs/SECURITY.md`](docs/SECURITY.md), and [`docs/ROADMAP.md`](docs/ROADMAP.md).
