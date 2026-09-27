# Contributing to DockyardOS

DockyardOS welcomes fixes, tests, documentation, host integrations, provider adapters, and community capability proposals. Changes that affect trust, publishing, or external mutation have stricter review boundaries than ordinary code contributions.

## Normal development

Before opening a pull request:

```bash
npm install --ignore-scripts
npm test
```

Keep project/runtime state out of the repository. DockyardOS durable state belongs under the external DockyardOS home, not inside source projects.

For implementation work, prefer a focused branch and keep security/release policy changes explicit in the PR description.

## Community capability proposals

Do **not** add a third-party package directly to `registry/community.json` in the same PR that introduces its proposal or publisher key.

Use the inert staging queues:

```text
registry/contributions/
registry/publisher-proposals/
```

A staged package proposal must use the existing community manifest schema and additionally:

- declare `trust: "community"`;
- set `publisher.signatureRequired: true`;
- pin `source.ref` to an immutable lowercase 40-character Git commit SHA;
- declare explicit entrypoints, permissions, hosts, risk, channel, license, and size limits;
- use safe relative paths;
- pass DockyardOS manifest validation.

Validate locally:

```bash
dockyard community contribution validate \
  --dir registry/contributions \
  --publisher-proposals registry/publisher-proposals
```

Or one package:

```bash
dockyard community contribution validate \
  --file registry/contributions/<package>.json
```

### Publisher onboarding

If the publisher does not yet have a trusted key, add only the **public** Ed25519 key proposal to `registry/publisher-proposals/` using the shape documented in that directory.

Passing publisher-proposal validation does not grant trust. Maintainers must verify publisher identity out of band and, in a separate Code Owner-reviewed trust change, add the approved public key to `registry/publishers.json`.

Never commit a private signing key.

### Review-ready package

A staged package signed by a currently trusted, non-revoked publisher key can become `review-ready`. That status still does not install, activate, or add it to the effective registry.

Maintainers can run:

```bash
dockyard community contribution prepare \
  --file registry/contributions/<package>.json
```

`prepare` is non-mutating. It revalidates the manifest/signature and rejects package-ID collisions with the bundled registry.

Actual promotion into `registry/community.json` must happen in a separate reviewed change. The normal package quarantine, permission, immutable-content, integrity, approval, and rollback boundaries continue to apply after promotion.

## Trust-boundary files

The following files/workflows are Code Owner boundaries:

- `.github/CODEOWNERS`
- `registry/community.json`
- `registry/publishers.json`
- `registry/registry-keys.json`
- `registry/remotes.json`
- `.github/workflows/community-contributions.yml`
- `.github/workflows/vscode-extension.yml`
- `.github/workflows/real-host-matrix.yml`

Repository branch protection should require Code Owner review for these paths.

## Pull-request safety

The community contribution workflow runs with read-only repository permissions and uses the `pull_request` event. It has no signing keys or publishing credentials.

A pull request that changes `registry/contributions/` or `registry/publisher-proposals/` is rejected if it also changes trusted registry/key files. This prevents a contributor from staging an identity/package and self-authorizing it within one review.

## Reporting security issues

Do not place live credentials, private keys, exploit secrets, or sensitive production data in an issue or pull request. Use the repository owner's private security-reporting channel when one is configured.
