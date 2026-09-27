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

Provider planning is read-only. A production plan is explicitly marked as requiring approval before any mutation.

DockyardOS approval policy still governs:

- production deploys
- DNS/domain changes
- destructive database migrations
- secret creation/rotation
- project/resource deletion
- force pushes and other irreversible source-control operations

Prefer preview/reversible environments first, verify them, checkpoint, then request approval for the production transition.
