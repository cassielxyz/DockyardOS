# DockyardOS Roadmap

## P0 — Core runtime and checkpoints

- [x] Stable external project identity
- [x] Project state outside source repos
- [x] Manual checkpoints and resume
- [x] 5-minute throttled autosave hooks
- [x] Stop checkpoint
- [x] Git status + bounded patch capture
- [x] Doctor command
- [x] Safe / Balanced / Autonomous policy modes
- [x] Antigravity plugin skeleton using official hooks, skills, rules, and subagents
- [x] Initial provider/capability registry
- [x] OWASP + Strix high-security workflow path

## P1 — Registry and selection engine

- [x] Broad category catalogue of official, maintainer, community, and Dockyard capabilities
- [x] Source provenance metadata
- [x] Exact revision + SHA-256 capability lock format
- [x] Reject floating executable revisions
- [x] Host compatibility and permission metadata
- [x] Risk, context-cost, maturity, and maintenance metadata
- [x] Natural-language task classification
- [x] Task/stack/capability scoring
- [x] Practical project/task team recipes
- [x] Active skill/agent/tool/MCP budgets
- [x] Stable / recommended / edge / dev update channels
- [x] Permission/trust/risk update assessment
- [x] Quarantine / approval-required update decisions
- [ ] Cryptographic publisher signatures / transparency metadata
- [ ] Canary execution for newly approved capability versions
- [ ] Persisted success/failure metrics that tune future combination scores

## P2 — Provider connector layer

- [ ] GitHub connector adapter
- [ ] Vercel connector adapter
- [ ] Cloudflare connector adapter
- [ ] Supabase connector adapter
- [ ] Neon / Firebase / Appwrite / PocketBase alternatives
- [ ] Observability, email, storage, CI/CD provider categories
- [ ] Live availability and free-tier validation before provider selection
- [ ] Fallback and migration plans

## P3 — Security and verification

- [ ] OWASP web/API/mobile profiles
- [ ] Strix integration runner
- [ ] Gitleaks / OSV / Semgrep adapters
- [ ] Threat-model artifact
- [ ] Safe attack -> proof -> fix -> rerun workflow
- [ ] Dependency and secret policies

## P4 — Agent team composer

- [x] Initial adaptive role selection
- [ ] Phase-aware activation/deactivation
- [ ] Worktree isolation for parallel implementers
- [x] Independent security/QA role selection
- [x] Initial context budgets and progressive capability selection
- [ ] Failure learning and combination scoring

## P5 — Cross-host support

- [ ] VS Code extension
- [ ] Gemini CLI adapter
- [ ] Codex adapter
- [ ] Claude Code adapter
- [ ] Cursor / OpenCode adapters

## P6 — Community distribution

- [ ] Registry service
- [ ] Contribution validation CI
- [ ] Update signatures and rollback
- [ ] Package discovery UI
