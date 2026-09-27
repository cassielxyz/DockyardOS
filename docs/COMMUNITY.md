# DockyardOS Community Distribution

DockyardOS separates **discovery** from **execution**.

A capability may appear in a broad discovery source without being installable. It becomes installable only when DockyardOS has an explicit package manifest with source, ref, entrypoints, permissions, trust/risk metadata, host compatibility, license, file/byte limits, and optional publisher signature data.

## Trust flow

```text
discovery source
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
automatic | approval-required | quarantine
    ↓
immutable installed version under ~/.dockyardos/community/packages/<id>/<revision>
    ↓
active revision pointer + local tamper-evident transparency chain
```

DockyardOS never executes fetched community code during resolution or quarantine scanning.

## Bundled registry

The packaged registry lives at:

```text
registry/community.json
registry/publishers.json
```

`community.json` contains two different concepts:

- `packages`: explicitly installable manifests with known entrypoints and safety metadata.
- `discoverySources`: broader official/maintainer/community catalogues that DockyardOS can search/index later, but which are not executable merely because they are listed.

The initial installable package is a curated subset of Superpowers skills. Broad discovery sources include the official MCP Registry and selected official/maintainer capability repositories.

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

The result includes:

- resolved Git commit
- deterministic content SHA-256
- quarantine path
- file/byte totals
- declared and inferred permissions
- entrypoint validation
- script/binary findings
- static canary result
- signature state
- install decision

Install/update:

```bash
dockyard community install --id <package>
dockyard community update --id <package>
```

If the result is `approval-required`, rerun only after review:

```bash
dockyard community install --id <package> --approve
```

`quarantine` decisions cannot be overridden by `--approve`.

Inspect installed versions and active revision:

```bash
dockyard community status
dockyard community status --id <package>
```

Rollback without re-fetching upstream:

```bash
dockyard community rollback --id <package>
dockyard community rollback --id <package> --revision <sha>
```

Verify/show the local transparency chain:

```bash
dockyard community transparency verify
dockyard community transparency show
```

## Resolution and quarantine rules

The P6 fetcher currently accepts only GitHub `owner/repo` sources from validated package manifests.

It:

- rejects unsafe/malformed Git refs before invoking Git
- uses argument-vector process execution rather than shell command interpolation
- performs a shallow no-tags fetch of the declared ref
- detaches at `FETCH_HEAD`
- records the exact 40-character commit SHA
- enforces package-specific file and byte limits
- rejects symlinks and non-regular special files
- excludes `.git` metadata from package hashing/install content
- validates declared entrypoints
- structurally validates Agent Skill `SKILL.md` frontmatter
- detects executable bits, script-like source files, binary artifacts, sensitive filenames, package-manager scripts, and install lifecycle scripts
- infers permissions conservatively and quarantines when inferred permissions exceed the manifest
- never executes fetched code during static canary assessment

## Signature policy

DockyardOS supports Ed25519 manifest signatures.

Community-trust packages always require a valid signature from a key present in `registry/publishers.json`; a community manifest cannot disable that requirement. Official/maintainer packages may also require signatures explicitly.

The signature covers the canonicalized package manifest excluding the `signature` field itself.

Publisher keys can be revoked. A revoked or unknown key fails signature verification.

## Decision policy

### Automatic

Only packages that satisfy the manifest/entrypoint/signature boundary, produce a clean static canary, do not expand permissions, and remain within low-risk trust rules can install without an approval flag.

### Approval required

Examples include:

- declared high-impact permissions such as shell/network/browser/git-write/secrets/database-write/deployment/DNS
- high static findings that do not require quarantine
- a warning-level canary
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

## Updates and rollback

Every installed revision is immutable and stored separately. An update never overwrites the previous revision directory.

The state file records all installed versions and a separate active-revision pointer. Rollback changes only that pointer, so it does not need to trust the network or re-download an older release.

An update is compared with the currently active package. Permission expansion, trust downgrade, or risk increase forces renewed approval even if an earlier revision had already been approved.

## Transparency log

DockyardOS writes a local append-style hash chain under its external community state. Each record includes the previous record hash and its own deterministic SHA-256 hash.

This is **local tamper evidence**, not a public transparency service. P6 does not claim that a local attacker who can rewrite the entire Dockyard home cannot replace both the log and state. A future public registry/signature service can anchor these records externally.

## What P6 intentionally does not do yet

- It does not execute arbitrary package tests during quarantine.
- It does not automatically merge native project configuration files.
- It does not install an item directly from an awesome list/search result without an explicit Dockyard manifest.
- It does not treat popularity/stars as trust.
- It does not permanently hard-code current provider/pricing claims into package trust decisions.
- It does not expose provider credentials to community packages merely because they request them.

Future work can add sandboxed dynamic canaries, remote registry synchronization, publisher onboarding/signing workflows, and richer package discovery UI while preserving these boundaries.
