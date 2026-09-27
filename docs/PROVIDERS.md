# DockyardOS Provider Orchestration

DockyardOS treats external platforms as **capability providers**, not permanent project dependencies. A project can prefer a provider, but the orchestration layer should understand compatible alternatives and the work required to switch.

## Safe inspection

By default, provider inspection is local-only:

```bash
dockyard providers inspect
```

It checks known CLI availability plus project configuration/link markers. It does not read `.env` files, print tokens, or make remote account requests.

When the next decision genuinely depends on account readiness, use:

```bash
dockyard providers inspect --live
```

Live probes are read-only identity/list/status commands with bounded output, timeouts, and credential redaction.

Examples currently covered include GitHub, Vercel, Cloudflare, Supabase, Firebase, Appwrite, Railway, Fly.io and additional providers with local configuration detection.

## Capability planning

Ask for capabilities rather than brands:

```bash
dockyard providers plan \
  --capability web-hosting,postgres,auth,object-storage \
  --stack web,nextjs,postgres \
  --environment preview \
  --free-first
```

The planner considers:

- required capability
- existing project configuration/linkage
- authenticated/local readiness when live probing is enabled
- explicit provider preferences and exclusions
- stack fit
- preview vs production environment
- free-first / balanced / performance cost preference
- capability-specific fallback priority

Planning is read-only. It never turns a selected provider into an external mutation by itself.

## Authenticated provider actions

P9 adds a deliberately small mutation layer for **GitHub, Vercel, Cloudflare, and Supabase**. List the supported actions first:

```bash
dockyard providers actions
dockyard providers actions --provider vercel
```

Every action can be planned without changing any external system:

```bash
dockyard providers action plan \
  --provider vercel \
  --action preview-deploy \
  --environment preview \
  --param prebuilt=true
```

Running a mutation always requires explicit approval:

```bash
dockyard providers action run \
  --provider vercel \
  --action preview-deploy \
  --environment preview \
  --approve
```

Production mutations require **both** the normal mutation approval and an additional production acknowledgement:

```bash
dockyard providers action run \
  --provider vercel \
  --action production-deploy \
  --environment production \
  --approve \
  --approve-production
```

Before a mutation executes, DockyardOS performs the provider's live authentication probe. Actions that depend on an already-linked local project also require that linkage to verify. Missing authentication/linkage is a hard refusal rather than an invitation to guess credentials or targets.

### Initial P9 action set

| Provider | Action | Environment | Important boundary |
| --- | --- | --- | --- |
| GitHub | `workflow-dispatch` | preview / production | Existing workflow only; P9 does not accept arbitrary workflow input fields/secrets |
| Vercel | `preview-deploy` | preview | Linked project required; deployment URL is inspected after deploy |
| Vercel | `production-deploy` | production | Requires double approval |
| Cloudflare | `worker-preview-upload` | preview | Uploads a Worker version; does not deploy that version to production traffic |
| Cloudflare | `pages-preview-deploy` | preview | Directory must stay inside the current project; common production branch names are refused |
| Supabase | `preview-branch-create` | preview | Explicit project ref; no implicit production-data clone and no persistent-branch flag |
| Supabase | `functions-deploy` | preview / production | Explicit project ref; P9 does not expose prune/delete or JWT-disable controls |

Provider action parameters use explicit `--param key=value` values. Action-specific validation rejects option injection, unsafe Git refs, unknown parameters, and project-path escape. DockyardOS stores redacted plan/result evidence under external project state rather than writing provider audit artifacts into the source repository.

## Verified preview environments

A preview environment can combine supported provider actions into one sequential plan. For example, create a Supabase preview branch first and then deploy the web app to Vercel:

```bash
dockyard providers preview plan \
  --database supabase \
  --web vercel \
  --param supabase.project-ref=<project-ref> \
  --param supabase.branch=feature-login \
  --param vercel.prebuilt=true
```

Execute the same preview plan only after review:

```bash
dockyard providers preview run \
  --database supabase \
  --web vercel \
  --param supabase.project-ref=<project-ref> \
  --param supabase.branch=feature-login \
  --param vercel.prebuilt=true \
  --approve
```

Supported web targets are `vercel`, `cloudflare-pages`, and `cloudflare-worker`; an optional `--database supabase` and/or `--workflow github` can be added. Bundle parameters are namespaced (`vercel.*`, `cloudflare.*`, `supabase.*`, `github.*`) so one provider cannot accidentally consume another provider's field.

Preview steps execute sequentially. Each successful mutation must pass its provider-native post-action verification before the next step begins. DockyardOS stops on the first failed or unverifiable step and reports a partial/error result; it does not label a partially provisioned environment as healthy. Preview orchestration refuses production actions entirely.

## Post-action verification

P9 currently verifies actions using bounded provider-native commands:

- GitHub workflow dispatch: list the newest matching workflow run.
- Vercel deploy: extract the HTTPS deployment URL and run `vercel inspect <url> --wait`.
- Cloudflare Worker preview: list Worker versions after upload.
- Cloudflare Pages preview: list preview deployments for the explicit project.
- Supabase preview branch: retrieve the named branch for the explicit project ref.
- Supabase Edge Function deploy: list functions on the explicit project ref.

A mutation command returning exit code 0 is not enough when a verification step exists. Verification failure is surfaced separately and prevents the preview orchestrator from continuing.

## Example fallback families

These are ordering hints, not claims that every item is a drop-in replacement.

| Capability | Typical candidate chain |
| --- | --- |
| Web hosting | Vercel → Cloudflare → Firebase → Render → Fly.io → Railway |
| Postgres | Supabase → Neon → Render → Railway |
| Auth | Supabase → Firebase → Appwrite → PocketBase |
| Object storage | Cloudflare → Supabase → Firebase → Appwrite → PocketBase |
| Realtime | Supabase → Firebase → PocketBase / Appwrite where compatible |
| Functions | Firebase / Appwrite / Cloud Run; edge-specific work may prefer Cloudflare or Supabase |
| Services/containers | Render → Railway → Fly.io → Cloud Run |
| DNS/CDN/WAF/DDoS | Cloudflare when the requested capability requires those controls |
| Observability | Sentry plus provider-native logs/traces where appropriate |

## Compatibility is explicit

DockyardOS must not hide migration cost. Switching providers can change:

- authentication/session models
- authorization/RLS semantics
- database extensions and pooling
- realtime event models
- storage ACLs and signed URLs
- deployment/runtime limits
- edge/serverless behavior
- DNS/security control planes

The provider plan therefore includes compatibility notes and fallbacks instead of presenting a false one-click equivalence.

## Free-first policy

`--free-first` does **not** mean DockyardOS trusts a hard-coded quota forever.

Free tiers, eligibility, quotas, regional availability, and commercial terms change. A free-first provider choice is marked as requiring a live pricing/availability check before DockyardOS activates or provisions it.

## Production safety

Provider planning remains read-only. Provider mutation and provider selection are separate decisions.

DockyardOS approval policy governs:

- every authenticated external provider mutation
- production deploys with an additional production-specific approval
- DNS/domain changes
- destructive database migrations
- secret creation/rotation
- project/resource deletion
- force pushes and other irreversible source-control operations

P9 intentionally does **not** expose DNS mutation, destructive database operations, secret mutation, provider resource deletion, or arbitrary command execution through the provider action API.

Prefer preview/reversible environments first, verify them, checkpoint, then request approval for the production transition.
