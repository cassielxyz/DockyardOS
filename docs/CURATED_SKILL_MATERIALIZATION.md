# Curated Skill Materialization

P33 converts selected high-value DockyardOS catalogue entries from discovery metadata into explicit installable package manifests. P34 extends that model to broader research/provider skills and adds runtime-prerequisite truthfulness.

Selection still does **not** imply readiness. P32 remains the runtime authority:

```text
selected
  -> package manifest exists?
  -> resolve moving upstream ref to immutable commit
  -> quarantine/static scan
  -> verify entrypoint + declared/inferred permissions
  -> automatic | approval-required | quarantine
  -> exact revision + content SHA-256 activation
  -> verify declared runtime prerequisites
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
| `supabase-skill` | `supabase/agent-skills/skills/supabase` | task-dependent Supabase CLI/MCP/auth noted, not assumed | approval-required |
| `cloudflare-skill` | `cloudflare/skills/skills/cloudflare` | task-dependent `cf`/Wrangler/auth noted, not assumed | approval-required |

These are intentionally high-impact manifests. Agent Reach can invoke local/platform backends and read authenticated/browser-backed sources. The Supabase skill spans database/auth/storage/Edge Function workflows. The Cloudflare platform skill can lead to deployment, secrets, DNS, and network-affecting operations. P34 therefore does not make any of them unattended automatic installs.

### Runtime prerequisites

A package can now declare bounded runtime executable requirements in its manifest. An integrity-verified installed package is **not** reported as ready merely because its files are present. DockyardOS rechecks required executables against PATH and the project's `node_modules/.bin` at fulfillment time.

For example:

```text
agent-reach package installed + hash verified
  + agent-reach executable missing
  => missing-runtime

agent-reach package installed + hash verified
  + agent-reach executable present
  => ready
```

Human-readable connection/tool requirements that are task-dependent remain manifest notes and must still be verified through the existing provider/MCP readiness layers before a workflow claims external authority. A skill package never grants credentials, provider authorization, or production approval by itself.

## Live drift verification

`.github/workflows/p33-curated-skills.yml` continues to assess the P33 set. `.github/workflows/p34-research-provider-skills.yml` independently resolves the P34 upstream refs in quarantine and verifies:

- the configured subdirectory and declared entrypoint still exist;
- inferred permissions do not exceed the manifest;
- all three higher-impact bundles remain `approval-required`;
- runtime-prerequisite schema validation remains fail-closed;
- fetched upstream code is statically assessed, not executed.

If upstream content changes enough to alter those decisions, the focused workflow fails. DockyardOS maintainers must then review the new content/permissions instead of silently broadening trust.

## Discovery stays broad

DockyardOS still materializes only packages whose current entrypoint, provenance, permission model, and runtime assumptions have been reviewed. The mega-registry can remain much larger than the installable package set. Metadata/discovery presence never becomes execution authority by itself.
