# Reviewed remote-registry publication

DockyardOS remote registries are consumed only after signature, source, sequence, expiry, trust-ceiling, and registry validation. P19 adds the maintainer-side publication path for producing those signed envelopes without making publication automatic.

## Safety model

Publication is deliberately two-step:

1. `plan` is read-only. It validates the reviewed registry index, trusted public key, GitHub target, current remote bytes, and monotonic sequence. It does **not** read the registry private key.
2. `run` is mutating. It must reuse the exact `review.reviewedAt` timestamp from the plan, present the exact `approvalSha256`, and include `--approve-publication`.

The approval digest binds all of the following together:

- reviewer identity, rationale, and review timestamp;
- registry id and trusted key id;
- sequence and expiry;
- repository-relative reviewed index path plus canonical registry index SHA-256;
- unsigned envelope payload SHA-256;
- GitHub owner/repository, branch, and JSON path;
- the exact observed remote blob/content SHA-256 and previous sequence, or the fact that the target did not yet exist.

If any bound value changes, a fresh plan is required. Using a repository-relative review path keeps the reviewed plan stable across equivalent DockyardOS checkouts without weakening the review-queue confinement check.

## Review queue

Candidate registry indexes must be regular non-symlink JSON files under:

```text
registry/remote-publications/
```

The directory is inert. Files there are never discovered, signed, activated, or published simply because they exist in the repository.

The candidate must pass the normal DockyardOS community-registry validator before a plan is produced. Publication is capped at 1 MiB so DockyardOS can use the normal GitHub repository-contents response for exact before/after byte verification. GitHub documents full Contents API support for files of 1 MiB or smaller; larger files require different media handling and are intentionally outside this milestone.

## Registry signing key

Generate a registry key locally if one does not already exist:

```bash
dockyard community registry-key keygen \
  --id dockyard-community \
  --key-id dockyard-community-key-1
```

Only the returned public trust-store entry belongs in `registry/registry-keys.json`. The private key remains under DockyardOS external signing-key state and is never printed by the key-generation command.

The canonical `registry/registry-keys.json` used by the maintainer CLI must itself be a real regular non-symlink file. P19 refuses publication with a missing, substituted, revoked, or incompatible trusted key. During `run`, the locally produced Ed25519 signature is verified against that trusted public key before any GitHub mutation is attempted.

## Plan

Example:

```bash
dockyard community maintainer registry-publication plan \
  --file registry/remote-publications/community-index.json \
  --registry-id dockyard-community \
  --key-id dockyard-community-key-1 \
  --sequence 12 \
  --expires-at 2026-10-20T00:00:00.000Z \
  --repository OWNER/REGISTRY_REPO \
  --path registry/community.json \
  --branch registry \
  --reviewed-by maintainer-id \
  --rationale 'Reviewed package/index changes and remote publication target.'
```

Record these values from the output before approving publication:

- `review.reviewedAt`
- `approvalSha256`
- `indexPath`
- `indexSha256`
- `envelopePayloadSha256`
- `remote`
- `target`

`plan` uses the authenticated `gh` CLI only for read-only GitHub target inspection. A 404 is treated as an absent target only after DockyardOS separately confirms that the requested repository branch is accessible; an authorization/branch failure is not silently converted into a create plan.

For an existing target, DockyardOS requires a normal Base64-encoded file response with a bounded size and a valid Git blob SHA. Whitespace inserted by GitHub's JSON response is removed, but the remaining Base64 must be canonical and must decode to exactly the declared byte count. Malformed or ambiguous content fails closed before a plan can be approved.

## Publish

Reuse the exact reviewed timestamp and plan digest:

```bash
dockyard community maintainer registry-publication run \
  --file registry/remote-publications/community-index.json \
  --registry-id dockyard-community \
  --key-id dockyard-community-key-1 \
  --sequence 12 \
  --expires-at 2026-10-20T00:00:00.000Z \
  --repository OWNER/REGISTRY_REPO \
  --path registry/community.json \
  --branch registry \
  --reviewed-by maintainer-id \
  --rationale 'Reviewed package/index changes and remote publication target.' \
  --reviewed-at <plan.review.reviewedAt> \
  --expected-plan-sha256 <plan.approvalSha256> \
  --approve-publication
```

The run performs these checks again immediately before mutation:

1. reload and validate the staged index;
2. re-read the GitHub target and regenerate the plan;
3. require the exact approved plan SHA-256;
4. re-read the real non-symlink public trust store;
5. load the local registry private key;
6. sign the deterministic envelope payload;
7. verify the signature against the trusted public key;
8. enforce the 1 MiB signed-envelope bound;
9. send the Base64 content through GitHub's Contents API using authenticated `gh`;
10. when replacing a file, include the exact blob SHA observed by the plan so concurrent target changes fail instead of being overwritten;
11. require valid content-blob and commit SHA metadata from GitHub's mutation response;
12. re-read the published target and require the exact signed content SHA-256, sequence, and response blob SHA.

The GitHub Contents API requires repository Contents write permission for mutation. DockyardOS does not accept a token argument and does not store GitHub credentials in its state.

## Sequence and replay protection

A publication sequence must strictly advance the sequence already present at the target. Equal or lower sequences are refused before signing. The consumer-side remote-registry synchronizer independently enforces rollback/equivocation checks, so publisher and consumer both preserve monotonic history.

If the existing target cannot be parsed as a compatible envelope for the requested registry, publication fails closed instead of replacing unknown content. If the target changes between review and `run`, the regenerated plan digest changes and the old approval is rejected before signing or publication.

## Audit evidence

After a successful GitHub mutation, DockyardOS stores the exact signed envelope and a separate audit record under external state:

```text
~/.dockyardos/community/publications/<registry-id>/
```

The audit record includes the review identity/rationale, approval digest, index/payload hashes, remote-before state, target, resulting GitHub blob/commit SHA when returned, and exact published content SHA-256. It contains no GitHub credential and no private signing key.

A mutation followed by missing/invalid mutation metadata or failed post-publication verification is reported as `published-unverified` and returns CLI exit code 2. It is never described as complete; the audit artifact preserves the state needed for operator investigation.

## Not included in P19

P19 does not automatically push a publication on merge, schedule publishing, create registry trust keys, elevate community package trust, bypass contribution review, or create a public transparency witness. External/public transparency anchoring remains a separate milestone so it cannot silently become another publication side effect.
