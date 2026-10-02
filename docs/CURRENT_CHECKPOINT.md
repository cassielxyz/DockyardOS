# DockyardOS Current Checkpoint

This is the durable continuation checkpoint. On every future `continue`, inspect live `main`, open PRs/branches, recent CI and this file before changing code. Repository evidence overrides chat memory.

## Identity

- Checkpoint date: 2026-10-02
- Repository: `cassielxyz/DockyardOS`
- Verified completed production state: `1d87a611f46a3a6681fd95e3ad2a4ac68a5046c5`
- Last completed milestone: **P39 — autonomous skill bootstrap + cinematic 3D/2.5D web workflow**
- Implementation PR: **#60**
- Checkpoint PR: **#61**
- Exact verified PR head: `91ccd5a69712a12055fdc34eb22f67eb9a92c905`
- Current Core / VS Code extension version: **0.1.3**
- Next milestone: **P40 — credential-safe media generation execution + remaining guarded public release work**

## P39 completed state

P39 fixes the installed-extension feedback and adds the cinematic web workflow requested by the user.

### Autonomous skills

- `DockyardOS: Auto Initialize Project` now bootstraps every **materializable/installable** skill manifest into the user-owned Dockyard library under `~/.dockyardos`.
- New CLI: `dockyard skills bootstrap --json`.
- Automatic-safe packages activate only after fresh exact-revision/hash assessment.
- Approval-required packages may be downloaded/assessed/staged but stay inactive.
- Quarantined packages remain quarantined.
- Discovery-only mega-registry entries are never mislabeled installed.
- Request/invocation fulfillment now automatically activates selected automatic-safe packages; the agent is no longer told to ask the user to run `dockyard capabilities fulfill` manually.
- Team Start performs the same selected-capability fulfillment.
- Only selected/phase-relevant bundled skill guidance is injected into model context.

### Team Start / Antigravity fixes

- Fixed the installed Antigravity/VS Code-compatible crash:
  `Cannot read properties of undefined (reading 'clear')`.
- Output Channel creation/use is defensive; missing partial APIs fall back to a normal notification instead of failing the team command.
- Stack aliases now normalize common user spellings including `react.js`, `ReactJS`, `next.js`, `three.js`, and React Three Fiber aliases.

### Cinematic 3D / 2.5D web workflow

A request such as:

```text
create a 3d website for r15
```

now routes to recipe `cinematic-3d-web` instead of a generic new-project/landing flow.

Bundled capabilities:

- `threejs-r3f-cinematic`
- `gsap-scroll-storytelling`
- `frame-sequence-2-5d`
- `cinematic-asset-pipeline`
- `video-model-selection`
- FFmpeg runtime verification for video/frame work

Dockyard plans one of:

- **true-3d** — interaction genuinely needs geometry/WebGL/R3F;
- **frame-sequence-2.5d** — deterministic cinematic scroll motion is the main requirement;
- **hybrid** — default for a generic product 3D website: real 3D only where interaction earns the runtime cost, frame-sequence storytelling for major transitions.

The planner keeps hero/story/details/closing as separate semantic sections and requires mobile/reduced-motion fallbacks, browser verification and performance budgets.

### Video model selection

Dockyard includes verified non-secret metadata and feature-aware selection for:

- `veo-3.1-generate-preview`
- `veo-3.1-fast-generate-preview`
- `veo-3.1-lite-generate-preview`

Model selection is not authentication and does not generate/spend by itself. Actual billable media generation remains an external provider action boundary. Provider credentials/API keys must not be stored in Dockyard checkpoints, logs or generated source.

See `docs/CINEMATIC_WEB.md`.

## Verification evidence

Exact PR head `91ccd5a69712a12055fdc34eb22f67eb9a92c905` passed:

- CI — `37000029861`
- P21 Provider Action Plans — `37000029786`
- P22 Provider Pricing Evidence — `37000029860`
- P23 Provider Migration Plans — `37000029835`
- P33 Curated Skill Assessment — `37000030046`
- P34 Research and Provider Skill Assessment — `37000029912`
- P35 Runtime Connection Readiness — `37000029921`
- P36 Host MCP Connection Readiness — `37000029867`
- P37 Connections and Creative UI — `37000029875`
- P38 Universal Control Center — `37000030130`
- P38.2 Guided Connections — `37000029838`
- P39 Autonomous Skills and Cinematic Web — `37000029880`

Post-merge `main` at `1d87a611f46a3a6681fd95e3ad2a4ac68a5046c5`:

- CI — `37000135809` — success
- P21 — `37000135786` — success
- P22 — `37000135778` — success
- P23 — `37000135783` — success

## Preview 3 artifact

Validated P39 workflow artifact:

- name: `dockyardos-0.1.3-preview3-vsix`
- artifact id: `11222759988`
- source head: `91ccd5a69712a12055fdc34eb22f67eb9a92c905`
- GitHub artifact digest: `sha256:fe4362019927eda0cc66e0e69a035d739b1fd5cdc2f9c8f4c81251e2db2a9103`
- extracted VSIX size: `3939979` bytes
- extracted VSIX SHA-256: `a10115ccdfc906321279df0324c35b1e9d472b3e0ae8c6d06797cd8497037e1f`
- artifact expiry reported by GitHub: `2026-12-31T11:15:42Z`

## Safety/truthfulness invariants

Future work must preserve:

- selected != installed != configured != authenticated != connected != approved;
- Auto Initialize requires a trusted workspace;
- installable skills may be bootstrapped automatically, but approval-required/quarantined packages never gain silent execution authority;
- discovery-only capability metadata is not called installed;
- only selected/phase-relevant skill guidance is loaded into agent context;
- provider/model credentials are never stored in project/checkpoint state;
- model selection is not provider authentication and is not permission to incur external spend;
- external/billable media generation needs an explicit execution/approval boundary;
- provider/MCP readiness never grants deployment/database/DNS/Git/production approval;
- child-process execution remains shell-free where designed; do not reintroduce `shell:true` to work around Windows quoting;
- semantic DOM content, reduced-motion fallback and performance verification remain part of cinematic web output;
- the Connections Center must continue to verify real account/session readiness rather than treating an opened login page as success.

## P40 continuation target

P40 should continue from P39 rather than rebuilding it.

Primary technical target:

1. add a credential-safe Google AI/media-generation connection surface;
2. represent generation as a bounded, reviewable billable-provider action;
3. require an explicit spend/generation approval before an actual Veo request;
4. keep API keys/tokens in provider/host secure storage or process environment, never Dockyard checkpoint/source;
5. produce durable non-secret generation evidence (model, request hash, output hash/path, timing/status; no secret headers);
6. connect successful generated clips to the existing FFmpeg/frame-sequence pipeline;
7. verify responsive 2.5D output through Playwright/performance gates.

Existing public release/Marketplace work also remains externally gated. Do not publish to the VS Code Marketplace without the real public control-plane origin, valid publisher/token/tag setup and explicit production publication approval.

## Resume procedure

When the user says `continue`:

1. inspect live `main`, recent commits, open PRs, branches and CI;
2. verify `1d87a611f46a3a6681fd95e3ad2a4ac68a5046c5` is still in current main ancestry;
3. inspect any production commits after that SHA before selecting work;
4. do not recreate P39 skill bootstrap, Output Channel fix, stack aliases, cinematic recipe/model selector or bundled skill docs unless regression evidence requires it;
5. preserve P38.2 guided Connections behavior while extending provider/media setup;
6. distinguish external-provider, billable-action, runner, workflow, flaky-test and real code failures;
7. checkpoint the next completed production milestone immediately.
