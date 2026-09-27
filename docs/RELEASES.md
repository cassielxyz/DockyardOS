# DockyardOS Release and Real-Host Verification

DockyardOS separates normal continuous integration, package creation, Marketplace publication, and third-party host verification so a routine code contribution cannot accidentally publish or execute unrelated external tooling.

## VS Code package pipeline

The extension manifest lives at `integrations/vscode/package.json`. The release workflow is `.github/workflows/vscode-extension.yml`.

Tag pushes matching `v*` and manual workflow runs may build and upload a VSIX artifact. Building an artifact is not a Marketplace mutation.

Marketplace publication is available only from a manual `workflow_dispatch` run with `publish_marketplace=true`. The workflow then requires:

- a non-empty `release_tag`,
- `release_tag` exactly equal to `v<extension version>`,
- the checked-out commit to be pointed to by that exact tag,
- repository secret `VSCE_PAT`,
- passing DockyardOS tests and VSIX identity checks.

The workflow does not create release tags, does not publish from pull requests, and does not automatically publish merely because a `v*` tag was pushed.

## Marketplace publisher setup

Before the first live publication, create/configure the VS Code Marketplace publisher represented by the extension manifest (`cassielxyz`) and store its publishing token as the GitHub Actions repository secret `VSCE_PAT`.

For extension version `0.1.0`, a live publication run must target `v0.1.0` on the intended release commit. If the release tag and manifest version differ, the workflow fails before publication.

Rotating or revoking the Marketplace token is an account/secret-management operation and is intentionally outside source control.

## Real-host matrix

`.github/workflows/real-host-matrix.yml` is manual-only and validates DockyardOS against currently installable public host CLIs without sending model prompts.

Covered hosts:

| Dockyard host | CLI executable | Installation source |
| --- | --- | --- |
| Gemini CLI | `gemini` | `@google/gemini-cli` |
| OpenAI Codex | `codex` | `@openai/codex` |
| Claude Code | `claude` | `https://claude.ai/install.sh` |
| Cursor | `agent` | `https://cursor.com/install` |
| OpenCode | `opencode` | `@opencode/cli` |

For npm packages, the workflow resolves the current published version and records it before installing that exact version. For installer scripts, it downloads the script over HTTPS and records its SHA-256 before execution. This evidence is uploaded per host for 14 days.

After installation, the job verifies:

1. the expected executable is on `PATH`,
2. the executable can report its version,
3. DockyardOS `host inspect` detects it,
4. DockyardOS `host doctor` passes the executable check,
5. project-scope DockyardOS portable integration can be installed,
6. a second doctor run detects both the real host executable and Dockyard integration.

The workflow does not authenticate to model providers or perform prompts/completions, so it validates compatibility and installation surfaces without consuming model credentials.

## Antigravity

DockyardOS continues to package and statically verify its Antigravity plugin. P11 does not invent an unattended public installation mechanism for Antigravity. A real-CLI CI lane should be added only after an official stable noninteractive install surface is verified.

## Release checklist

Before a live Marketplace publication:

- normal `CI` must be green on the release commit,
- the manually dispatched real-host matrix should be green for the intended compatibility set,
- extension version and release tag must match,
- inspect the uploaded VSIX artifact,
- confirm `VSCE_PAT` belongs to the intended Marketplace publisher,
- dispatch the VS Code Extension workflow with `publish_marketplace=true` and the exact tag.

Publication remains an explicit release action rather than an autonomous side effect of development.
