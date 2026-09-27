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
- [x] Persisted team/agent success-failure metrics with conservative routing adjustment
- [ ] Cryptographic publisher signatures / transparency metadata
- [ ] Canary execution for newly approved capability versions

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

- [x] Adaptive role selection from curated recipes/capability scoring
- [x] Phase-aware activation/deactivation
- [x] Persistent resumable team-run state linked to checkpoints
- [x] Compact context handoffs instead of full-transcript replay
- [x] Worktree isolation for parallel implementers
- [x] Parallel writer budgets and writer-role enforcement
- [x] Independent security/QA/release review roles
- [x] Context budgets and progressive phase capability loading
- [x] Reusable Antigravity scoped phase-worker
- [x] Failure/blocker persistence and explicit unblock/fail flow
- [x] Team/agent outcome learning with conservative history weighting
- [x] Antigravity pre-invocation team/phase restoration for `continue`

## P5 — Cross-host support

- [x] Host-independent portable DockyardOS Agent Skill
- [x] Verified host capability/install metadata with documentation provenance
- [x] Antigravity full plugin adapter
- [x] Gemini CLI portable skill adapter and extension-aware plan
- [x] OpenAI Codex / Agents capability-directory and plugin-aware adapter
- [x] Claude Code personal/project skill adapter
- [x] Cursor portable `.agents/skills` adapter
- [x] OpenCode portable/interoperable skill adapter
- [x] Cross-host `dockyard host list|inspect|plan|install|doctor`
- [x] One external Dockyard project/team state shared by every host
- [x] Safe idempotent skill install with no silent overwrite
- [x] VS Code extension command/status surface
- [x] VS Code VSIX bundled Core fallback (no separate CLI required for normal packaged use)
- [x] Reproducible VSIX CI artifact workflow
- [x] Local stdio `dockyard-mcp` bridge for context/recommend/team/checkpoint/policy
- [x] Workspace-explicit MCP tools to prevent plugin/cache directory project confusion
- [x] Optional native Gemini extension + lifecycle bridge
- [x] Optional Codex compatibility plugin + MCP bridge
- [x] Review-first Claude Code / Cursor / OpenCode MCP/instruction templates
- [x] Read-only OpenCode independent reviewer template
- [x] Native bridge metadata surfaced through host list/doctor/native-info
- [x] MCP runtime/dependencies/native templates included in bundled VSIX Core with package-level CI assertions
- [ ] Publish VS Code Marketplace listing/release channel
- [ ] Safe automatic merge/install of review-first native project files without clobbering existing host config
- [ ] Cross-host end-to-end matrix tests against installed real host CLIs in opt-in CI environments

## P6 — Community distribution

- [ ] Registry service
- [ ] Contribution validation CI
- [ ] Safe fetch/install/update engine for selected community capabilities
- [ ] Cryptographic update signatures and rollback
- [ ] Canary/sandbox evaluation before activation
- [ ] Package discovery UI
