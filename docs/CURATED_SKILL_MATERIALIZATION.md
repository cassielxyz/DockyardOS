# Curated Skill Materialization

P33 converts selected high-value DockyardOS catalogue entries from discovery metadata into explicit installable package manifests. P34 extends that model to broader research/provider skills. P35 makes runtime readiness truthful across both local executables and external provider/MCP connections.

Selection still does **not** imply readiness. P32/P35 remain the runtime authority:

```text
selected
  -> package manifest exists?
  -> resolve moving upstream ref to immutable commit
  -> quarantine/static scan
  -> verify entrypoint + declared/inferred permissions
  -> automatic | approval-required | quarantine
  -> exact revision + content SHA-256 activation
  -> load immutable installed-manifest snapshot
  -> verify declared executables + required connections
  -> ready | missing-runtime | needs-connection
```

DockyardOS never executes fetched code during curated static assessment.

## Initial curated set — P33

| Candidate | Upstream package path | Declared permissions | Expected assessment |
| --- | --- | --- | --- |
| `vercel-react-best-practices` | `vercel-labs/agent-skills/skills/react-best-practices` | filesystem-read | automatic when clean |
| `vercel-composition-patterns` | `vercel-labs/agent-skills/skills/composition-patterns` | filesystem-read | automatic when clean |
| `supabase-postgres-best-practices` | `supabase/agent-skills/skills/supabase-postgres-best-practices` | filesystem-read | automatic when clean |
| `vercel-web-design-guidelines` | `vercel-labs/agent-skills/skills/web-design-guidelines` | filesystem-read, network | approval-required |
| `ui-ux-pro-max` | `nextlevelbuilder/ui-ux-pro-max-skill/.claude/skills/ui-ux-pro-max` | filesystem-read, shell | approval-required |
| `shadcn` | `shadcn-ui/ui/skills/shadcn` | filesystem-read, filesystem-write, shell, network | approval-required |

The higher-impact declarations are intentional. UI UX Pro Max contains Python helper scripts. The Vercel web-design skill explicitly fetches current guideline content. The shadcn skill describes CLI/component workflows that can write project files and access the network.

## Research/provider set — P34

P34 materializes three previously metadata-only/high-value capabilities using the **same IDs already used by DockyardOS selection**, avoiding aliases that could cause the selector and package runtime to disagree.

| Candidate/package ID | Upstream package path | Runtime prerequisite | Expected assessment |
| --- | --- | --- | --- |
| `agent-reach` | `Panniantong/Agent-Reach/agent_reach/skill` | `agent-reach` executable | approval-required |
| `supabase-skill` | `supabase/agent-skills/skills/supabase` | optional provider authentication metadata | approval-required |
| `cloudflare-skill` | `cloudflare/skills/skills/cloudflare` | optional provider authentication metadata | approval-required |

These are intentionally high-impact manifests. Agent Reach can invoke local/platform backends and read authenticated/browser-backed sources. The Supabase skill spans database/auth/storage/Edge Function workflows. The Cloudflare platform skill can lead to deployment, secrets, DNS, and network-affecting operations. P34 therefore does not make any of them unattended automatic installs.

## Runtime prerequisites — P34/P35

A package can declare bounded executable and connection requirements in its manifest. An integrity-verified installed package is **not** reported as ready merely because its files are present.

Executable requirements are checked against PATH and the project's `node_modules/.bin`:

```text
agent-reach package installed + hash verified
  + agent-reach executable missing
  => missing-runtime

agent-reach package installed + hash verified
  + agent-reach executable present
  => ready
```

Connection requirements can be `provider` or `mcp` entries. Each is explicitly marked `required: true|false`.

- Required provider connections gate readiness. DockyardOS uses its existing read-only provider detection/auth/status probes and never accepts credentials through the package manifest.
- `configured`, `authenticated`, and `linked` are explicit provider minimum-readiness levels. A link marker is not treated as authenticated when the provider exposes a separate auth probe.
- Required MCP connections fail closed until the active host/connector verifies connectivity. Package installation alone never proves an MCP connection or account authorization.
- Optional connections are advisory. They never block architecture/code guidance and never grant provider authority.

The P34 Supabase and Cloudflare skills use optional authenticated-provider metadata because their documentation/guidance is useful without account access, while deployment/account-specific actions still require the existing provider approval and authentication boundaries.

### Immutable runtime metadata

P35 evaluates runtime prerequisites from the manifest snapshot stored with the exact installed immutable revision. A later registry edit cannot silently change an already-installed package from `missing-runtime` to `ready`, or vice versa, without an explicit package update/activation path.

```text
installed revision
  -> stored manifest snapshot
  -> integrity verification
  -> snapshot runtime requirements
  -> readiness evaluation
```

This preserves the same revision/content trust boundary used by community activation.

## Live drift verification

`.github/workflows/p33-curated-skills.yml` continues to assess the P33 set. `.github/workflows/p34-research-provider-skills.yml` independently resolves the P34 upstream refs in quarantine and verifies:

- the configured subdirectory and declared entrypoint still exist;
- inferred permissions do not exceed the manifest;
- all three higher-impact bundles remain `approval-required`;
- runtime-prerequisite schema validation remains fail-closed;
- fetched upstream code is statically assessed, not executed.

`.github/workflows/p35-runtime-connections.yml` is credential-free and verifies connection-schema validation, required/optional readiness semantics, immutable installed-manifest behavior, and the curated optional provider metadata. It does not log into Supabase, Cloudflare, or any MCP service.

If upstream content changes enough to alter trust decisions, the focused workflow fails. DockyardOS maintainers must then review the new content/permissions instead of silently broadening trust.

## Discovery stays broad

DockyardOS still materializes only packages whose current entrypoint, provenance, permission model, and runtime assumptions have been reviewed. The mega-registry can remain much larger than the installable package set. Metadata/discovery presence never becomes execution authority by itself.
