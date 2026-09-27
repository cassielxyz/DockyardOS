# DockyardOS Maintainer Trust Operations

DockyardOS keeps contributor staging separate from trusted runtime registry files. P14 adds an explicit **maintainer-only plan/apply path** for the source-controlled trust transitions that follow independent review.

These commands do not replace identity verification, Code Owner review, or source-control review. They make the resulting registry edit deterministic and fail closed when either the reviewed current state or the reviewed next state changes.

## Safety model

Maintainer operations are read-only unless `--apply` is supplied.

Every applied trust mutation also requires:

- a maintainer identity in `--reviewed-by`;
- a meaningful `--rationale`;
- the exact `plan.review.reviewedAt` timestamp supplied back as `--reviewed-at`;
- the exact `beforeSha256` returned by the reviewed plan, supplied as `--expected-sha256`;
- the exact `afterSha256` returned by the reviewed plan, supplied as `--expected-after-sha256`;
- the operation-specific explicit approval flag;
- execution from the DockyardOS source repository;
- the canonical repository trust-file path (`registry/publishers.json` or `registry/community.json`).

Publisher onboarding/rotation reads only regular, non-symlink proposal files inside `registry/publisher-proposals/`. Contribution promotion reads only regular, non-symlink manifests inside `registry/contributions/`. This keeps P14 bound to P12's inert review queues instead of allowing an arbitrary external JSON file to bypass source-control review.

The command aborts if the current registry digest has changed, if the review timestamp differs from the reviewed plan, or if the recomputed next-state digest differs from `afterSha256`. A successful apply therefore recreates the exact reviewed transition rather than merely applying something to the same starting state.

Publisher proposal files are public-key-only. The contribution validator rejects private-key PEM blocks and unexpected fields so private keys, tokens, or other secret material cannot hitchhike beside valid onboarding metadata.

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

Review `changes`, `warnings`, `review.reviewedAt`, `beforeSha256`, `afterSha256`, and the proposed `next` trust registry. Then apply only that exact reviewed transition:

```bash
dockyard community maintainer publisher onboard \
  --proposal registry/publisher-proposals/<publisher-key>.json \
  --reviewed-by <maintainer-id> \
  --rationale "Publisher identity independently verified and public key ownership confirmed." \
  --reviewed-at <plan.review.reviewedAt> \
  --apply \
  --expected-sha256 <beforeSha256> \
  --expected-after-sha256 <afterSha256> \
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
--reviewed-at <plan.review.reviewedAt> --apply --expected-sha256 <beforeSha256> --expected-after-sha256 <afterSha256> --approve-trust-change
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

Apply only after reviewing the exact transition:

```text
--reviewed-at <plan.review.reviewedAt> --apply --expected-sha256 <beforeSha256> --expected-after-sha256 <afterSha256> --approve-trust-change
```

If the revoked key is the publisher's final active key, the plan emits a visible warning. DockyardOS does not silently add a replacement or weaken signature requirements.

## Contribution promotion

A contribution must already be P12 `review-ready`: structurally valid, `trust: community`, signed by a current non-revoked publisher key, pinned to an immutable 40-character Git commit, and present in `registry/contributions/`. Bundled package-ID collisions are rejected.

Plan promotion:

```bash
dockyard community maintainer promote \
  --file registry/contributions/<package>.json \
  --reviewed-by <maintainer-id> \
  --rationale "Package contents, permissions, source revision, signature, and maintainer review completed."
```

Apply the exact reviewed bundled-registry state with:

```text
--reviewed-at <plan.review.reviewedAt> --apply --expected-sha256 <beforeSha256> --expected-after-sha256 <afterSha256> --approve-registry-change
```

Promotion copies the reviewed signed manifest into `registry/community.json`. It **does not** elevate third-party trust above `community`, change the immutable source revision, strip the publisher signature, install the package, or activate package code.

## What these commands never do

They never:

- sign a publisher proposal on behalf of a contributor;
- read a contributor private key;
- accept private-key material in a publisher proposal;
- trust/promote a proposal from outside the P12 staging queues;
- follow a staging-file symlink into an arbitrary path;
- grant trust from pull-request CI;
- use `pull_request_target` to expose maintainer secrets to contributor code;
- bypass P6/P8 package quarantine or activation policy;
- silently resolve registry/package collisions;
- overwrite an unexpected trust-file path;
- apply a plan after the reviewed current state changes;
- apply a next state whose timestamp or digest differs from the reviewed plan.

Remote registry-envelope signing/publication and external transparency anchoring remain separate milestones because those operations involve registry signing authority rather than publisher onboarding or bundled manifest promotion.
