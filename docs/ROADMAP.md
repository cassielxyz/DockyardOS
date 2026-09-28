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
- [ ] External/public transparency anchoring for package action history

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
- [x] Authenticated action adapters for selected alternative providers
- [ ] Live pricing/free-tier metadata fetchers with freshness timestamps
- [x] Provider outage/health verification
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
- [x] Project-specific secret allowlists/baselines and expiry policy
- [x] Dependency exception policy with owner/expiry/rationale
- [x] SARIF aggregation/export for code-host security dashboards

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
- [ ] First live VS Code Marketplace listing/publication
- [ ] Safe automatic merge/install of review-first native project files without clobbering existing host config
- [ ] Completed green cross-host matrix run against installed real host CLIs in opt-in CI

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
- [x] Community-trust Ed25519 signature requirement + trusted/revoked key registry
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
- [x] Registry contribution-validation staging/CI for third-party submissions
- [x] Publisher key rotation/revocation UX and migration guidance
- [x] External/public transparency anchoring for signed remote-registry publications
- [ ] Safe automatic install/merge for host-native project config bundles
- [x] Rich searchable package marketplace/discovery UI in VS Code

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
- [x] Read-only third-party contribution validation with no signing secrets in PR CI
- [x] Maintainer promotion/signing workflow for reviewed registry envelopes
- [x] Key rotation/revocation assistant without silently rewriting trust policy
- [x] External transparency anchoring for signed registry publications

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
- [x] Background/scheduled update checks exposed through host automation integrations
- [x] Rich VS Code remote marketplace view with provenance/conflict/update-state filters
- [x] Contribution-validation workflow for third-party registry submissions
- [x] Maintainer-controlled bundled contribution promotion after independent review
- [x] Maintainer-controlled signing/publication automation for reviewed remote registry envelopes

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
- [x] Authenticated action adapters for selected alternative providers
- [ ] Live pricing/free-tier metadata fetchers with freshness timestamps
- [x] Provider outage/health verification
- [ ] Migration executors with rollback artifacts

## P10 — Expiring security exceptions and SARIF evidence

- [x] External project-specific security policy state
- [x] Gitleaks baseline entries keyed by scanner fingerprint without storing secret values
- [x] OSV dependency exceptions bound to advisory + package
- [x] Required owner/rationale/expiry metadata for every exception
- [x] New exception expiry limited to a future date within 365 days
- [x] Expired exceptions retained for visibility but automatically inactive
- [x] Separate policy gate: `pass | accepted-risk | fail | incomplete`
- [x] Raw `error`/`incomplete` scan status cannot be overridden by exceptions
- [x] Raw normalized findings remain preserved even when policy accepts risk
- [x] Per-run `policy-report.json` with active/expired/matched/unmatched/blocking evidence
- [x] SARIF 2.1.0 aggregation for normalized DockyardOS findings
- [x] Accepted exceptions represented as external SARIF suppressions instead of removed results
- [x] Incomplete/error runs exported with unsuccessful SARIF invocation metadata
- [x] Current-project run-path identity validation for policy/SARIF CLI operations
- [x] `dockyard security policy show|add-secret|add-dependency|remove|evaluate`
- [x] `dockyard security sarif --result PATH`
- [x] Deterministic policy/expiry/incomplete/SARIF tests plus real CLI smoke evidence
- [x] Optional code-host upload adapter for generated SARIF with explicit approval
- [x] Policy-review reminders for exceptions nearing expiry

## P11 — Guarded Marketplace release and real-host CI

- [x] Marketplace-ready extension repository/homepage/issues/keyword metadata
- [x] Existing VSIX packaging remains test-gated before release artifacts are uploaded
- [x] Marketplace publish step is `workflow_dispatch`-only
- [x] Publish requires explicit `publish_marketplace=true`
- [x] Publish requires `release_tag == v<extension version>` and that exact tag on the checked-out commit
- [x] Publish requires a repository `VSCE_PAT` secret and never stores the token in source
- [x] Tag pushes can package release artifacts without silently publishing
- [x] Current Cursor CLI executable (`agent`) and native resume capability reflected in host metadata
- [x] Manual-only real-host matrix defined for Gemini CLI, Codex, Claude Code, Cursor, and OpenCode
- [x] NPM host lanes resolve and record an exact current package version before installation
- [x] Installer-script lanes record SHA-256 before execution
- [x] Per-host evidence artifacts preserve install source, executable path, version, inspect, doctor, and integration results
- [x] Real-host lanes avoid model prompts/API credentials and verify Dockyard integration only
- [x] Deterministic tests enforce Marketplace and real-host workflow guardrails
- [x] Release and real-host verification guide
- [ ] First live Marketplace listing/publication using the guarded release path
- [ ] Completed green full real-host matrix run from merged `main`
- [ ] Antigravity real-CLI CI lane after an official stable noninteractive install surface is verified

## P12 — Isolated community contribution validation

- [x] Runtime-inert `registry/contributions` staging queue
- [x] Runtime-inert `registry/publisher-proposals` public-key onboarding queue
- [x] Third-party contribution manifests forced to `trust: community`
- [x] Contribution source refs pinned to immutable lowercase 40-character Git commits
- [x] Publisher signatures required for third-party package proposals
- [x] Existing manifest validator and trusted/revoked Ed25519 publisher-key verifier reused
- [x] Missing/untrusted publisher keys produce onboarding-required rather than activation
- [x] Invalid signatures from known keys are blocked
- [x] Valid signed proposals become review-ready but never activation-eligible from staging
- [x] Publisher key proposals structurally verify Ed25519 public keys but never grant trust automatically
- [x] Non-mutating promotion preparation rejects bundled package-ID collisions
- [x] Read-only pull-request validation workflow with no signing/publishing secrets
- [x] Proposal PRs cannot modify trusted registry/key files in the same review
- [x] CODEOWNERS boundary covers trust files, release workflows, and CODEOWNERS itself
- [x] Deterministic contribution/signature/onboarding/collision tests
- [x] Contributor documentation for the two-review trust flow
- [x] Maintainer-controlled publisher onboarding/promotion automation after independent identity review
- [x] Signed reviewed registry-envelope publication pipeline

## P13 — VS Code Community Hub

- [x] Local CSP-locked Community Hub replaces the basic community Quick Pick
- [x] Full-text package search plus trust/risk/origin/update-state filters
- [x] Bundled/remote provenance, installed revision/version, and update-state visibility
- [x] Discovery sources remain metadata-only and never become install buttons
- [x] Remote-registry verification/expiry and collision/conflict visibility
- [x] Manifest inspection and quarantine assessment from the Hub
- [x] Install/update preserves immutable assessed revision + SHA-256 pinning
- [x] Approval-required remains explicit and quarantine remains non-overridable
- [x] Webview messages/package IDs are validated before CLI invocation
- [x] Nonce-bound CSP, script-safe serialization, and DOM text rendering guard against registry-content injection
- [x] Deterministic Community Hub tests and actual VSIX packaging assertions

## P14 — Maintainer trust operations

- [x] Maintainer-only read-only plans for publisher onboarding, key rotation/revocation, and bundled contribution promotion
- [x] Publisher onboarding/rotation confined to the inert `registry/publisher-proposals` queue
- [x] Contribution promotion confined to the inert `registry/contributions` queue
- [x] Staged maintainer inputs reject symlinks and paths outside their review queues
- [x] Publisher proposals reject private-key PEM material and unsupported secret-bearing fields
- [x] Rotation adds the replacement public key and revokes the previous key as one reviewed transition
- [x] Final-key revocation emits a visible warning instead of weakening signature requirements
- [x] Promotion reuses P12 signature validation and bundled package-ID collision checks
- [x] Promoted third-party manifests remain `trust: community` with immutable source revision and publisher signature intact
- [x] Mutation targets restricted to canonical `registry/publishers.json` / `registry/community.json`
- [x] Apply requires explicit operation approval plus exact reviewed current-state SHA-256
- [x] Apply reuses the reviewed timestamp and requires the exact reviewed next-state SHA-256
- [x] Deterministic unit/CLI regression coverage for plan/apply, stale state, altered after-state, staging confinement, and approval guards
- [x] Maintainer migration/runbook documentation for onboarding, rotation, revocation, and promotion
- [x] Signed reviewed remote-registry envelope publication pipeline
- [x] External/public transparency anchoring for complete signed registry publications

## P15 — Scheduled safe community updates

- [x] Opt-in scheduled update checks remain disabled by default
- [x] Bounded 60-minute to 7-day interval with a 6-hour default
- [x] Separate opt-in unattended path calls only the existing `apply-safe` boundary
- [x] Trusted-workspace, single-flight, restart-throttle, and retry behavior
- [x] Scheduler syntax, regression tests, bundled Core checks, and VSIX packaging assertions

## P16 — Security policy expiry reminders

- [x] Read-only `security policy reminders` reporting without policy mutation
- [x] Bounded 1-90 day review window with case-insensitive owner filtering
- [x] Expired/expiring-soon classification, signed day counts, context, summary, and `needsReview`
- [x] Deterministic unit/CLI tests plus normal and bundled-Core CI smoke coverage

## P17 — Guarded GitHub SARIF upload

- [x] Read-only upload plan plus explicitly approved upload run
- [x] Exact SARIF SHA-256 approval binding and immediate pre-upload rehash
- [x] Current-project/run-path, repository, full commit, and full-ref validation
- [x] Gzip/Base64 GitHub upload through authenticated `gh` with no token argument
- [x] Symlink SARIF rejection and bounded path-safe returned upload-ID verification
- [x] Post-upload status evidence and durable external audit metadata
- [x] Exact final-head CI executed successfully on a real GitHub-hosted runner

## P18 — Public provider health evidence

- [x] Credential-free public status checks for GitHub, Vercel, Cloudflare, and Supabase
- [x] Pinned official Statuspage provenance with redirect refusal and cache bypass
- [x] Bounded timeout plus declared/streamed 512 KiB response limits
- [x] Explicit healthy/degraded/outage/unavailable/invalid states and aggregate exit behavior
- [x] Deterministic no-network tests and exact final-head CI on a real GitHub-hosted runner

## P19 — Reviewed remote-registry publication

- [x] Runtime-inert `registry/remote-publications` review queue
- [x] Read-only publication plan that never reads the registry private key
- [x] Approval SHA-256 binds review metadata, index/key/sequence/expiry, GitHub target, and exact observed remote state
- [x] Trusted non-revoked Ed25519 key requirement and non-symlink trust/index inputs
- [x] Explicit `--approve-publication` run with exact reviewed timestamp and plan digest
- [x] Local signature verification before mutation and 1 MiB signed-envelope bound
- [x] GitHub Contents API publication through authenticated `gh` with existing blob-SHA race protection
- [x] Strict remote Base64/blob metadata validation and exact post-publication byte/sequence verification
- [x] `published-unverified` state when mutation response or post-publication verification is incomplete
- [x] Durable external signed-envelope and audit evidence without credentials/private keys
- [x] Deterministic mocked-GitHub regression coverage
- [x] External/public transparency anchoring for published registry state

## P20 — Public registry transparency anchor

- [x] Accept only complete P19 publication audit/envelope evidence
- [x] Re-verify signed-envelope bytes, registry/index/payload hashes, trusted non-revoked Ed25519 key, and signature before any witness call
- [x] Require a different publicly readable GitHub repository as the witness target
- [x] Derive a bounded content-addressed witness path from registry id, sequence, and exact signed publication SHA-256
- [x] Keep public witness bytes deterministic from immutable P19 evidence; keep P20 reviewer identity/rationale private
- [x] Read-only plan with exact approval SHA-256 and explicit `--approve-anchor` mutation boundary
- [x] Create-only GitHub Contents API mutation with exact-existing idempotency and conflicting-existing fail-closed behavior
- [x] Strict public Base64/blob metadata validation and exact post-create byte/blob verification
- [x] `anchored-unverified` state and exit code 2 when accepted mutation evidence cannot be fully verified
- [x] Realpath confinement for P19 audit/envelope and canonical repository trust-store inputs
- [x] Durable external P20 audit evidence without credentials/private signing material
- [x] Deterministic P19-backed mocked-GitHub, tamper, approval, idempotency, conflict, malformed-response, and symlink-escape tests
- [x] Operator documentation including the explicit limitation that GitHub is a public witness, not an immutable timestamping authority
- [x] Exact final-head CI executed successfully after roadmap reconciliation

## P21 — Authenticated alternative provider actions

- [x] Unified action router preserves existing GitHub/Vercel/Cloudflare/Supabase action behavior while adding selected alternatives
- [x] Neon preview branch creation with explicit project/branch and `--no-secrets` output suppression
- [x] Firebase Hosting preview-channel and production deployment adapters with explicit project selection
- [x] Railway deployment adapter with explicit project/environment/service, project-root path confinement, CI result, and bounded verification
- [x] Render authenticated CLI deployment adapter with optional full Git commit pin and no secret deploy-hook URLs
- [x] Appwrite single-function noninteractive deployment from an explicitly linked project configuration
- [x] Every new mutation requires `--approve`; production additionally requires `--approve-production`
- [x] Unknown/secret parameters, preview production names, unsafe paths, and short Render commits fail closed
- [x] Current Neon/Render detection metadata and read-only auth probes aligned with their supported CLIs
- [x] Deterministic non-network tests plus read-only CLI plan smoke workflow
- [x] Exact final-head CI and focused P21 plan-smoke workflow green before merge

## Next production milestones

- Complete a green real-host matrix run and first guarded VS Code Marketplace publication
- Live pricing/free-tier metadata fetchers with freshness timestamps
- Migration executors with rollback artifacts
- Safe automatic install/merge for review-first host-native project configuration without clobbering existing files
