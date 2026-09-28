# Public Package-Action Transparency Anchors

DockyardOS keeps a local tamper-evident hash chain for community package actions such as resolve, quarantine, approve, install, update, rollback, and reject.

P25 can publish a **privacy-preserving checkpoint** of that chain to a public GitHub repository. It does not publish the local action history itself.

## Public vs local evidence

The local file remains under DockyardOS state:

```text
~/.dockyardos/community/transparency.json
```

It may contain package ids, revisions, content hashes, action names, timestamps, and local action detail.

The public P25 record contains only:

```text
schemaVersion
kind = dockyard-community-package-action-anchor
anchorId
chainSchemaVersion
records
headRecordHash
transparencyLogSha256
```

Reviewer identity, review rationale, package ids, action names, revisions, and action detail are intentionally absent from the public record. Review metadata is retained only in the local anchor audit.

## Plan first

Choose a stable namespace for the local DockyardOS installation/team and a public witness repository:

```bash
dockyard community transparency anchor plan \
  --anchor-id my-dockyard \
  --repository OWNER/PUBLIC_REPO \
  --branch main \
  --reviewed-by maintainer-id \
  --rationale 'Reviewed the local package action chain before publishing this public commitment.'
```

Planning is read-only. DockyardOS:

1. requires a non-empty local transparency log;
2. verifies its sequence, previous-hash links, and record hashes;
3. hashes the exact local `transparency.json` bytes;
4. creates the compact public witness record;
5. verifies that the target GitHub repository is public, enabled, non-archived, and that the branch exists;
6. inspects the derived content-addressed path;
7. returns `approvalSha256` plus the canonical `review.reviewedAt`.

The target path is derived from the chain state:

```text
dockyard-transparency/package-actions/<anchor-id>/<record-count>-<head-hash>.json
```

If that path already contains the exact same bytes, the plan is idempotent. Different existing bytes fail closed and are never overwritten.

## Apply the exact reviewed plan

Reuse the exact `review.reviewedAt` and `approvalSha256` from the plan:

```bash
dockyard community transparency anchor run \
  --anchor-id my-dockyard \
  --repository OWNER/PUBLIC_REPO \
  --branch main \
  --reviewed-by maintainer-id \
  --rationale 'Reviewed the local package action chain before publishing this public commitment.' \
  --reviewed-at '<plan.review.reviewedAt>' \
  --expected-plan-sha256 '<plan.approvalSha256>' \
  --approve-anchor
```

Run re-plans the local chain and remote target immediately before mutation. If the package-action chain advanced, the public target changed, review inputs changed, or any other approval-bound state differs, the old approval is rejected.

GitHub authentication comes from the existing authenticated `gh` CLI. DockyardOS does not accept or persist a token argument for this operation.

## Post-upload verification

After GitHub accepts the create-only content mutation, DockyardOS reads the public file back and verifies the exact expected bytes and SHA-256.

Results are:

- `complete` — public bytes were re-read and match exactly;
- `already-anchored` — the exact content-addressed witness already existed;
- `anchored-unverified` — GitHub accepted mutation but DockyardOS could not prove the final public bytes immediately; this is not reported as fully verified.

A local audit is retained under:

```text
~/.dockyardos/community/package-action-anchors/<anchor-id>/
```

The local audit includes review identity/rationale and approval digest. The public witness does not.

## What this proves

A public witness can later demonstrate that a particular DockyardOS package-action chain state—with a specific record count, head hash, and complete local-log hash—existed at or before the public Git commit that recorded the witness.

It does **not** prove that every local action was correct, safe, or authorized by itself. The underlying DockyardOS signature, quarantine, immutable revision, approval, and local chain checks remain the authoritative package-operation controls.

## Safety properties

P25 is intentionally optional and manual:

- no scheduled or automatic public anchoring;
- public repository verification before mutation;
- explicit approval required;
- approval bound to exact local and remote state;
- create-only content-addressed paths;
- no overwrite of a conflicting witness;
- local hash-chain verification before network mutation;
- bounded local/public evidence sizes;
- no package history or maintainer rationale in public witness bytes;
- exact post-write verification;
- local audit retained for accountability.
