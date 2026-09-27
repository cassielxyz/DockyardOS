# DockyardOS Community Distribution

DockyardOS separates **discovery**, **trust**, **installation**, and **execution**.

A capability may appear in a broad discovery source without being installable. It becomes installable only when DockyardOS has an explicit package manifest with source, ref, entrypoints, permissions, trust/risk metadata, host compatibility, license, file/byte limits, and publisher-signature policy.

## Trust flow

```text
discovery source / signed remote registry
    ↓ metadata only
explicit Dockyard package manifest
    ↓
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
pre-activation hash re-verification
    ↓
immutable installed version under ~/.dockyardos/community/packages/<id>/<revision>
    ↓
active revision pointer + local tamper-evident transparency chain
    ↓
verified declared entrypoints exposed to supported hosts on demand
```

DockyardOS never executes fetched community code during resolution or static quarantine scanning. Dynamic canaries are explicit and run only in a supported isolated container backend.

## Bundled registry

The packaged registry lives at:

```text
registry/community.json
registry/publishers.json
registry/remotes.json
registry/registry-keys.json
```

`community.json` contains two different concepts:

- `packages`: explicitly installable manifests with known entrypoints and safety metadata.
- `discoverySources`: broader official/maintainer/community catalogues that DockyardOS can search/index, but which are not executable merely because they are listed.

`remotes.json` contains explicitly configured signed remote-registry endpoints. It ships with no enabled remote source by default. `registry-keys.json` contains public Ed25519 keys trusted for those registry envelopes.

## CLI

List installable manifests and discovery sources:

```bash
dockyard community list
dockyard community sources
```

Search bundled metadata:

```bash
dockyard community search --query debugging
```

Inspect one installable package without network access:

```bash
dockyard community inspect --id superpowers-core-skills
```

Resolve an upstream ref to an immutable commit and perform quarantine assessment:

```bash
dockyard community resolve --id superpowers-core-skills
```

The result includes the resolved commit, deterministic content SHA-256, quarantine path, file/byte totals, declared/inferred permissions, entrypoint checks, script/binary findings, static canary, signature state, and install decision.

For approval-sensitive UI/workflows, pin installation to the exact reviewed result:

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

P7 adds a remote registry transport without turning network discovery into automatic trust.

A configured source must specify an exact HTTPS hostname, a trusted Ed25519 key, maximum response size, maximum envelope age, and a trust ceiling. DockyardOS refuses redirects, credentials embedded in URLs, non-default HTTPS ports, localhost/private IPv4 targets, oversized responses, expired/future/stale envelopes, unknown/revoked keys, malformed indexes, or packages whose declared trust exceeds the source ceiling.

The signed envelope includes a monotonic positive `sequence`. DockyardOS rejects lower sequence numbers and rejects **equivocation** when the same sequence is presented with different signed content. Verified versions are stored under external DockyardOS state and re-verified before cached indexes are exposed.

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

Remote registries are disabled by default. A successfully synchronized remote package is still metadata; it does **not** bypass the package manifest, quarantine, signature, permission, integrity, or approval boundaries used by the installation pipeline.

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

with private key files created mode `0600`. DockyardOS outputs the public registration/trust-store record and the local private-key path, but never prints private-key material.

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

P7 adds an explicit dynamic canary runner for quarantined capability code. It is **not** a host fallback and does not weaken P6 static quarantine.

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

- no network
- read-only root filesystem
- all Linux capabilities dropped
- `no-new-privileges`
- bounded PIDs, memory, CPU, timeout, argument count, and output
- unprivileged user
- small no-exec `/tmp`
- only the resolved quarantine package mounted read-only at `/workspace`

If the backend or pinned image is unavailable, the result is `unavailable`, never `pass`. A failed canary cannot override a quarantine decision or grant installation approval.

## Resolution and quarantine rules

The safe fetcher accepts only GitHub `owner/repo` sources from validated package manifests.

It:

- rejects unsafe/malformed Git refs before invoking Git
- uses argument-vector process execution rather than shell command interpolation
- disables system/global Git configuration for quarantine operations
- disables interactive credential prompting and Git LFS smudging
- uses an empty repository-local hooks path
- performs a shallow no-tags fetch of the declared ref
- bounds fetched Git object size before checkout
- detaches at `FETCH_HEAD`
- records the exact 40-character commit SHA
- bounds filesystem entry count and directory depth
- enforces package-specific file and byte limits
- rejects symlinks and non-regular special files
- excludes `.git` metadata from package hashing/install content
- includes executable mode in deterministic content hashing
- validates declared entrypoints
- structurally validates Agent Skill `SKILL.md` frontmatter
- detects executable bits, script-like source files, binary artifacts, sensitive filenames, package-manager scripts, and install lifecycle scripts
- infers permissions conservatively and quarantines when inferred permissions exceed the manifest
- never executes fetched code during static canary assessment

Immediately before activation, DockyardOS re-hashes the quarantined tree. After copying to the immutable package directory, it hashes again before switching the active revision pointer. This prevents post-assessment content changes from being activated.

## Signature policy

DockyardOS supports Ed25519 manifest signatures.

Community-trust packages always require a valid signature from a key present in `registry/publishers.json`; a community manifest cannot disable that requirement. Official/maintainer packages may also require signatures explicitly.

The signature covers the canonicalized package manifest excluding the `signature` field itself. Publisher keys can be revoked; a revoked or unknown key fails verification.

## Decision policy

### Automatic

Only packages that satisfy the manifest/entrypoint/signature boundary, produce a clean static canary, do not expand permissions, and remain within low-risk trust rules can install without an approval flag.

### Approval required

Examples include:

- declared high-impact permissions such as shell/network/browser/git-write/secrets/database-write/deployment/DNS
- high static findings that do not require quarantine
- a warning-level static canary
- non-low-risk maintainer packages
- first install of a correctly signed community package
- updates that add permissions
- updates that reduce trust
- updates that increase risk

### Quarantine

Examples include:

- missing/invalid declared entrypoints
- symlink/special-file findings
- critical scan findings
- inferred permissions not declared by the manifest
- required signature missing/invalid/revoked/untrusted
- failed static canary

`--approve` never bypasses quarantine.

## Cross-host activation

Installed community packages are not dumped wholesale into every agent context. Instead, DockyardOS exposes verified active package metadata and declared entrypoints through the local MCP bridge:

- `dockyard_community_active`
- `dockyard_community_entrypoint`

The first tool lists only active packages whose immutable stored content still matches its recorded digest. The second can read only a path explicitly declared as a package entrypoint and re-verifies package integrity before reading it. It is not a general filesystem-read tool.

This lets Antigravity, Gemini CLI, Codex, Claude Code, Cursor, OpenCode, and other Dockyard MCP-capable hosts load a relevant installed skill on demand rather than loading every installed package.

## Updates and rollback

Every installed revision is immutable and stored separately. An update never overwrites the previous revision directory.

The state file records all installed versions and a separate active-revision pointer. Rollback changes only that pointer after verifying the target revision's current content hash, so it does not need to trust the network or re-download an older release.

An update is compared with the currently active package. Permission expansion, trust downgrade, or risk increase forces renewed approval even if an earlier revision had already been approved.

## Transparency log

DockyardOS writes a local append-style hash chain under its external community state. Each record includes the previous record hash and its own deterministic SHA-256 hash.

This is **local tamper evidence**, not a public transparency service. DockyardOS does not claim that a local attacker who can rewrite the entire Dockyard home cannot replace both the log and state. External/public anchoring remains future work.

## Still intentionally not automatic

- Remote registry metadata does not automatically install or execute packages.
- Dynamic canaries never execute without a supported isolation backend.
- DockyardOS does not auto-pull canary images.
- It does not automatically merge native project configuration files.
- It does not install an item directly from an awesome list/search result without an explicit Dockyard manifest.
- It does not treat popularity/stars as trust.
- It does not expose provider credentials to community packages merely because they request them.
- It does not automatically load every installed community package into every team phase.
- External transparency anchoring, registry contribution-validation infrastructure, safe host-config merge, and richer marketplace UI remain future work.
