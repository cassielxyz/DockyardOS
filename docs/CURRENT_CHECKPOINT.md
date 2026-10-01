# DockyardOS Current Checkpoint

This file is the durable human-readable continuation checkpoint for DockyardOS. Before starting new work, verify `main` still contains the recorded verified code state, then inspect newer commits/PRs and continue from the newest verified production milestone instead of replaying completed work.

## Checkpoint identity

- Checkpoint date: 2026-10-01
- Repository: `cassielxyz/DockyardOS`
- Verified completed code state: `a35bd6b4725f9cc29eb1c3fe0ad75dd7f15d8c3a`
- Checkpoint PR: `#48`
- Last completed milestone: **P35 — runtime connection readiness**
- Previous completed milestone: **P34 — research/provider skill materialization + runtime prerequisites**
- Next continuation milestone: **P36 — verified host/MCP connection readiness**

The verified code-state SHA is the milestone anchor. A later documentation-only checkpoint commit/merge is expected and does not make this checkpoint stale by itself.

## Completed state through P35

P0–P35 are already implemented/merged. Do not restart them unless current repository evidence shows a regression.

### P34

Merged as `c58dc536716df39a4335bd9f0136174fdbd24cda`.

P34 materialized real curated packages for:

- `agent-reach`
- `supabase-skill`
- `cloudflare-skill`

It aligned package IDs with DockyardOS selector IDs, added bounded runtime prerequisites, preserved existing quarantine/signature/permission/approval boundaries, and kept provider/MCP authorization separate from package installation.

### P35

Merged as `a35bd6b4725f9cc29eb1c3fe0ad75dd7f15d8c3a`.

P35 made capability readiness truthful beyond installed files:

- package manifests can declare bounded `provider` and `mcp` connection requirements;
- required and optional connections are distinct;
- provider requirements can require `configured`, `authenticated`, or `linked` readiness;
- required provider readiness uses existing read-only provider probes;
- required MCP readiness fails closed until a host/connector verifies connectivity;
- optional connections remain advisory and do not block guidance capabilities;
- runtime prerequisites come from the exact immutable installed-manifest snapshot, not mutable current registry metadata;
- missing executables remain `missing-runtime`;
- unresolved required external prerequisites become `needs-connection`;
- package installation never grants credentials, account authorization, production approval, or mutation rights;
- optional Supabase/Cloudflare connection metadata does not trigger live account probes during normal request mediation.

## P35 verification evidence

Exact P35 PR head: `7e736abf6acb70756b8c42b13586a13d825c5a18`.

The following GitHub Actions runs passed on that exact head:

- CI — run `36903998260` — success
- P35 Runtime Connection Readiness — run `36903998302` — success
- P34 Research and Provider Skill Assessment — run `36903998258` — success
- P33 Curated Skill Assessment — run `36903998263` — success
- Community Contribution Validation — run `36903998254` — success

P35 was then squash-merged into `main` as `a35bd6b4725f9cc29eb1c3fe0ad75dd7f15d8c3a`.

## P36 continuation target

Continue with **verified host/MCP connection readiness**.

The goal is to make DockyardOS distinguish clearly between:

1. a capability being selected;
2. its package being installed and integrity-verified;
3. its local executable prerequisites being available;
4. a provider/MCP being configured;
5. a provider/MCP being actually verified usable by the active host/session;
6. permission/approval to perform a specific external mutation.

P36 should preserve these invariants:

- selected/configured must never be reported as connected unless verified;
- required MCP/provider prerequisites fail closed when verification is unavailable;
- optional connections remain advisory and should not create unnecessary live probes;
- no connector credentials or tokens are persisted in checkpoint/project metadata;
- connection verification must not imply production/destructive approval;
- runtime readiness must remain bound to the active immutable package manifest snapshot;
- continuation must reuse the current project/team/capability state rather than rerun unrelated selection.

At P36 start, inspect the current host adapters, MCP bridge, host doctor/native-info surfaces, provider detection, capability fulfillment, tests, CI and any newer upstream changes before designing the implementation.

## Resume procedure

When the user says `continue`:

1. inspect `main`, recent commits, open PRs, branches, roadmap and CI;
2. verify `a35bd6b4725f9cc29eb1c3fe0ad75dd7f15d8c3a` is still in the ancestry of the current repository state;
3. inspect commits after that anchor;
4. ignore checkpoint-only documentation commits when deciding whether production work advanced;
5. if a newer production milestone exists, treat it as authoritative and repair this checkpoint before continuing;
6. otherwise continue from P36;
7. do not recreate P34/P35 work;
8. create a dedicated P36 branch and keep exact-head verification before merge;
9. after P36 merges, update both this file and `docs/checkpoints/latest.json` immediately.

## Checkpoint maintenance rule

Every merged production milestone must update the durable checkpoint in the same continuation cycle. A chat summary is not sufficient. The repo-level checkpoint must record at minimum:

- verified completed code-state SHA;
- last completed milestone;
- next milestone;
- important safety/trust invariants;
- exact verification evidence when available;
- any unresolved external/manual gates.
