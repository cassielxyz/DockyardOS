# DockyardOS Current Checkpoint

This file is the durable human-readable continuation checkpoint for DockyardOS. Before starting new work, verify `main` still contains the recorded verified code state, inspect newer commits/PRs/CI, and continue from the newest verified production milestone instead of replaying completed work.

For the complete continuation contract, read [`AGENT_CONTINUATION_GUIDE.md`](AGENT_CONTINUATION_GUIDE.md).

## Checkpoint identity

- Checkpoint date: 2026-10-02
- Repository: `cassielxyz/DockyardOS`
- Verified completed code state: `0467a1900a93b79764f5d57c6c062382255e4f42`
- Checkpoint PR: `#55`
- Last completed milestone: **P38 — universal DockyardOS control center and README rebuild**
- Previous completed milestone: **P37 — Connections Center + creative UI orchestration**
- Next continuation milestone: **P39 — first guarded live VS Code Marketplace publication**
- P39 status: **externally gated; do not publish without explicit production approval and required publisher/token/tag setup**

The verified code-state SHA is the production anchor. Later checkpoint-only documentation commits do not make the checkpoint stale by themselves.

## Completed state through P38

P0–P38 are implemented/merged. Do not restart them unless current repository evidence shows a regression.

### P38 — universal Control Center

Merged through PR `#54` as `0467a1900a93b79764f5d57c6c062382255e4f42` from exact verified head `7ebc685c19f6174768cdb75a1c41e23e1d10ef39`.

P38 changed the VS Code extension from a mostly command-driven surface into a UI-first universal control center:

- Dashboard / Project / Agents / Skills / Connections / Memory / Workflows / Security / Community / Settings navigation;
- shared Dockyard dark graffiti-inspired design system across the new dashboard, Connections Center and Community Hub;
- repository-owned fixed background asset under `integrations/vscode/assets/dockyard-graffiti-bg.svg`;
- one-click **Auto Initialize** that can initialize project state, plan/install the selected default host integration, run Doctor and refresh state;
- automatic initialization remains opt-in and requires a trusted workspace;
- the Control Center opens on trusted-workspace startup by default but can be disabled in Settings;
- UI-backed settings for default host, default Safe/Balanced/Autonomous mode, Auto Initialize behavior, host scope, startup behavior and safe community update options;
- dashboard action and setting messages are allowlisted; Dockyard Core process execution stays `shell:false`;
- the production Connections/Community trust boundaries remain intact;
- a new focused `P38 Universal Control Center` workflow packages a prebuilt preview VSIX and verifies dashboard/theme/background files are inside it;
- the guarded official VS Code release workflow now also asserts the universal UI files before producing a release VSIX;
- the root README was completely rebuilt as a product guide rather than a milestone/status list;
- custom README SVG assets now explain architecture, continuity, workflow, capability stack, connections, creative UI, verification/refactor and cross-host behavior.

## P38 verification evidence

Exact verified P38 PR head: `7ebc685c19f6174768cdb75a1c41e23e1d10ef39`.

Real GitHub-hosted runner evidence on that exact head:

- **CI** — run `36924832259` — success; full repository tests plus provider/security/community/host/VSIX smoke checks passed.
- **P37 Connections and Creative UI** — run `36924832204` — success; previous Connections/creative-routing regressions stayed green after the UI rebuild.
- **P38 Universal Control Center** — run `36924832447` — success; Core build, focused P37/P38 tests, extension JavaScript checks, universal preview VSIX packaging/content assertions and artifact upload passed.

Produced preview artifact:

- artifact: `dockyardos-universal-preview-vsix`
- artifact id: `11193271894`
- GitHub digest: `sha256:9ffa31eebf6a4861dc01e35c97c530ed9792753bc97bf1ee02c57adc16d13407`
- retention expiry reported by GitHub: `2026-12-30T20:53:07Z`

PR `#54` had no submitted reviews or unresolved review threads at the final merge check.

## P38 safety/truthfulness invariants

Future changes must preserve these rules:

- the Universal Control Center is a UI over the existing Dockyard state/policy engine, not a second source of truth;
- Auto Initialize requires workspace trust;
- automatic workspace initialization stays explicit opt-in;
- interactive Auto Initialize confirms host integration changes before applying them;
- dashboard webview actions and settings remain allowlisted;
- webview messages must not become arbitrary shell commands, URLs or configuration keys;
- Dockyard Core child processes remain `shell:false`;
- the fixed visual background remains local/repository-owned rather than a remote runtime dependency;
- provider credentials and MCP secrets are not written into project/checkpoint state;
- installed/configured MCP metadata is not treated as active-session connectivity;
- provider/MCP readiness never grants mutation approval;
- Community Hub quarantine/signature/immutable-revision/hash/approval boundaries remain enforced;
- Creative UI reference use remains original synthesis, not permission to clone another site.

## P39 continuation target — first guarded Marketplace publication

The next explicit production gate is the first live Visual Studio Marketplace listing/publication through the already-implemented guarded release path.

Current release facts:

- extension: `integrations/vscode` / `dockyardos-vscode`;
- publisher: `cassielxyz`;
- current extension version: `0.1.0`;
- expected release tag: `v0.1.0`;
- Marketplace publication is manual `workflow_dispatch` only;
- publication requires `publish_marketplace=true`;
- `release_tag` must exactly equal `v<extension version>`;
- the checked-out publication commit must actually be pointed to by the exact tag;
- repository Actions must contain a valid `VSCE_PAT` authorized for the Marketplace publisher;
- the token must remain outside source, checkpoints, issues/PR text, logs and project metadata.

P39 is a production external mutation. Do not create the release tag or dispatch Marketplace publication merely because the universal VSIX is packaged and green. Perform read-only preflight first and require explicit production publication approval for the exact release version/commit.

If the external publisher/token/tag requirements or approval are unavailable, preserve P39 as blocked rather than weakening the release workflow or claiming publication succeeded.

## Resume procedure

When the user says `continue`:

1. inspect `main`, recent commits, open PRs, branches, roadmap, checkpoint and CI;
2. verify `0467a1900a93b79764f5d57c6c062382255e4f42` remains in current `main` ancestry;
3. inspect production commits after that anchor before choosing work;
4. ignore checkpoint-only documentation commits when deciding whether production work advanced;
5. do not recreate P38 dashboard/README/Auto Initialize work unless regression evidence requires it;
6. preserve the new universal UI and VSIX package assertions;
7. if Marketplace publication already occurred, verify exact tag/commit/workflow/listing evidence before marking P39 complete;
8. if P39 is not published, perform only safe read-only preflight until external setup and explicit approval are present;
9. distinguish runner-allocation, workflow-definition, external-provider and real code/test failures;
10. update both this file and `docs/checkpoints/latest.json` after the next completed production milestone.

## Checkpoint maintenance rule

Every completed production milestone must record at least:

- verified completed code-state SHA;
- last completed milestone;
- next milestone;
- important safety/trust invariants;
- exact verification evidence when available;
- unresolved external/manual gates.
