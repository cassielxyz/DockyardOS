# DockyardOS

**Build. Orchestrate. Ship.**

DockyardOS is a persistent autonomous-development layer for coding agents. It adds project memory, resumable checkpoints, approval policy, adaptive specialist teams, a curated capability/provider registry, security gates, testing, provider planning, and cross-host orchestration.

You can use the same DockyardOS project state from **Google Antigravity, Gemini CLI, Codex, Claude Code, Cursor, OpenCode, and VS Code** instead of rebuilding context every time you change agent, account, model, or editor.

## What works now

- project identity and memory stored outside the application repository
- manual, timed, session-stop, and team-phase checkpoints
- Git status plus bounded patch capture for uncommitted tracked changes
- `continue`/resume context recovered from DockyardOS state rather than chat history alone
- Safe / Balanced / Autonomous approval modes
- broad skill/agent/tool/MCP catalogue with provenance, permissions, risk, host compatibility, context cost, and update channels
- practical project recipes and bounded adaptive specialist selection
- phase-aware teams: discovery → architecture → planning → implementation → verification → security → release
- persistent team runs with compact phase handoffs
- isolated Git worktrees for parallel implementation writers
- independent QA/security/release reviewers separated from implementation write roles
- conservative team/agent outcome learning for future routing
- provider detection and capability-based fallback planning across Vercel, Cloudflare, Supabase and alternatives
- `free-first` provider plans that require live pricing/free-tier validation before activation
- runnable OWASP-aligned web/API/mobile/LLM security profiles
- Gitleaks, OSV-Scanner, Semgrep, and opt-in budget-bounded Strix execution
- persistent threat-model and normalized security result artifacts outside source repositories
- proof → fix → same-scope rerun security regression gates
- local stdio `dockyard-mcp` server for structured context/team/checkpoint/policy access across hosts
- native/best-fit adapters for Antigravity, Gemini CLI, Codex, Claude Code, Cursor, OpenCode, and VS Code
- capability locks with exact revisions/content hashes and permission-aware update approval

## Install the core

```bash
npm install
npm test
npm link

dockyard init
dockyard doctor
dockyard resume
```

DockyardOS project state is stored under `~/.dockyardos/projects/` instead of adding private runtime state to your application repository.

## Start a real project team

For a substantial request:

```bash
dockyard team start \
  --task "Build a production SaaS dashboard" \
  --stack web,nextjs,react,supabase,postgres
```

DockyardOS chooses a bounded best-fit capability set and activates only the first relevant phase. Inspect it with:

```bash
dockyard team status
```

The lifecycle is:

```text
Discovery → Architecture → Planning → Implementation → Verification → Security → Release
```

Advance with durable evidence and decisions:

```bash
dockyard team advance \
  --artifact requirements.md \
  --decision "Use Postgres with row-level authorization"
```

The handoff carries the task, decisions, blockers, gates, outputs and relevant references—not the entire previous conversation.

## Switch agents without losing project state

Inspect supported hosts:

```bash
dockyard hosts list
dockyard hosts inspect
```

Get the exact portable context for a host:

```bash
dockyard hosts context --id codex
dockyard hosts context --id claude-code
dockyard hosts context --id gemini-cli
```

The same state is shared:

```text
Antigravity / Gemini / Codex / Claude / Cursor / OpenCode / VS Code
                              ↓
                 DockyardOS project identity
                              ↓
              ~/.dockyardos/projects/<project-id>
                              ↓
        checkpoints + team phase + decisions + gates
```

So moving from one supported agent to another does not create another project memory.

### Antigravity

```bash
agy plugin install ./integrations/antigravity/plugin
```

Uses native skills, specialist subagents, rules and lifecycle hooks for context restore, approval gating, autosave and final checkpoints.

### Gemini CLI

```bash
gemini extensions install ./integrations/gemini-cli --auto-update
```

The extension includes DockyardOS context, Agent Skill, local MCP tools, and lifecycle hooks for autosave, pre-compression checkpointing, and session-end checkpointing.

### Codex

`integrations/codex` contains the Codex plugin compatibility manifest, DockyardOS skill and local MCP configuration. Keep `dockyard` / `dockyard-mcp` on PATH and load/install the bundle through your Codex plugin workflow.

### Claude Code

`integrations/claude-code` contains `CLAUDE.md`, project `.mcp.json`, and the DockyardOS Claude skill. These files can be copied/linked into a project or packaged into your Claude Code distribution setup.

### Cursor

`integrations/cursor` contains an always-on `.cursor/rules/dockyardos.mdc` rule and project `.cursor/mcp.json`.

### OpenCode

`integrations/opencode` contains the MCP config, compact `AGENTS.md`, and an independent read-only Dockyard reviewer subagent.

### VS Code

Build/package the install-once control extension:

```bash
cd integrations/vscode
npm install
npm run build
npm run package
```

Install the resulting VSIX once. Each project only needs **DockyardOS: Initialize Project** once. The extension exposes Doctor, Resume Context, Checkpoint, Team Start/Status/Advance, and a status-bar view of the active DockyardOS phase.

See [`docs/CROSS-HOST.md`](docs/CROSS-HOST.md) for the adapter architecture and verification flow.

## Local MCP surface

`dockyard-mcp` runs over local stdio; it does not open a network listener. Current tools are intentionally limited to orchestration/state:

- `dockyard_context`
- `dockyard_recommend`
- `dockyard_team_start`
- `dockyard_team_status`
- `dockyard_team_advance`
- `dockyard_checkpoint`
- `dockyard_policy`

Provider mutations, secrets, arbitrary shell execution, DNS changes, destructive DB actions, and production deployment are not silently exposed through this MCP surface.

## Parallel implementation without agents overwriting each other

During implementation, writer roles can receive isolated Git worktrees:

```bash
dockyard team worktree create \
  --run <team-run-id> \
  --task-id auth-api \
  --agent backend-agent
```

Worktrees live under DockyardOS external project state. Reviewer-only roles cannot receive writer worktrees.

## Provider planning

Inspect existing readiness:

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

DockyardOS prefers compatible existing setup where useful, keeps ranked fallbacks, surfaces migration caveats, and does not pretend different auth/storage/realtime/security models are interchangeable. Free-tier availability and limits must be checked live at selection time.

## Security verification

```bash
dockyard security profiles
dockyard security threat-model --profile web
dockyard security plan --profile web --target . --target-type source --mode standard
dockyard security scan --profile web --target . --target-type source --mode standard
```

Missing required scanners produce an `incomplete` result rather than a false clean result. Remote security targets require explicit authorization, and Strix is opt-in with an explicit positive budget.

After a verified finding is fixed, rerun the same scope and compare:

```bash
dockyard security compare --before <first>/result.json --after <rerun>/result.json
```

## Approval philosophy

Balanced mode is the default:

- reversible project work can proceed automatically
- parallel writers are isolated and bounded
- independent reviewers do not self-approve implementation work
- production deploys, destructive database actions, force pushes, infrastructure deletion, DNS changes, secret operations and equivalent sensitive actions require approval
- obviously machine-destructive commands are denied
- community capability updates cannot silently gain new sensitive permissions
- remote dynamic security testing requires explicit authorization
- every host keeps its own native sandbox/permission system; DockyardOS adds another safety layer rather than bypassing it

## Project docs

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- [`docs/CAPABILITY-REGISTRY.md`](docs/CAPABILITY-REGISTRY.md)
- [`docs/PROVIDERS.md`](docs/PROVIDERS.md)
- [`docs/SECURITY.md`](docs/SECURITY.md)
- [`docs/CROSS-HOST.md`](docs/CROSS-HOST.md)
- [`docs/ROADMAP.md`](docs/ROADMAP.md)
