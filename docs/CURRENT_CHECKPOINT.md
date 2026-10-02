# DockyardOS Current Checkpoint

Repository evidence overrides chat memory. On every future `continue`, inspect live `main`, open PRs/branches, recent CI and this file before changing code.

## Identity

- Date: 2026-10-02
- Repository: `cassielxyz/DockyardOS`
- Verified production anchor: `f8a3f57188045da9999c4d8f4b9463ed197685be`
- Last completed milestone: **P40.1 — autonomous dashboard truth, skill lifecycle, and credential-safe media planning**
- Implementation PR: **#64**
- Checkpoint PR: **#65**
- Exact verified PR head: `5cd92f1c3d585377496342eb9939fa1306313979`
- Extension/Core version: **0.1.3**
- Next milestone: **P40.2 — mock-verified live Veo execution + media evidence + FFmpeg handoff**

## P40.1 completed state

### Autonomous agent UX

Normal users no longer need to press **Start Team** in the Control Center. Request mediation already creates or reuses the bounded specialist team automatically for substantial work, so the normal Agents page is now status/inspection only.

The dashboard agent renderer now reads the real team structure:

```text
team.currentPhase
  -> team.composition.phases[current]
  -> assignments[]
  -> team.phases[current].activeAgents[]
```

This fixes the legacy `team.agents/team.members` assumption that could show zero agents even when the real current-phase team existed.

### Skill lifecycle truth

Dockyard now persists a project-external skill usage ledger and exposes:

- **Installed on this PC** — bundled skills plus active integrity-verified global skill packages;
- **Loaded for latest/current work** — skill guidance actually injected for the selected request/phase;
- **Utilized by this project** — skills that were actually loaded at least once for this project, with usage timestamps/counts.

Installed is not treated as loaded, and discovery/install alone does not count as utilization.

### Connection truth

Connections now remembers only non-secret provider IDs after successful verification and re-verifies known/local accounts when the page opens. The explicit broader **Verify connections** action remains available.

Google AI / Gemini API is now a first-class secret-backed connection:

```text
masked key input
  -> read-only models verification
  -> VS Code SecretStorage
  -> in-memory child-process environment when Core needs it
```

The API key is never written to the source repo, Dockyard project/checkpoint state, webview model, media plan or durable evidence.

### Billable media boundary

`dockyard media plan` now creates a deterministic Veo generation plan containing model/settings, prompt SHA-256, request-body SHA-256 and an exact approval SHA-256.

The plan is explicitly:

- `billable: true`
- `approvalRequired: true`
- `executionEnabled: false`

Connecting Google AI or selecting a Veo model is **not** permission to spend credits.

## Verification evidence

Exact PR #64 head `5cd92f1c3d585377496342eb9939fa1306313979` passed:

- CI — `37004548187`
- P40 Google Media Connection and Plan — `37004548271`
- P39.1 Selected Skill Loading — `37004548264`
- P39 Autonomous Skills and Cinematic Web — `37004548145`
- P38.2 Guided Connections — `37004548239`
- P38 Universal Control Center — `37004548242`
- P37 Connections and Creative UI — `37004548193`
- P36 Host MCP Connection Readiness — `37004548489`
- P33 Curated Skill Assessment — `37004548186`
- P21 Provider Action Plans — `37004548260`
- P22 Provider Pricing Evidence — `37004548223`
- P23 Provider Migration Plans — `37004548199`

PR #64 had no submitted reviews or unresolved review threads at the exact-head merge check.

## Preview 5

Focused P40 workflow artifact:

- `dockyardos-0.1.3-preview5-vsix`
- artifact id: `11224504822`
- source head: `5cd92f1c3d585377496342eb9939fa1306313979`
- artifact SHA-256: `87e16e3421aca7796580451b1713c926cc87c471308f6fc8f2467aa76dbc9036`
- archive size: `3671835` bytes
- expiry: `2026-12-31T12:04:28Z`

## P40.2 continuation target

Implement the provider execution adapter without performing a real paid request during development or CI:

1. re-plan immediately before execution;
2. require `--approve-billable` plus exact current plan SHA-256;
3. verify Google AI authentication and fresh pricing evidence;
4. send the credential only in the provider header;
5. poll the long-running operation with bounded timeouts;
6. download and hash the generated clip outside the source repo;
7. persist non-secret generation evidence only;
8. hand the verified clip to the deterministic FFmpeg/frame-sequence stage.

A real billable generation remains user-gated and must never be triggered merely because a credential exists.

## Resume procedure

When the user says `continue`:

1. inspect live repo state and newer commits first;
2. verify `f8a3f57188045da9999c4d8f4b9463ed197685be` remains in current main ancestry;
3. do not replay P40.1 UI/skill/connection work unless regression evidence requires it;
4. preserve automatic specialist orchestration and truthful skill/connection states;
5. keep live billable media generation behind exact explicit approval;
6. checkpoint the next completed production milestone immediately.
