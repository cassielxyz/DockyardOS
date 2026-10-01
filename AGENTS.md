# DockyardOS Agent Instructions

Before modifying this repository, read:

1. `docs/AGENT_CONTINUATION_GUIDE.md`
2. `docs/checkpoints/latest.json`
3. `docs/CURRENT_CHECKPOINT.md`
4. `docs/ROADMAP.md`
5. the feature documentation relevant to the task

## Mandatory preflight

Do not rely on chat/session memory alone.

Before starting or continuing work:

- inspect current `main` and recent commits;
- inspect open PRs and active work branches;
- inspect current CI/workflow evidence;
- compare the repository against `docs/checkpoints/latest.json`;
- inspect production commits after `verifiedCodeSha`;
- if newer production work exists, treat it as authoritative and repair stale checkpoint/docs before continuing;
- do not recreate completed milestones;
- do not overwrite or force-push newer work from another agent.

## Implementation rule

Extend existing DockyardOS subsystems instead of creating parallel replacements. Preserve current approval, capability-readiness, community trust, provider mutation, security, checkpoint, and host-integration boundaries.

Use a dedicated milestone branch for substantial work, add/update deterministic tests and relevant docs, require exact-head CI before merge, verify merged `main`, and update the durable checkpoint immediately after every merged production milestone.

The full continuation and parallel-agent contract is in `docs/AGENT_CONTINUATION_GUIDE.md`.
