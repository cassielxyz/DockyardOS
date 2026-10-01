# DockyardOS Durable Checkpoints

`latest.json` is the machine-readable continuation pointer. `../CURRENT_CHECKPOINT.md` is the human-readable companion.

Checkpoint files exist to prevent agent/chat/session loss from becoming project-state loss.

## Required update cycle

After every merged production milestone:

1. inspect the actual merged `main` SHA and exact-head CI evidence;
2. update `docs/CURRENT_CHECKPOINT.md`;
3. update `docs/checkpoints/latest.json`;
4. record the next milestone and its status;
5. commit the checkpoint before starting unrelated later milestones.

A conversation summary, local hidden state, branch name, or PR body alone is not a durable checkpoint.

On resume, repository state is authoritative. If `main` is newer than `latest.json.mainSha`, inspect the newer commits/PRs first and repair the checkpoint before continuing.
