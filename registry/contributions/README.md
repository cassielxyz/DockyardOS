# Community package contribution staging

This directory is a **review queue**, not an executable registry.

JSON files placed here are never loaded by DockyardOS runtime discovery, installation, MCP, or update paths. They exist only so pull requests can carry third-party package proposals through deterministic validation before a maintainer decides whether to copy a reviewed manifest into `registry/community.json`.

A package proposal must:

- use the existing `CommunityPackageManifest` schema (`schemaVersion: 1`),
- declare `trust: "community"`,
- set `publisher.signatureRequired: true`,
- pin `source.ref` to a lowercase 40-character Git commit SHA,
- use only safe relative subdirectory/entrypoint paths,
- declare permissions/hosts/risk/channel explicitly,
- pass the normal DockyardOS manifest validator.

A contribution signed by a currently trusted, non-revoked publisher key can become `review-ready`. A structurally valid contribution with no trusted publisher key is `publisher-onboarding-required`; it remains inert. Invalid signatures from a known key are blocked.

Validation never changes trust, signs a package, or adds it to the effective registry.

Use:

```bash
dockyard community contribution validate --dir registry/contributions --publisher-proposals registry/publisher-proposals
dockyard community contribution validate --file registry/contributions/example.json
dockyard community contribution prepare --file registry/contributions/example.json
```

`prepare` is also non-mutating. It only proves that the exact manifest is review-ready and that its package ID does not already collide with the bundled registry.
