# DockyardOS Security Principles

DockyardOS can mediate tools with access to source code, deployment providers, databases, DNS, and credentials. Its default security posture is deliberately conservative around irreversible or production-impacting actions.

## Rules

- Project-local reversible edits may run automatically in Balanced mode.
- Destructive Git, database, infrastructure, DNS, secret, and production deployment actions require explicit approval.
- Obviously machine-destructive commands are denied.
- Provider credentials are never stored in checkpoint JSON or committed project files.
- Remote URLs are sanitized before they are used as project identity material.
- Checkpoints store only bounded Git patches for tracked changes; they do not blindly archive the entire workspace.
- Community skills/tools will require provenance, permission metadata, pinning, scanning, and isolated evaluation before automatic activation.

## High-security workflow

A high-security production workflow includes, when applicable:

1. threat modeling
2. OWASP-oriented review
3. secret scanning
4. dependency vulnerability scanning
5. Strix application-security verification
6. remediation
7. regression and security rerun

Security tools are verification aids; they do not replace manual review or authorization boundaries.
