# DockyardOS Capability Mega-Registry

P30 expands DockyardOS from a small built-in catalogue into a layered capability pool that can be routed from a user's natural-language request without loading every capability into the agent context.

## Layers

The runtime registry is assembled from independently reviewable layers:

1. the original curated DockyardOS catalogue;
2. expanded official skill families and Dockyard specialist agents;
3. curated MCP/connectors and practical engineering tools;
4. provider metadata used for capability-based alternatives and fallbacks.

Keeping the layers separate prevents a large community/discovery list from silently inheriting official trust just because it appears near an official capability.

## Candidate metadata

Each executable or contextual capability carries bounded metadata such as:

- stable DockyardOS id and category;
- skill / agent / tool / MCP kind;
- trust level;
- source and revision strategy;
- capabilities, tags, stacks, and supported agent hosts;
- required permissions;
- risk and context cost;
- maturity and maintenance signals;
- update channel;
- optional conflicts and dependencies.

Website-backed remote MCP endpoints are metadata-only (`live-metadata-only`). They are not treated as Git packages that DockyardOS can pin and install as executable source.

## Duplicate identities

The mega-registry does not use first-wins duplicate handling.

If two layers contain the same id, DockyardOS permits enrichment only when they describe the same identity: kind, trust, source type, source locator, and revision strategy must agree. Compatible entries are merged conservatively:

- capabilities/tags/stacks/hosts/permissions are unioned;
- the higher risk and context cost win;
- the more restrictive update channel wins;
- maturity/maintenance keep the stronger verified metadata.

If the identity differs, registry initialization fails closed.

## Natural-language routing

`defaultSelectionRequest()` now derives bounded capability and stack hints from the user's request before normal selection.

Examples:

- "Build a Next.js dashboard from Figma" adds web/react/Next.js plus Figma/design-context signals.
- "Supabase auth and object storage" adds auth, storage, Supabase and Postgres signals.
- "Stripe subscriptions" adds payments/checkout/billing signals.
- "Playwright browser QA" adds browser/e2e/screenshot signals.
- "Use Firebase or Appwrite as fallbacks" lets the existing provider scorer expose those compatible alternatives.

Explicit stack/capability inputs are preserved and deduplicated. Inference supplies hints only; it does not grant authorization, connect an account, install a package, or execute a provider mutation.

## Bounded activation

Knowing about many candidates does not mean loading many candidates.

The existing selector budgets remain:

- up to 8 skills;
- up to 7 agents;
- up to 6 tools;
- up to 4 MCPs.

Candidates are ranked by task/stack/capability fit, recipe requirements, trust, maturity/maintenance, context cost, risk, host compatibility, update channel and project/user preferences.

High-security recipes still force the required security gates (including OWASP-oriented review, secret/dependency scanning and Strix verification where configured). P30 does not let a newly added community or provider candidate override those gates.

## Providers are alternatives, not endorsements

The provider registry now covers a broader range of hosting/cloud, databases, auth, storage, observability, jobs/events, communications, commerce and model providers.

These entries are capability/fallback metadata. A provider appearing in the registry does **not** mean:

- credentials are configured;
- a free tier currently exists;
- the provider is healthy;
- the provider is a drop-in replacement;
- DockyardOS may mutate it.

Existing provider detection, live pricing evidence, health checks, compatibility warnings and explicit mutation approval remain separate authority boundaries.

## Verification

P30 regression coverage verifies:

- catalogue/provider breadth and unique effective ids;
- safe compatible duplicate enrichment;
- website connector metadata remains non-executable;
- specialized selection for document/database work;
- broad auth/storage provider alternatives;
- natural-language capability and stack inference;
- explicit input preservation and deduplication;
- relevant connector scoring;
- bounded selector budgets;
- avoidance of common provider false positives.
