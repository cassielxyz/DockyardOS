# Publisher key proposal staging

This directory holds **untrusted public-key proposals** for community publisher onboarding. Nothing here is part of the trusted publisher registry and DockyardOS runtime code does not consult this directory when verifying packages.

A proposal JSON has this shape:

```json
{
  "schemaVersion": 1,
  "id": "publisher-key-1",
  "publisherId": "publisher-id",
  "algorithm": "ed25519",
  "publicKeyPem": "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----\n",
  "createdAt": "2026-09-27T00:00:00.000Z",
  "notes": ["Optional identity-verification context for maintainers."]
}
```

CI checks identifier/date/key structure and confirms that the PEM is an Ed25519 public key. Passing validation **never grants trust**. A maintainer must verify publisher identity out of band and deliberately add the reviewed public key to `registry/publishers.json` in a separate trust-changing review.

Private keys must never be committed here or anywhere else in the repository.

Use:

```bash
dockyard community contribution validate-publisher --file registry/publisher-proposals/example.json
```
