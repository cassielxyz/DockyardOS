# DockyardOS Current Checkpoint

This is the durable continuation checkpoint. On every future `continue`, inspect live `main`, open PRs/branches, recent CI and this file before changing code. Repository evidence overrides chat memory.

## Identity

- Checkpoint date: 2026-10-02
- Repository: `cassielxyz/DockyardOS`
- Verified completed production state: `c9c4c4f2f0224b25c55c485893a7d5b9461d8df3`
- Last completed milestone: **P39.1 — automatic selected installed skill context loading**
- Implementation PR: **#62**
- Checkpoint PR: **#63**
- Exact verified PR head: `70ab54647bb5d32ea0d6ff234978d277a6e7ed04`
- Current Core / VS Code extension version: **0.1.3**
- Next milestone: **P40 — credential-safe media generation execution + remaining guarded public release work**

## P39.1 completed state

P39 already made Auto Initialize bootstrap every materializable/installable skill manifest into Dockyard's user-owned PC library. P39.1 closes the remaining runtime gap: **installed globally is not the same as loaded into every agent prompt**.

The lifecycle is now:

```text
Auto Initialize
  -> materialize/assess the PC-wide skill library
  -> reuse already-active immutable revisions
  -> keep approval-required/quarantined packages inactive

project request / continue
  -> classify request and current team phase
  -> select bounded capabilities
  -> verify/activate eligible selected capabilities
  -> load only selected ready skill entrypoints
  -> inject bounded skill context into the current agent invocation
```

### Selective installed-skill loading

- New Core module: `src/selected-skill-context.ts`.
- Only fulfillment entries that are **skill + ready + installed package + immutable active revision** are eligible.
- The immutable installed manifest snapshot is loaded first.
- Only manifest-declared `skill` entrypoints are eligible.
- Skill text is read through the existing active-community runtime path, which re-verifies installed package integrity before exposing content.
- A revision change, missing snapshot, unsafe/missing entrypoint, integrity failure, or read failure prevents injection and produces an explicit warning.
- Candidate/package aliases such as `superpowers -> superpowers-core-skills` remain supported through fulfillment metadata.
- Unselected skills stay out of context.
- Approval-required, quarantined, blocked, missing-runtime and unconnected capabilities are never silently injected.

### Context budget

The automatic selected-skill loader is deliberately bounded:

- default maximum selected installed skills: **8**
- default maximum characters per skill: **10,000**
- default maximum total selected-skill characters: **48,000**
- oversized skill text is explicitly marked as truncated
- budget exhaustion is surfaced as a warning instead of silently loading the full library

Bundled Dockyard guidance stays separate from installed upstream skill entrypoints.

### Authority boundary

Injected upstream skill text is explicitly scoped implementation guidance. It cannot override:

1. the user's explicit requirement;
2. DockyardOS approval/safety policy;
3. security and provider mutation gates;
4. repository/test evidence.

This preserves the existing rule that discovering/installing/loading a skill does not grant external or destructive authority.

## Verification evidence

Exact P39.1 PR head `70ab54647bb5d32ea0d6ff234978d277a6e7ed04` passed:

- CI — `37001673487` — success
- P39.1 Selected Skill Loading — `37001673602` — success
- P39 Autonomous Skills and Cinematic Web — `37001673545` — success
- P38.2 Guided Connections — `37001673332` — success
- P38 Universal Control Center — `37001673554` — success
- P37 Connections and Creative UI — `37001673549` — success
- P36 Host MCP Connection Readiness — `37001673389` — success
- P33 Curated Skill Assessment — `37001673348` — success
- P21 Provider Action Plans — `37001673502` — success
- P22 Provider Pricing Evidence — `37001673488` — success
- P23 Provider Migration Plans — `37001673420` — success

PR #62 had no submitted reviews or unresolved review threads at the exact-head merge check.

## Preview 4 artifact

Validated focused workflow artifact:

- name: `dockyardos-0.1.3-preview4-vsix`
- artifact id: `11224186878`
- source head: `70ab54647bb5d32ea0d6ff234978d277a6e7ed04`
- GitHub artifact digest: `sha256:bed234740f5b0adc881fdd7ebcd9eb274e95fd295e4210c0e23c80e6e865739e`
- extracted VSIX size: `3945089` bytes
- extracted VSIX SHA-256: `37c97430f3ab9b321a1ceef373d0c55af7e3f0247afba76a605d70b91b049504`
- artifact expiry reported by GitHub: `2026-12-31T11:33:41Z`

The focused workflow asserts the packaged extension contains the skill bootstrap, selected-skill loader and invocation fulfillment hook.

## Safety/truthfulness invariants

Future work must preserve:

- selected != installed != loaded != configured != authenticated != connected != approved;
- Auto Initialize requires a trusted workspace;
- materializable skills may be prepared PC-wide, but approval-required/quarantined packages never gain silent execution authority;
- discovery-only metadata is not called installed;
- all installed skills are **not** dumped into every agent prompt;
- only current request/phase-selected, ready, immutable-revision skill packages are eligible for automatic context loading;
- installed skill content is integrity-reverified before injection;
- selected skill context remains bounded and explicit about truncation/load failures;
- upstream skill text never outranks the user's requirement or Dockyard safety/security policy;
- provider/model credentials remain outside project/checkpoint state;
- connection/readiness never grants deployment/database/DNS/Git/production approval.

## P40 continuation target

P40 continues from P39.1; do not rebuild the skill system.

Primary technical target:

1. add a credential-safe Google AI/media-generation connection surface;
2. represent generation as a bounded, reviewable billable-provider action;
3. require an explicit spend/generation approval before an actual Veo request;
4. keep API keys/tokens in provider/host secure storage or process environment, never Dockyard checkpoint/source;
5. produce durable non-secret generation evidence;
6. connect successful generated clips to the existing FFmpeg/frame-sequence pipeline;
7. verify responsive 2.5D output through Playwright/performance gates.

The Marketplace/public-release path remains separately externally gated.

## Resume procedure

When the user says `continue`:

1. inspect live `main`, recent commits, open PRs, branches and CI;
2. verify `c9c4c4f2f0224b25c55c485893a7d5b9461d8df3` is still in current main ancestry;
3. inspect production commits after that SHA before selecting work;
4. do not recreate P39/P39.1 global skill bootstrap or selected skill loading unless regression evidence requires it;
5. preserve P38.2 guided Connections behavior;
6. distinguish external-provider, billable-action, runner, workflow, flaky-test and real code failures;
7. checkpoint the next completed production milestone immediately.
