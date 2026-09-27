# DockyardOS Capability Registry

DockyardOS keeps a large catalogue but activates a small task-specific set. The registry is designed around **capabilities**, not vendor lock-in or a permanent list of globally loaded prompts.

## Candidate metadata

Every skill, agent, tool, MCP, provider-facing capability, or workflow records:

- category and capabilities
- upstream source/provenance
- trust level (`official`, `maintainer`, `community`, `dockyard`)
- compatible agent hosts
- stack tags
- permissions
- risk level
- context cost
- maturity and maintenance scores
- default update channel
- dependencies/conflicts when applicable

Use:

```bash
dockyard categories
dockyard catalog --category security
dockyard catalog --query react --host antigravity
dockyard registry verify
```

## Selection

`dockyard recommend` turns a task, stack, security level, and host into a bounded specialist roster.

```bash
dockyard recommend \
  --task "Build a production SaaS dashboard" \
  --stack web,nextjs,react,supabase,postgres \
  --security standard
```

The selector considers:

1. recipe-required capabilities
2. task and stack fit
3. upstream trust
4. maintenance/maturity
5. project/user preference
6. context cost
7. permissions/risk
8. host compatibility
9. update channel

Production/high-risk recipes may automatically increase the security level. High security currently enforces OWASP review, Strix verification, Gitleaks, OSV dependency scanning, threat modeling, and post-fix regression.

## Practical recipes

The initial recipe library covers:

- production SaaS web apps
- premium landing/marketing pages
- e-commerce apps
- API/backend services
- AI agent applications
- mobile apps
- Cloudflare edge apps
- interactive 3D web experiences
- cybersecurity tools
- bug fixes
- safe refactors
- security hardening
- performance investigations
- database/provider migrations
- production releases

Recipes describe the useful **project-lifecycle team**. The selector still caps the active roster so every specialist is not loaded into the same context. Later phases can activate release/migration/security specialists only when their work becomes relevant.

## Update channels

- `stable` — only highly conservative capability releases
- `recommended` — default; trusted stable/community updates after Dockyard checks
- `edge` — newer approved capabilities
- `dev` — experimental development catalogue

An update channel is not permission to blindly pull an upstream branch.

## Capability lock

Executable external capabilities must be resolved before activation. DockyardOS lock entries include:

- exact resolved revision
- SHA-256 content digest
- upstream locator
- metadata digest
- permissions
- trust/risk level
- channel

Floating revisions such as `main`, `master`, or `latest` are rejected for executable capability locks.

Updates that change source, reduce trust, increase risk, or add permissions are quarantined or require approval. High-impact permission additions such as secrets, database writes, production deployment, DNS, and Git writes can never silently auto-update.

## Curation notes

Upstream skill instructions are not automatically treated as DockyardOS policy. Some community skills intentionally use aggressive always-use triggers. DockyardOS keeps those instructions scoped to the task instead of allowing them to override project policy or activate every session.

The catalogue is intentionally extensible: new sources such as the official MCP Registry and community Agent Skills collections can feed discovery, while DockyardOS still performs provenance, compatibility, permission, and security evaluation before activation.
