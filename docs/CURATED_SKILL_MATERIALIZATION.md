# Curated Skill Materialization

P33 converts selected high-value DockyardOS catalogue entries from discovery metadata into explicit installable package manifests.

Selection still does **not** imply readiness. P32 remains the runtime authority:

```text
selected
  -> package manifest exists?
  -> resolve moving upstream ref to immutable commit
  -> quarantine/static scan
  -> verify entrypoint + declared/inferred permissions
  -> automatic | approval-required | quarantine
  -> exact revision + content SHA-256 activation
  -> integrity-verified active package
```

DockyardOS never executes fetched code during P33 static assessment.

## Initial curated set

| Candidate | Upstream package path | Declared permissions | Expected assessment |
| --- | --- | --- | --- |
| `vercel-react-best-practices` | `vercel-labs/agent-skills/skills/react-best-practices` | filesystem-read | automatic when clean |
| `vercel-composition-patterns` | `vercel-labs/agent-skills/skills/composition-patterns` | filesystem-read | automatic when clean |
| `supabase-postgres-best-practices` | `supabase/agent-skills/skills/supabase-postgres-best-practices` | filesystem-read | automatic when clean |
| `vercel-web-design-guidelines` | `vercel-labs/agent-skills/skills/web-design-guidelines` | filesystem-read, network | approval-required |
| `ui-ux-pro-max` | `nextlevelbuilder/ui-ux-pro-max-skill/.claude/skills/ui-ux-pro-max` | filesystem-read, shell | approval-required |
| `shadcn` | `shadcn-ui/ui/skills/shadcn` | filesystem-read, filesystem-write, shell, network | approval-required |

The higher-impact declarations are intentional. UI UX Pro Max contains Python helper scripts. The Vercel web-design skill explicitly fetches current guideline content. The shadcn skill describes CLI/component workflows that can write project files and access the network.

## Live drift verification

`.github/workflows/p33-curated-skills.yml` resolves the current upstream refs in quarantine and verifies:

- the configured subdirectory still exists;
- `SKILL.md` remains present and structurally valid;
- inferred permissions do not exceed the manifest;
- guidance-only packages remain eligible for `automatic` assessment;
- network/script/write-capable packages remain `approval-required`;
- fetched code is never executed by the assessment workflow.

If upstream content changes enough to alter those decisions, the workflow fails. DockyardOS maintainers must then review the new content/permissions instead of silently broadening trust.

## Discovery stays broad

P33 intentionally materializes only packages whose current entrypoint and permission model have been verified. Sources such as Agent Reach remain discovery-only until a separate explicit manifest and review exist. This keeps the catalogue large without turning metadata into execution authority.
