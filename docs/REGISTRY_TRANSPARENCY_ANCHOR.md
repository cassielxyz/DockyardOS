# Public registry transparency anchoring

P20 adds an external witness for a registry envelope that has already completed the reviewed P19 publication flow.

It does **not** publish registry content, grant trust, rotate keys, or make a package installable. The anchor is a small public record that commits to the exact publication evidence by hash and GitHub object identity.

## Why this is separate from publication

P19 publishes a signed remote-registry envelope to its registry repository after an explicit reviewed plan. P20 deliberately uses a **different public GitHub repository** as a witness.

Keeping those roles separate means a normal registry publication cannot silently create or rewrite its own transparency evidence. The witness record is created only through a second reviewed plan and explicit approval.

## Required source evidence

P20 accepts only a P19 audit whose state is:

```text
status: complete
operation: registry-envelope-publish
schemaVersion: 1
```

Before contacting the witness repository, DockyardOS reopens the P19 audit and signed envelope from external DockyardOS state and verifies:

- the audit and envelope are real regular files confined beneath `~/.dockyardos/community/publications/` after realpath resolution;
- the audit is stored beneath its registry-specific publication directory;
- registry id, key id, sequence, repository, branch, path, Git blob SHA, and Git commit SHA are structurally valid;
- the exact signed-envelope bytes match the audit's `signedContentSha256`;
- the envelope identity matches the audit registry id, key id, and sequence;
- the canonical index SHA-256 matches the P19 audit;
- the unsigned envelope-payload SHA-256 matches the P19 audit;
- the canonical repository `registry/registry-keys.json` is a confined, real non-symlink trust file;
- the referenced Ed25519 registry key is trusted and not revoked;
- the signed envelope verifies against that trusted public key.

A `published-unverified` P19 result is not eligible for public anchoring.

## Public anchor record

The witness record contains technical evidence only:

- registry id and sequence;
- registry signing key id;
- exact signed publication SHA-256;
- canonical registry index SHA-256;
- unsigned envelope-payload SHA-256;
- the P19 publication approval SHA-256;
- the exact P19 audit-file SHA-256;
- original publication repository, path, branch, blob SHA, and commit SHA.

Reviewer identity and rationale are **not** copied into the public witness record. They remain in the local P20 approval/audit evidence.

## Content-addressed create-only path

DockyardOS derives the public path itself:

```text
dockyard-transparency/
  registry-publications/
    <registry-id>/
      <12-digit-sequence>-<signed-publication-sha256>.json
```

The operator cannot choose a different file path.

P20 never supplies an existing blob SHA to the GitHub Contents API. The mutation is therefore create-only:

- absent path: an explicitly approved run may create it;
- exact existing bytes: treated as an idempotent already-anchored result;
- different existing bytes at the derived path: fail closed;
- a concurrent creator winning the race: GitHub rejects the create rather than DockyardOS overwriting it.

## Plan

Use a complete P19 audit and a different public GitHub repository:

```bash
dockyard community maintainer registry-anchor plan \
  --audit ~/.dockyardos/community/publications/<registry-id>/<publication>.audit.json \
  --repository OWNER/PUBLIC_WITNESS_REPO \
  --branch main \
  --reviewed-by maintainer-id \
  --rationale 'Reviewed the complete publication evidence and public witness target.'
```

`plan` is read-only. It verifies the P19 evidence, confirms that the destination repository is public and different from the original registry repository, confirms the requested branch exists, derives the exact anchor record/path, and inspects any existing anchor.

Review and retain:

- `review.reviewedAt`
- `approvalSha256`
- `publicationAuditSha256`
- `anchorSha256`
- `anchorRecord`
- `target`
- `remote`

The approval SHA-256 binds the private review metadata, verified P19 audit hash, exact public anchor record, target repository/branch/path, and observed remote state.

## Anchor

Reuse the exact reviewed timestamp and plan digest:

```bash
dockyard community maintainer registry-anchor run \
  --audit ~/.dockyardos/community/publications/<registry-id>/<publication>.audit.json \
  --repository OWNER/PUBLIC_WITNESS_REPO \
  --branch main \
  --reviewed-by maintainer-id \
  --rationale 'Reviewed the complete publication evidence and public witness target.' \
  --reviewed-at <plan.review.reviewedAt> \
  --expected-plan-sha256 <plan.approvalSha256> \
  --approve-anchor
```

The run regenerates the whole plan first. Any change to the source audit/envelope, trust state, target repository/branch, anchor bytes, or existing remote state changes the plan digest and invalidates the old approval.

The mutation uses the authenticated `gh` CLI. DockyardOS accepts no GitHub token argument and stores no GitHub credential in the anchor record or local audit.

After GitHub accepts the create, DockyardOS re-reads the public path and requires the exact reviewed bytes plus the blob SHA returned by the mutation response.

Possible results:

- `complete` — create response metadata and exact public re-read were verified;
- `already-anchored` — the exact public bytes already existed and no second mutation was made;
- `anchored-unverified` — GitHub accepted a mutation but response metadata or the post-create verification was incomplete or inconsistent. The CLI exits with code 2 for this state.

## Local audit evidence

P20 stores private operator evidence under:

```text
~/.dockyardos/community/anchors/<registry-id>/
```

The local audit records the reviewed timestamp, reviewer, rationale, approval SHA-256, source P19 audit hash/path, exact public anchor record, prior remote state, and GitHub result metadata. It does not contain GitHub credentials or registry private-key material.

## What this proves — and what it does not

A successful P20 anchor gives reviewers a second public repository containing a compact commitment to a specific signed registry publication. The local evidence binds that public object to the exact reviewed P19 audit and GitHub publication objects.

This is **not** an independent cryptographic timestamping authority and should not be described as immutable. Administrators of a GitHub repository can rewrite or delete Git history. DockyardOS therefore records and verifies exact content SHA-256, blob SHA, and commit SHA values so later disappearance or substitution is detectable against retained evidence.

A stronger third-party append-only ledger or timestamp service can be added as a separate witness backend in the future without weakening this create-only GitHub witness model.
