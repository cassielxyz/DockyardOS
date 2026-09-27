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
- [x] Ed25519 community package signature verification + trusted/revoked key registry
- [x] Local tamper-evident package transparency metadata
- [x] Sandboxed dynamic canary runner for quarantined executable capability versions
- [ ] External/public transparency anchoring

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
- [x] Authenticated action adapters for GitHub, Vercel, Cloudflare, and Supabase
- [ ] Authenticated action adapters for alternative providers
- [ ] Live pricing/free-tier metadata fetchers with freshness timestamps
- [ ] Provider outage/health verification
- [x] Automated preview provisioning and verification
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

- [x] Bundled registry with installable manifests separated from broad discovery sources
- [x] GitHub-only safe fetcher that resolves moving refs to immutable commits
- [x] Quarantine directories outside project repositories
- [x] Isolated Git configuration/hooks/credentials/LFS behavior during quarantine fetch
- [x] Fetched Git object-size cap plus filesystem entry/depth/file/byte limits
- [x] Symlink/special-file rejection and executable-mode-sensitive deterministic hashes
- [x] Explicit entrypoint validation and Agent Skill structural canary
- [x] Script/binary/install-lifecycle detection and conservative permission inference
- [x] Automatic / approval-required / quarantine assessment
- [x] Community-trust Ed25519 signature requirement with trusted/revoked key registry
- [x] Approval pinning to exact assessed revision + content digest
- [x] Pre-copy and post-copy integrity verification before activation
- [x] Immutable installed version directories and active revision pointer
- [x] Update re-approval on permission expansion, trust downgrade, or risk increase
- [x] Offline rollback with target integrity verification
- [x] Local tamper-evident hash-chained transparency log
- [x] Community list/search/inspect/resolve/install/update/status/active/read/rollback/transparency CLI
- [x] Integrity-verified active package/declared-entrypoint MCP tools for cross-host use
- [x] Basic manifest-first VS Code community package browser with quarantine/approval flow
- [x] Community runtime data bundled into VSIX Core with package-level CI assertions
- [x] Deterministic non-network tests for registry/signature/approval/update/activation/rollback/transparency logic
- [x] Signed/size-bounded remote registry synchronization and verified cache history
- [x] Sandboxed fail-closed dynamic canary execution for quarantined community capabilities
- [x] Publisher + remote-registry Ed25519 key generation/signing workflow
- [x] Collision-safe effective registry across bundled + verified remote manifests
- [x] Automatic-only safe update check/apply flow with no approval bypass
- [x] Offline installed-manifest snapshots for remote package runtime continuity
- [ ] Registry contribution-validation service/CI for third-party submissions
- [ ] Publisher key rotation/revocation UX and migration guidance
- [ ] External/public transparency anchoring
- [ ] Safe automatic install/merge for host-native project config bundles
- [ ] Rich searchable package marketplace/discovery UI in VS Code

## P7 — Signed registry sync and sandboxed community canaries

- [x] Remote source configuration with exact HTTPS hostname and trust ceiling
- [x] Ed25519 signed registry envelope verification
- [x] Sequence-based replay/rollback protection and same-sequence equivocation detection
- [x] Expiry/max-age validation and revoked/unknown registry-key rejection
- [x] Streaming response byte limits, redirect refusal, and local/private endpoint rejection
- [x] Verified immutable registry-version cache with current/history metadata
- [x] `dockyard community remote sources|sync|cached`
- [x] Local Ed25519 publisher and registry key generation with private key mode `0600`
- [x] Package-manifest and registry-envelope signing commands without private-key output
- [x] Digest-pinned Docker/Podman canary planning
- [x] Dynamic canary execution with no network, read-only root, dropped capabilities, no-new-privileges, and bounded CPU/memory/PIDs/time/output
- [x] No host-execution fallback and no automatic canary-image pulls
- [x] Quarantine-only read-only package mount
- [x] Unit/integration coverage plus VSIX/Core packaging assertions for P7 registry trust data
- [x] Merge verified remote registry packages into a collision-safe effective discovery view
- [ ] Contribution-validation workflow that signs only reviewed registry envelopes
- [ ] Key rotation/revocation assistant without silently rewriting trust policy
- [ ] External transparency anchoring

## P8 — Effective registry and safe capability updates

- [x] Collision-safe effective registry with bundled package precedence
- [x] Remote/remote package-ID collisions excluded instead of first-wins
- [x] Discovery-source collisions excluded with visible conflict metadata
- [x] Provenance returned for bundled and remote effective entries
- [x] `community list/search/sources/inspect/verify` use the effective registry
- [x] `resolve/install/update/canary` accept only unique effective packages
- [x] Existing P6 quarantine/signature/permission/integrity/approval installer reused unchanged as the activation boundary
- [x] Exact assessed manifest/provenance snapshot persisted per installed immutable revision
- [x] Active remote capabilities and declared entrypoints remain available offline after remote cache expiry
- [x] `dockyard community updates check [--id ID]`
- [x] `dockyard community updates apply-safe [--id ID]`
- [x] Safe update application performs a fresh pinned assessment and never supplies approval automatically
- [x] Permission expansion/trust downgrade/risk increase/quarantine/ambiguity/missing-manifest states cannot be unattended updates
- [x] Deterministic collision, provenance, snapshot, offline-runtime, and fail-closed update tests
- [ ] Background/scheduled update checks exposed through host automation integrations
- [ ] Rich VS Code remote marketplace view with provenance/conflict/update-state filters
- [ ] Contribution-validation/signing workflow for third-party registry submissions

## P9 — Authenticated provider actions and verified previews

- [x] Bounded provider action registry separated from read-only provider selection/planning
- [x] Authenticated GitHub workflow dispatch adapter
- [x] Vercel preview and production deployment adapters with linked-project requirement
- [x] Cloudflare Worker version-preview and Pages preview-deployment adapters
- [x] Supabase preview-branch and Edge Function deployment adapters with explicit project refs
- [x] Every provider mutation requires explicit approval
- [x] Production mutation requires an additional production-specific approval
- [x] Provider-specific parameter validation and project-root path confinement
- [x] No arbitrary workflow secret inputs, destructive Supabase controls, DNS mutation, or provider resource deletion exposed through P9
- [x] Provider-native post-action verification and external audit artifacts
- [x] Multi-provider preview environment plan/run with sequential fail-closed verification
- [x] Preview orchestrator refuses production actions and stops after the first failed/unverified step
- [x] Deterministic action/approval/injection/preview orchestration tests and CI smoke plans
- [ ] Authenticated action adapters for alternative providers
- [ ] Live pricing/free-tier metadata fetchers with freshness timestamps
- [ ] Provider outage/health verification
- [ ] Migration executors with rollback artifacts

## Next production milestones

- Secret/dependency exception policy + SARIF aggregation
- Published VS Code Marketplace release channel and opt-in real-host matrix CI
- Community contribution validation, richer marketplace UI, and optional scheduled safe-update checks
- External transparency anchoring and publisher key-rotation workflow
- Alternative-provider actions, live pricing/health signals, and migration rollback executors
