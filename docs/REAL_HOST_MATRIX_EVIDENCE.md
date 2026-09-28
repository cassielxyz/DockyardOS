# Real Host Matrix Evidence

DockyardOS completed its first fully green six-host real-agent-host verification on **September 28, 2026**.

## Verified run

- Workflow: `Real Host Matrix`
- Run number: `13`
- Run ID: `36425594147`
- Trigger: opt-in `verify/real-host/**` branch push
- Verification branch: `verify/real-host/p26-5-20260928`
- Exact tested DockyardOS commit: `854434f26e6c084dba6d6e532ff689db60ced77f`
- Result: **all six host lanes passed**
- Model prompts/API credentials: **not used**

The verification branch points to the same commit that was merged to `main`; the branch exists only to activate the opt-in host workflow without making the expensive matrix run on ordinary `main` pushes or pull requests.

## Hosts verified

| Host | Executable | Install surface | Result |
| --- | --- | --- | --- |
| Google Antigravity | `agy` | official `https://antigravity.google/cli/install.sh` | pass |
| Gemini CLI | `gemini` | `@google/gemini-cli` | pass |
| OpenAI Codex CLI | `codex` | `@openai/codex` | pass |
| Claude Code | `claude` | official `https://claude.ai/install.sh` | pass |
| Cursor CLI | `agent` | official `https://cursor.com/install` | pass |
| OpenCode | `opencode` | `@opencode/cli` | pass |

Every lane built the same DockyardOS commit, installed the current public host CLI, verified the executable/version, initialized an isolated Dockyard project, ran host inspection/doctor, installed the project-scope Dockyard integration, re-ran doctor, and uploaded per-host evidence.

The Antigravity lane additionally verified the real CLI-managed plugin surface using `agy plugin install <local DockyardOS plugin>` followed by `agy plugin list`, without invoking a model. DockyardOS separately verified its project-scope workspace plugin install at `.agents/plugins/dockyardos`.

## Evidence artifacts

GitHub Actions retained the following run artifacts for 14 days. Their digests are recorded here so later review can distinguish the exact archives produced by the green run even after GitHub expires the downloadable files.

| Host | Artifact ID | Artifact name | SHA-256 digest |
| --- | ---: | --- | --- |
| Antigravity | `10971686298` | `real-host-antigravity-36425594147` | `1ea23ec8dcf5d9939efede5a1315187c557b7cd7bdcb0d2e8cc0eb9b1eb12ac3` |
| Gemini CLI | `10970638381` | `real-host-gemini-cli-36425594147` | `e752a3436149ed00114a6ac4fdc6fd31fc7c097e2059ea34d46f24840e392ec3` |
| Codex CLI | `10970788227` | `real-host-codex-36425594147` | `797b69264026b49d1d770f610d7bb7119dc6b571277332c91a482e83adba87ce` |
| Claude Code | `10971392814` | `real-host-claude-code-36425594147` | `015e4b684249ec1f3fc2f116e8b95f47a3d2411b348c8dbcbe920e7d53a2ea53` |
| Cursor CLI | `10971133393` | `real-host-cursor-36425594147` | `37f260f93d44e8e1b2172e87286b755d7a85737d55dfe49e7237b768d116e415` |
| OpenCode | `10971398116` | `real-host-opencode-36425594147` | `64cae31ab6655d470949cfb908a415cebc516f5476238b9f1c5a1edbac76ef4f` |

## Antigravity fixes validated by this run

The green run includes the P26.2–P26.5 corrections that were derived from earlier real-host failures:

1. project-scope Antigravity integration installs the full DockyardOS workspace plugin instead of incorrectly assuming a portable-skill-only path;
2. project integration writes fail closed when a destination or parent path is symlinked outside the workspace;
3. the expensive real-host matrix remains opt-in but can be triggered by an authenticated `verify/real-host/**` branch;
4. the native CLI probe uses Antigravity's CLI-managed plugin import/list flow instead of assuming workspace plugins appear in `agy plugin list`.

## Remaining release gate

The cross-host runtime verification gate is complete. The remaining first-release production gate is the guarded VS Code Marketplace publication, which still requires the configured Marketplace publisher/token, an exact matching version tag, explicit `publish_marketplace=true`, and the existing release workflow checks.
