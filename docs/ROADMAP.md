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

- [x] Safe local provider detection framework
- [x] Optional read-only live auth/status probes with timeout/output redaction
- [x] GitHub / Vercel / Cloudflare / Supabase detection adapters
- [x] Neon / Firebase / Appwrite / PocketBase detection alternatives
- [x] Render / Railway / Fly.io / Turso / Sentry / Cloud Run detection metadata
- [x] Capability-based provider fallback chains
- [x] Stack/readiness/preference/environment-aware provider planner
- [x] Free-first decisions marked for live pricing/availability validation
- [x] Explicit migration/compatibility warnings instead of false drop-in equivalence
- [x] Production provider plans marked approval-required before mutation
- [ ] Authenticated action adapters for GitHub, Vercel, Cloudflare, and Supabase
- [ ] Authenticated action adapters for alternative providers
- [ ] Live pricing/free-tier metadata fetchers with freshness timestamps
- [ ] Provider outage/health verification
- [ ] Automated preview provisioning and verification
- [ ] Migration executors with rollback artifacts

## P3 — Security and verification

- [x] OWASP Web 2025 / API 2023 / Mobile 2024 / GenAI-LLM 2026 profiles
- [x] Project-root security scope enforcement and explicit remote-target authorization
- [x] Gitleaks runner + normalized findings
- [x] OSV-Scanner runner + normalized findings
- [x] Semgrep CE runner + normalized findings
- [x] Strix headless runner with explicit budget and completed-run verification
- [x] External security run artifacts and normalized `result.json`
- [x] Profile-aware threat-model artifact
- [x] Scan/evidence -> fix -> same-scope rerun -> regression gate workflow
- [x] Missing required scanner cannot produce a clean result
- [x] Antigravity security-reviewer workflow integration
- [ ] Project-specific secret allowlists/baselines and expiry policy
- [ ] Dependency exception policy with owner/expiry/rationale
- [ ] SARIF aggregation/export for code-host security dashboards

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
