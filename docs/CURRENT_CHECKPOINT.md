# DockyardOS Current Checkpoint

This file is the durable human-readable continuation checkpoint for DockyardOS. Before starting new work, verify `main` still contains the recorded verified code state, then inspect newer commits/PRs and continue from the newest verified production milestone instead of replaying completed work.

For the complete cross-agent continuation, parallel-work, verification, documentation, safety, and implementation contract, read [`AGENT_CONTINUATION_GUIDE.md`](AGENT_CONTINUATION_GUIDE.md) before making changes.

## Checkpoint identity

- Checkpoint date: 2026-10-02
- Repository: `cassielxyz/DockyardOS`
- Verified completed code state: `67416f90d2ddc923b48506d4d04f8f3679c31d48`
- Checkpoint PR: pending durable-checkpoint PR
- Last completed milestone: **P37 — Connections Center + creative UI orchestration**
- Previous completed milestone: **P36 — verified host/MCP connection readiness**
- Next continuation milestone: **P38 — first guarded live VS Code Marketplace publication**
- P38 status: **externally gated; do not publish without explicit production approval and required publisher/token/tag setup**

The verified code-state SHA is the milestone anchor. A later documentation-only checkpoint commit/merge is expected and does not make the checkpoint stale by itself.

## Completed state through P37

P0–P37 are already implemented/merged. Do not restart them unless current repository evidence shows a regression.

### P36 — verified host/MCP connection readiness

Merged through PR `#50` as `6adb94e6ba714cf5e1457c2258fe0e5ec226031b`.

P36 established active-host/session MCP connection evidence while preserving the existing fail-closed provider/MCP readiness and approval model. Configured/installed metadata is not treated as current-session connectivity, evidence is process/host scoped, credentials are not persisted, and connection evidence never grants mutation approval.

### P37 — Connections Center + creative UI orchestration

Merged through PR `#52` as `67416f90d2ddc923b48506d4d04f8f3679c31d48` from exact verified head `2666a31bfd6d08ef772fddbcb5b38e7179461b4f`.

P37 adds the missing production user-facing connector/setup surface and the creative web-design intelligence layer:

- VS Code now exposes `DockyardOS: Connections` through a composed extension entrypoint;
- the initial Connections view is local-only and reuses existing provider readiness probes;
- `Verify connections` performs the existing bounded read-only live provider checks;
- provider setup/login actions resolve from extension-owned allowlists rather than accepting commands or URLs from webview messages;
- supported login actions open a visible provider CLI terminal only after modal user confirmation;
- provider passwords, OAuth tokens, API keys, and MCP credentials are not captured or written into Dockyard project/checkpoint state;
- missing CLIs show setup guidance instead of a misleading login action;
- MCP setup metadata is not called connected; P36 host-session evidence remains the authority for current-session connection truth;
- `inspo-mcp` is a first-class low-risk, read-only/no-login design-reference MCP backed by `https://inspomcp.dev/mcp`;
- `taste-skill` (`Leonxlnx/taste-skill`) and `awesome-design-skills` (`bergside/awesome-design-skills`) are first-class creative capability entries with explicit provenance/trust metadata;
- natural-language inference recognizes design inspiration, visual references, premium/creative UI, anti-slop/design-taste intent, and generic-AI-look avoidance;
- the `creative-web-ui` recipe routes relevant work through Inspo/Taste/Awesome Design plus UI UX Pro Max, Vercel Web Design Guidelines, shadcn/ui, Playwright, accessibility, performance, and independent QA review;
- the root README and VS Code README now include normal-user VSIX installation, Connections setup, Antigravity host integration, and current pre-Marketplace vs post-Marketplace installation paths;
- the focused P37 workflow builds Core, runs deterministic P37 tests, verifies real capability selection, checks extension JavaScript, packages a VSIX, and asserts the new UI/creative runtime files are present inside the package.

## P37 verification evidence

Exact verified P37 PR head: `2666a31bfd6d08ef772fddbcb5b38e7179461b4f`.

The following GitHub Actions runs passed on that exact head and executed real steps:

- CI — run `36919036448` — **success**; the complete repository test/build/security/provider/host/VSIX regression suite passed.
- P37 Connections and Creative UI — run `36919036348` — **success**; Core build, deterministic P37 tests, registry validation, creative recommendation smoke, extension syntax checks, VSIX packaging, and package-content assertions all passed.

Earlier P37 focused run `36918844913` failed in `actions/setup-node` before any project code executed because npm caching was enabled while the repository intentionally has no root lockfile. This was classified as a **workflow-definition failure**, not a code/test failure and not a runner-allocation failure. The workflow was aligned with the repository's existing `npm install --ignore-scripts` strategy and reran successfully.

PR `#52` had no submitted reviews or unresolved review threads at the final merge check. `main` remained at the expected P36 checkpoint commit before the exact-head merge.

## P37 safety/truthfulness invariants

Future changes must preserve all of the following:

- the Connections Center is not a credential vault;
- local provider inspection remains free of remote account calls;
- live verification remains read-only and never implies authorization to mutate an external service;
- provider login/setup commands and setup URLs come only from trusted extension-side definitions, not webview-supplied strings;
- credentials/tokens are never written into project/checkpoint metadata;
- configured/installed MCP metadata is not treated as verified connected state;
- P36 launcher-bound host-session MCP evidence remains authoritative for current-session MCP readiness;
- a no-login MCP such as Inspo may be ready to configure without being falsely reported as connected;
- third-party skill catalogue presence does not bypass Dockyard package/readiness/trust policy;
- design references are inputs for original synthesis, not authorization to clone a reference site;
- connection readiness never grants deployment, database, DNS, Git, destructive, or production approval.

## P38 continuation target — first guarded Marketplace publication

The next explicit production gate is the first live Visual Studio Marketplace listing/publication using the already-implemented guarded release path.

Current release facts:

- extension: `integrations/vscode` / `dockyardos-vscode`;
- publisher: `cassielxyz`;
- current extension version: `0.1.0`;
- expected release tag: `v0.1.0`;
- Marketplace publication exists only on manual `workflow_dispatch`;
- publication requires `publish_marketplace=true`;
- `release_tag` must exactly equal `v<extension version>`;
- the checked-out publication commit must actually be pointed to by that exact tag;
- repository Actions must contain a valid `VSCE_PAT` secret authorized for the Marketplace publisher;
- the token must remain outside source, checkpoints, issue/PR bodies, logs, and project metadata.

P38 is a **production external mutation**. Do not create the release tag or dispatch Marketplace publication merely because the extension is packaged and CI is green. Before live publication, perform read-only preflight, verify the exact intended publication commit/version, verify required external publisher/token setup without exposing secrets, and obtain explicit production publication approval.

If those prerequisites or explicit approval are unavailable, preserve P38 as externally blocked rather than weakening the release workflow or fabricating success.

## Resume procedure

When the user says `continue`:

1. inspect `main`, recent commits, open PRs, branches, roadmap and CI;
2. verify `67416f90d2ddc923b48506d4d04f8f3679c31d48` is still in current `main` ancestry;
3. inspect any production commits after that anchor before choosing the next milestone;
4. ignore checkpoint-only documentation commits when deciding whether production work advanced;
5. do not recreate P37 Connections/creative-UI work unless regression evidence requires it;
6. if Marketplace publication already occurred, verify the exact tag, commit, workflow and public listing before marking P38 complete;
7. if P38 is not published, perform only safe read-only preflight until all external setup and explicit production approval are present;
8. keep runner-allocation failures (`runner_id: 0`, zero steps), workflow-definition failures, external-provider failures, and real code/test failures as separate classifications;
9. after the next merged or externally completed production milestone, update both this file and `docs/checkpoints/latest.json` immediately.

## Checkpoint maintenance rule

Every completed production milestone must update the durable checkpoint in the same continuation cycle. A chat summary is not sufficient. The repo-level checkpoint must record at minimum:

- verified completed code-state SHA;
- last completed milestone;
- next milestone;
- important safety/trust invariants;
- exact verification evidence when available;
- unresolved external/manual gates.
