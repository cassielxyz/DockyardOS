# DockyardOS

**Build. Orchestrate. Ship.**

DockyardOS is a persistent autonomous-development layer for coding agents. It adds project memory, resumable checkpoints, approval policy, adaptive specialist teams, a capability/provider registry, security gates, testing, and deployment orchestration around agent hosts such as Google Antigravity.

## What works now

- project identity and memory stored outside the repository
- manual, timed, and session-stop checkpoints
- Git status plus bounded patch capture for uncommitted tracked changes
- `dockyard resume` context recovery
- `dockyard doctor`
- Safe / Balanced / Autonomous approval modes
- Antigravity `PreInvocation`, `PreToolUse`, `PostToolUse`, and `Stop` hook integration
- architect, security-reviewer, and QA-reviewer subagents
- initial provider registry with Vercel, Cloudflare, Supabase and alternatives
- full/high-security workflow that requires OWASP review and Strix verification when applicable

## Local development

```bash
npm install
npm test
npm link

dockyard init
dockyard doctor
dockyard checkpoint --reason milestone --phase P0 --task "core runtime" --next "registry engine"
dockyard resume
```

DockyardOS project state is stored under `~/.dockyardos/projects/` rather than adding private runtime state to your application repository.

## Antigravity plugin

After building/linking the CLI, install the plugin directory:

```bash
agy plugin install ./integrations/antigravity/plugin
```

The plugin restores DockyardOS context before model invocations, gates risky tool actions, creates throttled checkpoints after successful mutating operations, and saves a final checkpoint when the Antigravity execution loop stops.

## Approval philosophy

Balanced mode is the default:

- reversible project work can proceed automatically
- production deploys, destructive database actions, force pushes, infrastructure deletion, and sensitive operations force an approval prompt
- obviously machine-destructive commands are denied

## Provider philosophy

DockyardOS selects by **capability and fit**, not by brand. A project may prefer Supabase + Vercel + Cloudflare, while another may use Neon/Firebase/Appwrite/PocketBase plus Cloudflare/Render or another compatible combination. Availability, pricing/free-tier claims, and provider limits must be checked live at selection time rather than permanently hard-coded.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/SECURITY.md`](docs/SECURITY.md), and [`docs/ROADMAP.md`](docs/ROADMAP.md).
