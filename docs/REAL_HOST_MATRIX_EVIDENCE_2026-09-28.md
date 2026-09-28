# Real Host Matrix Evidence — 2026-09-28

This note preserves the release-relevant evidence from the first fully green six-host DockyardOS real-host matrix after P26.5.

## Verified source state

- Repository: `cassielxyz/DockyardOS`
- Exact verified source SHA: `854434f26e6c084dba6d6e532ff689db60ced77f`
- `main` SHA at verification time: `854434f26e6c084dba6d6e532ff689db60ced77f`
- Verification branch: `verify/real-host/p26-5-20260928`
- Workflow: `Real Host Matrix`
- Run number: `13`
- Run ID: `36425594147`
- Trigger: restricted `verify/real-host/**` push
- Result: **success**
- Started: `2026-09-28T13:00:46Z`
- Completed: `2026-09-28T13:01:19Z`
- Run URL: `https://github.com/cassielxyz/DockyardOS/actions/runs/36425594147`

The verification branch pointed to the exact merged `main` commit above. No model prompt/API-key execution was part of the matrix.

## Lane results

All six jobs completed successfully:

| Host | Executable | Job ID | Result |
| --- | --- | ---: | --- |
| Google Antigravity | `agy` | `108938636951` | success |
| Gemini CLI | `gemini` | `108938636600` | success |
| OpenAI Codex | `codex` | `108938636920` | success |
| Claude Code | `claude` | `108938636867` | success |
| Cursor | `agent` | `108938637036` | success |
| OpenCode | `opencode` | `108938636932` | success |

Every lane built DockyardOS, installed the current public host CLI through the lane's pinned/recorded installation mechanism, verified the executable, exercised DockyardOS host inspection/doctor/integration, and uploaded retained evidence. The Antigravity lane additionally passed the CLI-managed plugin verification step using `agy plugin install` followed by `agy plugin list`, while the independent DockyardOS project-scope workspace integration check also passed.

## Retained GitHub Actions artifacts

GitHub retained six evidence artifacts for the run. These artifacts expire after 14 days, so the names and GitHub-reported SHA-256 digests are recorded here permanently.

| Host | Artifact | GitHub artifact ID | SHA-256 digest | Actions expiry |
| --- | --- | ---: | --- | --- |
| Antigravity | `real-host-antigravity-36425594147` | `10971686298` | `1ea23ec8dcf5d9939efede5a1315187c557b7cd7bdcb0d2e8cc0eb9b1eb12ac3` | `2026-10-12T13:01:02Z` |
| Gemini CLI | `real-host-gemini-cli-36425594147` | `10970638381` | `e752a3436149ed00114a6ac4fdc6fd31fc7c097e2059ea34d46f24840e392ec3` | `2026-10-12T13:01:04Z` |
| Codex | `real-host-codex-36425594147` | `10970788227` | `797b69264026b49d1d770f610d7bb7119dc6b571277332c91a482e83adba87ce` | `2026-10-12T13:01:03Z` |
| Claude Code | `real-host-claude-code-36425594147` | `10971392814` | `015e4b684249ec1f3fc2f116e8b95f47a3d2411b348c8dbcbe920e7d53a2ea53` | `2026-10-12T13:01:09Z` |
| Cursor | `real-host-cursor-36425594147` | `10971133393` | `37f260f93d44e8e1b2172e87286b755d7a85737d55dfe49e7237b768d116e415` | `2026-10-12T13:01:02Z` |
| OpenCode | `real-host-opencode-36425594147` | `10971398116` | `64cae31ab6655d470949cfb908a415cebc516f5476238b9f1c5a1edbac76ef4f` | `2026-10-12T13:01:16Z` |

These digests are the GitHub Actions artifact digests reported by the run metadata. This repository note preserves the evidence identifiers and hashes after GitHub removes the downloadable ZIPs; it is not a substitute for the original artifact contents while they remain available.

## Release interpretation

This run closes the roadmap item requiring a green real-host compatibility matrix against installed public host CLIs for the exact merged source state.

It verifies DockyardOS integration/discovery/doctor behavior against the six supported host CLIs. It does **not** authenticate to those hosts' model providers, send prompts, or claim model-response compatibility.

After this checkpoint, the remaining explicit production release gate is the first guarded VS Code Marketplace publication using the existing tag/version/token-gated workflow.
