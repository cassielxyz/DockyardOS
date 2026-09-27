# DockyardOS Community Distribution

DockyardOS separates **discovery**, **registry trust**, **package trust**, **installation**, **execution**, and **updates**.

A capability may appear in a broad discovery source without being installable. It becomes installable only when DockyardOS has an explicit package manifest with source, ref, entrypoints, permissions, trust/risk metadata, host compatibility, license, file/byte limits, and publisher-signature policy.

## Trust flow

```text
discovery source / signed remote registry
    ↓ registry signature, expiry, size, replay/equivocation checks
collision-safe effective registry
    ↓ unique explicit package manifest only
GitHub ref resolved to immutable commit
    ↓
quarantine directory under ~/.dockyardos/community/quarantine
    ↓
static scan + entrypoint validation + permission inference
    ↓
publisher signature policy
    ↓
optional isolated dynamic canary
    ↓
automatic | approval-required | quarantine
    ↓
exact assessed manifest + origin snapshot
    ↓
pre-activation hash re-verification
    ↓
immutable installed version under ~/.dockyardos/community/packages/<id>/<revision>
    ↓
active revision pointer + local tamper-evident transparency chain
    ↓
verified declared entrypoints exposed to supported hosts on demand
```

DockyardOS never executes fetched community code during resolution or static quarantine scanning. Dynamic canaries are explicit and run only in a supported isolated container backend.

A signed remote registry is not equivalent to a trusted executable package. Registry signatures authenticate registry metadata; individual package activation still passes the full package-level quarantine, publisher-signature, permission, integrity, and approval workflow.

## Registry files

The packaged registry/trust configuration lives at:

```text
registry/community.json
registry/publishers.json
registry/remotes.json
registry/registry-keys.json
```

`community.json` contains:

- `packages`: bundled installable manifests with known entrypoints and safety metadata.
- `discoverySources`: broader official/maintainer/community catalogues that are metadata-only until an explicit Dockyard package manifest exists.

`publishers.json` stores public publisher keys used for package-manifest signature verification.

`remotes.json` contains explicitly configured signed remote-registry endpoints. It ships with no enabled remote source by default.

`registry-keys.json` contains public Ed25519 keys trusted for signed remote-registry envelopes.

## Third-party contribution staging

DockyardOS keeps community submissions separate from the runtime registry:

```text
registry/contributions/
registry/publisher-proposals/
```

These directories are **review queues only**. The effective registry loader does not read them, so a pull request cannot become installable merely by adding a file there.

Third-party package proposals must enter staging with:

- `trust: "community"`;
- `publisher.signatureRequired: true`;
- `source.ref` pinned to a lowercase 40-character Git commit SHA;
- explicit entrypoints, permissions, hosts, risk, channel, license, and package size limits;
- the existing DockyardOS manifest safety rules.

Validate the whole queue or one package:

```bash
dockyard community contribution validate \
  --dir registry/contributions \
  --publisher-proposals registry/publisher-proposals

dockyard community contribution validate \
  --file registry/contributions/<package>.json
```

A package signed by a currently trusted, non-revoked publisher key can become `review-ready`, but staging validation always reports `activationEligible: false`. A package whose publisher has no trusted key becomes `publisher-onboarding-required`. A bad signature using a known key is blocked.

Publisher public-key proposals are also inert. CI validates identifier/date/key structure and verifies that the PEM is an Ed25519 public key, but a valid proposal is only `review-required`; it never modifies `registry/publishers.json` or grants trust.

Before a maintainer promotes an already signed proposal, they can run:

```bash
dockyard community contribution prepare \
  --file registry/contributions/<package>.json
```

`prepare` is non-mutating. It revalidates the manifest/signature and rejects bundled package-ID collisions.

The pull-request validation workflow runs with read-only repository permissions and no signing/publishing secrets. It uses `pull_request`, not `pull_request_target`. A PR that changes contribution or publisher-proposal staging is rejected if it also changes `registry/community.json`, `registry/publishers.json`, or `registry/registry-keys.json`. Trust onboarding and package promotion therefore require a separate Code Owner-reviewed change.

See `CONTRIBUTING.md` and the README files inside the two staging directories for the contributor flow. Maintainer-controlled signing/promotion automation remains separate future work.

## Effective registry

DockyardOS builds one **effective registry** from:

1. the bundled registry, and
2. verified, non-expired remote registry caches.

The merge is deliberately collision-safe:

- a bundled package ID is authoritative and can never be shadowed by a remote package;
- if two or more remote registries claim the same package ID, every conflicting remote claim is excluded;
- the same collision behavior applies to discovery-source IDs;
- conflicts remain visible in registry output/search rather than being silently first-wins;
- admitted remote entries retain registry provenance including source ID, sequence, verified timestamp, expiry, and index digest.

This lets community registries add new candidates without giving a remote registry authority to redefine existing Dockyard packages.

## CLI

List the current effective packages, discovery sources, verified remote registries, and conflicts:

```bash
dockyard community list
dockyard community sources
```

Search the effective registry:

```bash
dockyard community search --query debugging
```

Inspect one unique effective package:

```bash
dockyard community inspect --id superpowers-core-skills
```

Inspect output includes the manifest plus its bundled/remote provenance.

Resolve an upstream ref to an immutable commit and perform quarantine assessment:

```bash
dockyard community resolve --id superpowers-core-skills
```

The result includes the resolved commit, deterministic content SHA-256, quarantine path, file/byte totals, declared/inferred permissions, entrypoint checks, script/binary findings, static canary, signature state, origin, and install decision.

For approval-sensitive workflows, pin installation to the exact reviewed result:

```bash
dockyard community install \
  --id <package> \
  --expected-revision <40-char-commit> \
  --expected-sha256 <64-char-content-digest> \
  --approve
```

If the upstream ref moves or its resolved content digest differs after assessment, installation aborts and requires a fresh assessment. `--approve` never applies to a different revision than the one reviewed and never bypasses quarantine.

Inspect installed versions and active revision:

```bash
dockyard community status --id <package>
dockyard community active
```

Read one declared entrypoint only after integrity verification:

```bash
dockyard community read --id <package> --entrypoint <declared/path>
```

Rollback without re-fetching upstream:

```bash
dockyard community rollback --id <package>
dockyard community rollback --id <package> --revision <sha>
```

Rollback re-verifies the stored immutable revision and refuses a missing or locally modified target.

Verify/show the local transparency chain:

```bash
dockyard community transparency verify
dockyard community transparency show
```

## Signed remote registries

A configured source must specify an exact HTTPS hostname, a trusted Ed25519 key, maximum response size, maximum envelope age, and a trust ceiling.

DockyardOS refuses:

- redirects;
- credentials embedded in registry URLs;
- non-default HTTPS ports;
- localhost/private IPv4 targets;
- oversized responses;
- expired, future, or stale envelopes;
- unknown or revoked registry keys;
- malformed registry indexes;
- packages/discovery sources whose declared trust exceeds the source trust ceiling.

The signed envelope includes a monotonic positive `sequence`. DockyardOS rejects lower sequence numbers and rejects **equivocation** when the same sequence is presented with different signed content.

Verified versions are stored under external DockyardOS state and re-verified before cached indexes are admitted to the effective registry.

Inspect configured sources and verified cache metadata:

```bash
dockyard community remote sources
dockyard community remote cached
```

Synchronize every enabled source or one source:

```bash
dockyard community remote sync
dockyard community remote sync --id <registry-id>
```

Remote registries are disabled by default.

A successfully synchronized unique remote package can enter the effective registry and therefore become visible to `list/search/inspect/resolve/install`. It still does **not** bypass package quarantine, publisher signatures, permission checks, immutable resolution, integrity verification, or approval.

## Installed manifest snapshots and offline continuity

Before an effective package is activated, DockyardOS stores the exact assessed manifest and its registry provenance under external community state, keyed by immutable package revision.

The snapshot is create-once for that package/revision; DockyardOS refuses different manifest content for an existing revision snapshot.

At runtime, active packages use this stored manifest snapshot to determine capabilities, tags, hosts, and declared entrypoints. The installed package tree is still re-hashed against the recorded content digest before exposure.

This means an already installed remote capability remains self-describing and usable offline even when:

- the remote registry is temporarily unavailable;
- the registry cache has expired;
- no remote source is currently enabled.

The snapshot does not authorize a new version. New updates still require a current unique effective manifest plus a fresh quarantine assessment.

## Safe community updates

Check every active package or one package against its current effective-registry candidate:

```bash
dockyard community updates check
dockyard community updates check --id <package>
```

Possible states include:

- `up-to-date`
- `update-available`
- `approval-required`
- `quarantined`
- `manifest-missing`
- `error`

An update is considered `update-available` for unattended activation only when the existing package-assessment policy returns `automatic` for the new candidate.

Apply only automatic-safe updates:

```bash
dockyard community updates apply-safe
dockyard community updates apply-safe --id <package>
```

`apply-safe` deliberately does **not** pass an approval flag. It skips approval-required, quarantined, ambiguous, missing-manifest, and invalid candidates.

Before activation it performs another pinned assessment using the exact candidate revision and content SHA-256 observed during the update check. If a moving upstream ref changes between check and apply, activation aborts rather than silently substituting the newer content.

Examples that prevent unattended activation include:

- new permissions;
- trust downgrade;
- risk increase;
- missing/invalid publisher signature;
- inferred permissions exceeding declared permissions;
- static quarantine findings;
- effective-registry ID collision;
- no current unique effective manifest.

This is DockyardOS's safe auto-update primitive. Scheduling/recurring invocation can be layered on later through host automation without changing the trust decision itself.

## Publisher and registry signing

DockyardOS can generate local Ed25519 signing keys for publishers and remote registries.

```bash
dockyard community publisher keygen --id <publisher-id> --key-id <key-id>
dockyard community registry-key keygen --id <registry-id> --key-id <key-id>
```

Private keys are stored under:

```text
~/.dockyardos/signing-keys/
```

Private key files are created mode `0600`. DockyardOS outputs the public registration/trust-store record and local private-key path, but never prints private-key material.

Sign a package manifest:

```bash
dockyard community publisher sign \
  --file manifest.json \
  --key-id <key-id> \
  --out manifest.signed.json
```

Sign a remote registry envelope:

```bash
dockyard community registry-key sign \
  --file envelope.json \
  --key-id <key-id> \
  --out envelope.signed.json
```

The output path is create-only; DockyardOS refuses to silently overwrite an existing signed file. Key rotation/revocation remains an explicit trust-store maintenance operation rather than an automatic rewrite of bundled trust policy.

## Sandboxed dynamic canaries

DockyardOS provides an explicit dynamic canary runner for quarantined capability code. It is **not** a host fallback and does not weaken static quarantine.

Plan or run a canary after resolving a package:

```bash
dockyard community canary plan \
  --id <package> \
  --image <image>@sha256:<digest> \
  --command <direct-command> \
  --arg <argument>

dockyard community canary run \
  --id <package> \
  --image <image>@sha256:<digest> \
  --command <direct-command>
```

DockyardOS requires Docker or Podman for execution and refuses direct execution on the host. The image must already exist locally and be digest-pinned; `--pull=never` prevents an implicit network fetch.

The container is launched with:

- no network;
- read-only root filesystem;
- all Linux capabilities dropped;
- `no-new-privileges`;
- bounded PIDs, memory, CPU, timeout, argument count, and output;
- unprivileged user;
- small no-exec `/tmp`;
- only the resolved quarantine package mounted read-only at `/workspace`.

If the backend or pinned image is unavailable, the result is `unavailable`, never `pass`. A successful canary adds evidence but cannot override a quarantine decision or grant installation approval.

## Resolution and quarantine rules

The safe fetcher accepts only GitHub `owner/repo` sources from validated package manifests.

It:

- rejects unsafe/malformed Git refs before invoking Git;
- uses argument-vector process execution rather than shell command interpolation;
- disables system/global Git configuration for quarantine operations;
- disables interactive credential prompting and Git LFS smudging;
- uses an empty repository-local hooks path;
- performs a shallow no-tags fetch of the declared ref;
- bounds fetched Git object size before checkout;
- detaches at `FETCH_HEAD`;
- records the exact 40-character commit SHA;
- bounds filesystem entry count and directory depth;
- enforces package-specific file and byte limits;
- rejects symlinks and non-regular special files;
- excludes `.git` metadata from package hashing/install content;
- includes executable mode in deterministic content hashing;
- validates declared entrypoints;
- structurally validates Agent Skill `SKILL.md` frontmatter;
- detects executable bits, script-like source files, binary artifacts, sensitive filenames, package-manager scripts, and install lifecycle scripts;
- infers permissions conservatively and quarantines when inferred permissions exceed the manifest;
- never executes fetched code during static canary assessment.

Immediately before activation, DockyardOS re-hashes the quarantined tree. After copying to the immutable package directory, it hashes again before switching the active revision pointer. This prevents post-assessment content changes from being activated.

## Signature policy

DockyardOS supports Ed25519 manifest signatures.

Community-trust packages always require a valid signature from a key present in `registry/publishers.json`; a community manifest cannot disable that requirement. Official/maintainer packages may also require signatures explicitly.

The signature covers the canonicalized package manifest excluding the `signature` field itself. Publisher keys can be revoked; a revoked or unknown key fails verification.

A registry envelope signature and a package publisher signature protect different trust boundaries. A valid registry signature does not substitute for a required package signature.

## Decision policy

### Automatic

Only packages that satisfy the manifest/entrypoint/signature boundary, produce a clean static canary, do not expand permissions, and remain within low-risk trust rules can install without an approval flag.

### Approval required

Examples include:

- declared high-impact permissions such as shell/network/browser/git-write/secrets/database-write/deployment/DNS;
- high static findings that do not require quarantine;
- a warning-level static canary;
- non-low-risk maintainer packages;
- first install of a correctly signed community package where policy requires review;
- updates that add permissions;
- updates that reduce trust;
- updates that increase risk.

### Quarantine

Examples include:

- missing/invalid declared entrypoints;
- symlink/special-file findings;
- critical scan findings;
- inferred permissions not declared by the manifest;
- required signature missing/invalid/revoked/untrusted;
- failed static canary.

`--approve` never bypasses quarantine.

## Cross-host activation

Installed community packages are not dumped wholesale into every agent context. DockyardOS exposes verified active package metadata and declared entrypoints through the local MCP bridge:

- `dockyard_community_active`
- `dockyard_community_entrypoint`

The first tool lists only active packages whose immutable stored content still matches its recorded digest. The second can read only a path explicitly declared as a package entrypoint and re-verifies package integrity before reading it. It is not a general filesystem-read tool.

Manifest snapshots let these runtime operations continue for an installed remote package without trusting a currently reachable remote registry.

This lets Antigravity, Gemini CLI, Codex, Claude Code, Cursor, OpenCode, and other Dockyard MCP-capable hosts load a relevant installed skill on demand rather than loading every installed package.

## Updates and rollback

Every installed revision is immutable and stored separately. An update never overwrites the previous revision directory.

The state file records all installed versions and a separate active-revision pointer. Rollback changes only that pointer after verifying the target revision's current content hash, so it does not need to trust the network or re-download an older release.

An update is compared with the currently active package. Permission expansion, trust downgrade, or risk increase forces renewed approval even if an earlier revision had already been approved.

`community updates apply-safe` is intentionally narrower than manual `community update --approve`: it can activate only a candidate that remains `automatic` after a fresh pinned assessment.

## Transparency log

DockyardOS writes a local append-style hash chain under its external community state. Each record includes the previous record hash and its own deterministic SHA-256 hash.

This is **local tamper evidence**, not a public transparency service. DockyardOS does not claim that a local attacker who can rewrite the entire Dockyard home cannot replace both the log and state. External/public anchoring remains future work.

## Still intentionally not automatic

- Remote registries are not enabled or trusted automatically.
- Remote registry synchronization does not bypass package-level trust boundaries.
- Conflicting remote package IDs are not resolved by popularity, order, or first-wins behavior.
- Approval-required updates are not auto-approved by `apply-safe`.
- Dynamic canaries never execute without a supported isolation backend.
- DockyardOS does not auto-pull canary images.
- It does not automatically merge native project configuration files.
- It does not install an item directly from an awesome list/search result without an explicit Dockyard manifest.
- It does not treat popularity/stars as trust.
- It does not expose provider credentials to community packages merely because they request them.
- It does not automatically load every installed community package into every team phase.
- It does not automatically trust publisher-key proposals or promote staged community submissions.
- Recurring update scheduling, external transparency anchoring, maintainer-controlled contribution promotion/signing, safe host-config merge, and richer marketplace UI remain future work.
