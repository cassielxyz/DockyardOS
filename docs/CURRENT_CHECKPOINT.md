# DockyardOS Current Checkpoint

This file is the durable human-readable continuation checkpoint for DockyardOS. Before starting new work, verify `main` still contains the recorded verified code state, then inspect newer commits/PRs and continue from the newest verified production milestone instead of replaying completed work.

For the complete cross-agent continuation, parallel-work, verification, documentation, safety, and implementation contract, read [`AGENT_CONTINUATION_GUIDE.md`](AGENT_CONTINUATION_GUIDE.md) before making changes.

## Checkpoint identity

- Checkpoint date: 2026-10-02
- Repository: `cassielxyz/DockyardOS`
- Verified completed code state: `6adb94e6ba714cf5e1457c2258fe0e5ec226031b`
- Checkpoint PR: pending assignment for `docs/p36-checkpoint`
- Last completed milestone: **P36 — verified host/MCP connection readiness**
- Previous completed milestone: **P35 — runtime connection readiness**
- Next continuation milestone: **P37 — first guarded live VS Code Marketplace publication**
- P37 status: **externally gated; do not publish without explicit production approval and required publisher/token/tag setup**

The verified code-state SHA is the milestone anchor. A later documentation-only checkpoint commit/merge is expected and does not make this checkpoint stale by itself.

## Completed state through P36

P0–P36 are already implemented/merged. Do not restart them unless current repository evidence shows a regression.

### P35

Merged as `a35bd6b4725f9cc29eb1c3fe0ad75dd7f15d8c3a`.

P35 made capability readiness truthful beyond installed files: immutable active package manifests can declare required/optional provider and MCP runtime connections; provider readiness can require configured/authenticated/linked state; required external prerequisites fail closed as `needs-connection`; optional connections remain advisory; and installation never grants credentials or mutation approval.

### P36

Merged through PR `#50` as `6adb94e6ba714cf5e1457c2258fe0e5ec226031b` from exact verified head `6952144a3bc93ab23466c317fdc3146e5ea1bdc0`.

P36 adds active-host/session MCP connection evidence without weakening P35 or external mutation gates:

- `HostSessionConnectionRegistry` stores bounded MCP observations only in memory inside the active `dockyard-mcp` process;
- evidence is scoped to a launcher-bound host and exact lowercase/path-safe MCP id;
- evidence expires automatically on MCP process exit and is never written into project/checkpoint state;
- `dockyard_connection_attest` is for a host to record successful target-MCP use in the current session;
- `dockyard_fulfillment` starts with the normal P35 fail-closed plan and applies only matching current-process/current-host MCP evidence;
- the P36 tools do not accept a caller-selected host identity;
- packaged Gemini CLI, Codex, Claude Code, Cursor, and OpenCode MCP launchers bind their own host identity using `dockyard-mcp --host <host>`;
- a manually launched bridge without `--host` remains `universal` rather than impersonating a packaged native host;
- required provider readiness remains independently gated and cannot be bypassed by MCP evidence;
- unresolved optional connections remain advisory;
- no tokens, connector credentials, arbitrary tool results, or production/destructive approvals are persisted in P36 evidence;
- host-session attestation is documented accurately as session evidence, not cryptographic proof of a cross-MCP call.

## P36 verification evidence

Exact P36 PR head: `6952144a3bc93ab23466c317fdc3146e5ea1bdc0`.

The following GitHub Actions runs passed on that exact head and executed real steps:

- CI — run `36910235776` — success; full test suite, local MCP/native bridge checks, P7/P8/P9/P10 smoke, VS Code bundled Core and VSIX packaging, CLI smoke, and security/team/host-state smoke all executed.
- P36 Host MCP Connection Readiness — run `36910235604` — success; build, deterministic P36 tests, and launcher-bound/non-persistent/approval-neutral invariant checks all executed.
- P21 Provider Action Plans — run `36910236146` — success.
- P22 Provider Pricing Evidence — run `36910235745` — success.
- P23 Provider Migration Plans — run `36910235682` — success.

During development, real-runner CI on earlier head `5af59ee4bc63a07e56616a595994716e07bd8c0b` failed one P36 test because uppercase MCP ids were normalized instead of rejected. That was treated as a genuine code/test failure and fixed with strict lowercase validation. It was not misclassified as a `runner_id: 0` / zero-step infrastructure failure.

PR `#50` had no submitted reviews, review comments, or unresolved review threads at the final merge checkpoint.

## P37 continuation target — first guarded Marketplace publication

The durable roadmap has one remaining explicit production gate: the first live VS Code Marketplace listing/publication using the already-implemented guarded release path.

Current release facts at this checkpoint:

- extension: `integrations/vscode` / `dockyardos-vscode`;
- publisher: `cassielxyz`;
- current extension version: `0.1.0`;
- expected release tag for that version: `v0.1.0`;
- Marketplace publication exists only on manual `workflow_dispatch`;
- publication requires `publish_marketplace=true`;
- `release_tag` must exactly equal `v<extension version>`;
- the checked-out publication commit must actually be pointed to by that exact tag;
- repository Actions must contain a valid `VSCE_PAT` secret authorized for the Marketplace publisher;
- the token remains outside source and must never be copied into checkpoints, issues, PR bodies, logs, or project metadata.

P37 is a **production external mutation**, so connectivity/readiness is not approval. Do not create the release tag or dispatch Marketplace publication merely because the workflow is ready. Before any live publication, verify the publisher/token/tag prerequisites and require explicit production publication approval for the exact version/commit being released.

If those external prerequisites or explicit approval are unavailable, preserve P37 as externally blocked rather than fabricating success or weakening the release workflow. Read-only preflight inspection is safe to continue.

## Resume procedure

When the user says `continue`:

1. inspect `main`, recent commits, open PRs, branches, roadmap and CI;
2. verify `6adb94e6ba714cf5e1457c2258fe0e5ec226031b` is still in the ancestry of the current repository state;
3. inspect commits after that anchor and prefer any newer verified production milestone;
4. ignore checkpoint-only documentation commits when deciding whether production work advanced;
5. if P37 has already been published, verify the exact tag/commit/workflow/listing evidence before marking it complete;
6. if P37 is not published, perform only safe read-only preflight work until the required external setup and explicit production approval are present;
7. do not recreate P35/P36 work;
8. keep runner-allocation failures (`runner_id: 0`, zero steps) distinct from real build/test/publish failures;
9. after the next merged or externally completed production milestone, update both this file and `docs/checkpoints/latest.json` immediately.

## Checkpoint maintenance rule

Every completed production milestone must update the durable checkpoint in the same continuation cycle. A chat summary is not sufficient. The repo-level checkpoint must record at minimum:

- verified completed code-state SHA;
- last completed milestone;
- next milestone;
- important safety/trust invariants;
- exact verification evidence when available;
- unresolved external/manual gates.
