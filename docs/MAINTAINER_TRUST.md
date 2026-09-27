# DockyardOS Maintainer Trust Operations

DockyardOS keeps contributor staging separate from trusted runtime registry files. P14 adds an explicit **maintainer-only plan/apply path** for the source-controlled trust transitions that follow independent review.

These commands do not replace identity verification, Code Owner review, or source-control review. They make the resulting registry edit deterministic and fail closed when the reviewed state changes.

## Safety model

Maintainer operations are read-only unless `--apply` is supplied.

Every applied trust mutation also requires:

- a maintainer identity in `--reviewed-by`;
- a meaningful `--rationale`;
- the exact `beforeSha256` returned by a fresh plan, supplied as `--expected-sha256`;
- the operation-specific explicit approval flag;
- execution from the DockyardOS Git repository;
- the canonical repository trust file path (`registry/publishers.json` or `registry/community.json`).

The command aborts if the current registry digest has changed since review. This prevents applying an approval to a different trust state.

Publisher proposal files are public-key-only. The contribution validator rejects private-key PEM blocks and rejects unexpected fields so private keys, tokens, or other secret material cannot hitchhike beside valid onboarding metadata.

## Publisher onboarding

First validate the proposal and verify publisher identity independently from the pull request itself.

```bash
dockyard community contribution validate-publisher \
  --file registry/publisher-proposals/<publisher-key>.json
```

Generate the non-mutating trust plan:

```bash
dockyard community maintainer publisher onboard \
  --proposal registry/publisher-proposals/<publisher-key>.json \
  --reviewed-by <maintainer-id> \
  --rationale "Publisher identity independently verified and public key ownership confirmed."
```

Review `changes`, `warnings`, `beforeSha256`, `afterSha256`, and the proposed `next` trust registry. Then apply only the exact reviewed state:

```bash
dockyard community maintainer publisher onboard \
  --proposal registry/publisher-proposals/<publisher-key>.json \
  --reviewed-by <maintainer-id> \
  --rationale "Publisher identity independently verified and public key ownership confirmed." \
  --apply \
  --expected-sha256 <beforeSha256> \
  --approve-trust-change
```

The result is a normal source-control change to `registry/publishers.json`; it should still be reviewed before merge.

## Publisher key rotation

Rotation is one atomic planned state transition: add the replacement public key and mark the previous trusted key revoked at the review timestamp.

```bash
dockyard community maintainer publisher rotate \
  --proposal registry/publisher-proposals/<replacement-key>.json \
  --old-key-id <current-key-id> \
  --reviewed-by <maintainer-id> \
  --rationale "Publisher requested scheduled key rotation and replacement ownership was independently verified."
```

After reviewing the plan, repeat with:

```text
--apply --expected-sha256 <beforeSha256> --approve-trust-change
```

The replacement proposal must belong to the same publisher as the old key and must use a new key ID. Existing manifests signed only by the revoked key stop satisfying trusted publisher verification, so maintained manifests should be re-signed with the replacement key as part of the migration.

## Emergency or administrative revocation

Plan revocation:

```bash
dockyard community maintainer publisher revoke \
  --key-id <key-id> \
  --reviewed-by <maintainer-id> \
  --rationale "Key compromise confirmed through the incident-response review."
```

Apply only after reviewing the exact digest:

```text
--apply --expected-sha256 <beforeSha256> --approve-trust-change
```

If the revoked key is the publisher's final active key, the plan emits a visible warning. DockyardOS does not silently add a replacement or weaken signature requirements.

## Contribution promotion

A contribution must already be P12 `review-ready`: structurally valid, `trust: community`, signed by a current non-revoked publisher key, and pinned to an immutable 40-character Git commit. Bundled package-ID collisions are rejected.

Plan promotion:

```bash
dockyard community maintainer promote \
  --file registry/contributions/<package>.json \
  --reviewed-by <maintainer-id> \
  --rationale "Package contents, permissions, source revision, signature, and maintainer review completed."
```

Apply the exact reviewed bundled-registry state with:

```text
--apply --expected-sha256 <beforeSha256> --approve-registry-change
```

Promotion copies the reviewed signed manifest into `registry/community.json`. It **does not** elevate third-party trust above `community`, change the immutable source revision, strip the publisher signature, install the package, or activate package code.

## What these commands never do

They never:

- sign a publisher proposal on behalf of a contributor;
- read a contributor private key;
- accept private-key material in a publisher proposal;
- grant trust from pull-request CI;
- use `pull_request_target` to expose maintainer secrets to contributor code;
- bypass P6/P8 package quarantine or activation policy;
- silently resolve registry/package collisions;
- overwrite an unexpected trust-file path;
- apply a plan after the reviewed registry state has changed.

Remote registry-envelope signing/publication and external transparency anchoring remain separate milestones because those operations involve registry signing authority rather than publisher onboarding or bundled manifest promotion.
