# DockyardOS Provider Pricing Evidence

DockyardOS does not permanently trust a hard-coded free-tier table. P22 adds a bounded evidence layer that can re-check official provider pricing/free-tier pages and use that evidence when the provider planner is asked to prefer free options.

## Why this exists

`--free-first` previously meant only "this provider needs a live pricing check." That was safe, but it did not help DockyardOS distinguish a continuing free plan from a short trial.

P22 makes that distinction explicit:

- `ongoing-free-plan` — an official page currently confirms a continuing $0/free plan.
- `ongoing-free-allowance` — an official page currently confirms a recurring free usage allowance within an otherwise usage-priced service.
- `free-trial` — an official page currently confirms a time/credit-limited trial.

A trial is not ranked like a continuing free plan. Stale, changed, unreachable, or unrecognized pricing content gets **no free-tier ranking advantage**.

## Official sources

The built-in P22 evidence registry is limited to fixed HTTPS pages controlled by the provider. Users cannot pass arbitrary pricing URLs into this fetch path.

| Provider | Official source(s) | Evidence target |
| --- | --- | --- |
| Vercel | `https://vercel.com/pricing` | Hobby/free plan |
| Cloudflare | `https://developers.cloudflare.com/workers/platform/pricing/` and `https://developers.cloudflare.com/r2/pricing/` | Workers free plan and R2 recurring free allowance |
| Supabase | `https://supabase.com/docs/guides/platform/billing-on-supabase` | Free plan |
| Neon | `https://neon.com/pricing` | Free plan |
| Firebase | `https://firebase.google.com/pricing` | Spark/no-cost plan |
| Appwrite | `https://appwrite.io/docs/advanced/billing/free` | Free plan |
| Render | `https://render.com/docs/free` | Free services/datastores |
| Railway | `https://docs.railway.com/pricing/free-trial` | trial plus any continuing Free-plan evidence |
| Turso | `https://turso.tech/pricing` | Free plan |
| Fly.io | `https://fly.io/docs/about/free-trial/` | trial-only evidence |
| Google Cloud Run | `https://cloud.google.com/run/pricing` | recurring free-tier allowance |

Pricing pages can change at any time. The table above records the pinned source locations, not a permanent guarantee that a free offer exists.

## Fetch boundary

Every live pricing check:

- uses a hard-coded HTTPS URL and exact expected hostname;
- rejects redirects;
- does not accept URL, host, or credential input from the user;
- uses a bounded 1–15 second timeout (6 seconds by default);
- rejects responses larger than 2 MiB by declared or streamed size;
- does not use browser automation or execute page JavaScript;
- stores no cookies, session tokens, or provider credentials;
- records the content SHA-256, response bytes, fetch timestamp, and safe HTTP metadata such as content type/ETag/Last-Modified when present;
- caches only normalized evidence metadata, not the fetched page body.

The cache lives outside project source under:

```text
~/.dockyardos/provider-pricing/cache.json
```

or under the configured `DOCKYARD_HOME`.

## CLI

Fetch all configured official pricing sources:

```bash
dockyard providers pricing
```

Fetch only selected providers:

```bash
dockyard providers pricing --provider vercel,cloudflare,supabase,neon
```

Change the bounded request timeout:

```bash
dockyard providers pricing --provider vercel --timeout-ms 8000
```

Inspect cache only, with no network request:

```bash
dockyard providers pricing --cached
```

The output includes provider/source verification state, freshness, source URL, content SHA-256, matched free-model evidence, and safe fetch metadata.

## Freshness

Pricing evidence is treated as fresh for 24 hours after collection. A cached entry older than that remains visible but is marked `stale`.

A stale entry cannot add free-first score. DockyardOS therefore does not keep ranking a provider as free merely because it was free yesterday, last month, or when the release was authored.

## Planner integration

A normal offline free-first plan can use only fresh cached pricing evidence:

```bash
dockyard providers plan \
  --capability web-hosting,postgres,auth \
  --stack web,nextjs,postgres \
  --environment preview \
  --free-first \
  --json
```

Ask the planner to refresh account/provider readiness and pricing evidence before ranking:

```bash
dockyard providers plan \
  --capability web-hosting,postgres,auth \
  --stack web,nextjs,postgres \
  --environment preview \
  --free-first \
  --live \
  --json
```

For a capability with fresh verified official evidence, P22 applies a deliberately bounded adjustment:

- continuing free plan: `+18`
- recurring free allowance: `+14`
- trial-only: `-8`
- stale/unverified/unavailable: `0`

These values are only one input. Existing linkage/auth readiness, stack fit, capability compatibility, explicit user preference/exclusion, and fallback ordering still matter.

## Capability-specific evidence

Pricing evidence is tied to capabilities instead of being treated as a provider-wide blanket claim.

For example, Cloudflare Workers pricing evidence can support serverless/web-hosting decisions, while R2 pricing evidence supports object-storage decisions. A verified Workers free plan is not silently used as proof that unrelated Cloudflare products are free.

## Failure behavior

DockyardOS fails closed on pricing claims:

- official page unreachable → `unavailable`, no ranking advantage;
- expected current evidence markers missing → `unverified`, no ranking advantage;
- cache too old → `stale`, no ranking advantage;
- provider has only trial evidence → trial is shown explicitly and does not receive the continuing-free bonus;
- provider has no configured official pricing source → planner keeps `livePricingCheckRequired: true`.

This prevents marketing-page drift, provider pricing changes, or temporary trials from silently becoming permanent architecture decisions.

## CI policy

Normal DockyardOS CI does **not** depend on live provider websites. P22 uses mocked official-page responses to test classification, hashing, cache freshness, trial-vs-free scoring, and arbitrary-provider rejection.

A focused CI smoke also checks `providers pricing --cached` and an offline `--free-first` plan with an empty cache. This proves that missing pricing evidence remains visible and cannot produce a false free-tier advantage.
