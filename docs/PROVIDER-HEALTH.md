# Provider Health Verification

DockyardOS separates **provider readiness** from **provider service health**.

- `dockyard providers inspect` answers whether a provider CLI/configuration is present locally.
- `dockyard providers inspect --live` performs bounded read-only account/project readiness probes when the provider adapter supports them.
- `dockyard providers health` checks public provider-reported outage status without requiring provider credentials.

A working local login does not prove a provider is healthy, and an operational public status page does not prove the current user's account/project is correctly configured. DockyardOS keeps those signals separate.

## Supported official status sources

P18 pins a small explicit allowlist of official public status APIs:

| Provider | Status summary endpoint |
| --- | --- |
| GitHub | `https://www.githubstatus.com/api/v2/summary.json` |
| Vercel | `https://www.vercel-status.com/api/v2/summary.json` |
| Cloudflare | `https://www.cloudflarestatus.com/api/v2/summary.json` |
| Supabase | `https://status.supabase.com/api/v2/summary.json` |

These are Statuspage JSON summary endpoints. DockyardOS does not discover arbitrary status URLs from project content and does not scrape status-page HTML.

## CLI

Check every supported provider:

```bash
dockyard providers health
```

Check one or more providers explicitly:

```bash
dockyard providers health --provider github,vercel
```

Override the per-request timeout within the bounded 1–15 second range:

```bash
dockyard providers health --provider cloudflare --timeout-ms 8000
```

Output is always structured JSON so agents and CI can preserve the provider-reported evidence.

## Health states

Statuspage indicators map to DockyardOS health as follows:

| Statuspage indicator | DockyardOS health |
| --- | --- |
| `none` | `healthy` |
| `minor` | `degraded` |
| `major` | `outage` |
| `critical` | `outage` |

`unavailable` means DockyardOS could not obtain a valid bounded response from the pinned official endpoint. `invalid` means a response arrived but failed the expected Statuspage/provenance schema boundary.

The result also reports:

- provider/display name;
- exact pinned source URL;
- Dockyard check timestamp;
- source page update timestamp when supplied;
- provider description/indicator;
- count of unresolved investigating/identified/monitoring incidents;
- count of components reporting degraded performance, partial outage, major outage, or maintenance.

DockyardOS does not reproduce incident bodies or arbitrary remote HTML into provider health output.

## Exit behavior

The aggregate command intentionally distinguishes service trouble from incomplete verification:

- exit `0`: every requested provider reports `healthy`;
- exit `1`: at least one requested provider reports `degraded` or `outage`, and none are unverifiable;
- exit `2`: at least one requested provider is `unavailable` or returned an `invalid` response.

This means a network/DNS/status-page failure cannot be mistaken for proof that the provider itself is healthy.

## Network boundary

Provider health checks are read-only and require no provider authentication.

The fetcher:

- connects only to compile-time pinned HTTPS status endpoints;
- refuses redirects;
- sends `Accept: application/json`;
- sends an identifiable `DockyardOS/0.1` User-Agent for automated status access;
- disables HTTP cache reuse for the live check;
- applies a bounded timeout;
- rejects a declared or streamed response larger than 512 KiB;
- requires valid UTF-8 JSON;
- validates the Statuspage `page.url` host against the pinned provider host;
- accepts only the documented `none`, `minor`, `major`, or `critical` overall indicators.

No provider token, API key, project secret, or `.env` content is used for this command.

## Interpreting the result

Public status evidence is a provider-wide signal, not proof of a root cause for a specific project.

A useful troubleshooting sequence is:

1. `dockyard providers health --provider <id>` — check official outage/degradation evidence.
2. `dockyard providers inspect --live --id <id>` — check local CLI/account/project readiness when supported.
3. inspect the project's own deployment/build/runtime evidence.
4. only then choose retry, provider fallback, migration, or remediation work.

Do not automatically migrate providers solely because a public status page reports a temporary incident. Provider migration remains a separate reviewed workflow with compatibility and rollback requirements.
