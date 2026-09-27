# Remote registry publication review queue

This directory is a **runtime-inert maintainer review queue** for registry indexes that may later be wrapped in a signed remote-registry envelope.

Files placed here are not discovered, activated, signed, or published automatically. A maintainer must review the exact index and run the two-step `community maintainer registry-publication plan` / `run` flow.

Publication fails closed unless the reviewed index is a regular non-symlink JSON file inside this directory, validates as a DockyardOS community registry, uses a trusted non-revoked registry key, advances the current remote sequence, and the exact reviewed plan SHA-256 is explicitly approved.

Do not place private signing keys, tokens, credentials, or other secrets in this directory. Registry private keys remain under DockyardOS external signing-key state and are only read during the explicitly approved `run` step.
