# Official Public Edition Sponsored Placement Control

DockyardOS has two intentionally different distribution modes:

- **source-development** — the open-source repository and normal contributor builds. The server ad gate is not active.
- **official-public** — artifacts produced by the guarded public release workflow. Sponsored-placement enforcement is required and the official control-plane HTTPS origin is stamped into the bundled Core before packaging.

This distinction is explicit because an open-source local program cannot make a policy impossible to remove from a user-modified fork. DockyardOS instead enforces the policy for official published artifacts and never claims to control modified source builds.

## Runtime flow

The official public edition uses a first-party flow rather than embedding third-party advertising JavaScript:

```text
official DockyardOS client
       |
       | POST /api/ad-session
       v
server selects active sponsored placement
       |
       | signed short-lived session + min-view time
       v
client/agent displays clearly labeled Sponsored placement
       |
       | POST /api/ad-ack after minimum window
       v
server issues install-bound short-lived lease
       |
       +--> Antigravity PreToolUse gate
       +--> shared DockyardOS MCP operations
       +--> request mediation / team execution
```

A lease is bound to an opaque DockyardOS installation identifier. The server stores no raw source code, prompt text, project path, or user account identity as part of this flow.

The public client does not contain the server signing secret, admin token, or storage token.

## Control-plane endpoints

The repository includes Vercel-compatible serverless endpoints:

- `POST /api/ad-session` — issue a sponsored placement session.
- `POST /api/ad-ack` — acknowledge the minimum view window and issue a lease.
- `POST /api/ad-verify` — validate a current install-bound lease.
- `GET /api/admin/ads` — read campaign policy; admin bearer required.
- `PUT /api/admin/ads` — update campaign policy; admin bearer + configured storage required.
- `GET /api/admin/metrics` — aggregate session/impression/lease counters; admin bearer required.

The static administrator UI is under `/admin/` and uses only same-origin scripts/styles. Its Content Security Policy disables remote script, frame, object, and image content. The administrator token remains in JavaScript memory for the current tab and is not written to localStorage, sessionStorage, IndexedDB, source files, or release artifacts.

## Required server environment

### Always required for an operational official control plane

```text
DOCKYARD_AD_SIGNING_SECRET=<random value, at least 32 characters>
DOCKYARD_ADMIN_TOKEN=<random administrator bearer value, at least 24 characters>
```

Generate these with a password manager or cryptographically secure secret generator. Do not commit them.

### Required for live admin writes and aggregate metrics

DockyardOS uses the Upstash Redis REST protocol so the control plane remains serverless-friendly:

```text
UPSTASH_REDIS_REST_URL=<server-side REST endpoint>
UPSTASH_REDIS_REST_TOKEN=<server-side REST token>
```

Without Upstash, the public server can still serve the built-in DockyardOS house placement (or a read-only `DOCKYARD_AD_CONFIG_JSON` deployment value), but the admin dashboard cannot persist edits and aggregate metrics are unavailable.

### Optional read-only deployment configuration

```text
DOCKYARD_AD_CONFIG_JSON=<validated JSON campaign configuration>
```

This is useful before storage is connected. Admin `PUT` deliberately fails closed without persistent storage rather than pretending a policy change was saved.

## Public release configuration

The source repository ships:

```json
{
  "schemaVersion": 1,
  "edition": "source-development",
  "adEnforcement": "development",
  "controlPlaneUrl": null
}
```

The guarded VS Code release workflow requires the repository variable:

```text
DOCKYARD_PUBLIC_CONTROL_URL=https://<your-control-plane-origin>
```

It then runs `scripts/stamp-public-release.mjs`, producing an `official-public` marker with `adEnforcement: required`. The workflow verifies that marker inside the generated VSIX and again immediately before Marketplace publication.

The URL is public configuration, not a secret. It must be a credential-free HTTPS origin with no nested path, query, or fragment.

## Enforcement surfaces

### Antigravity

The plugin uses `PreInvocation` to request/refresh the lease before DockyardOS request mediation. If a sponsored placement is due, the model receives an ephemeral instruction to show the clearly labeled placement and defer the queued development request.

`PreToolUse` uses the `*` matcher so **every Antigravity tool class** passes the DockyardOS gate before the normal Safe/Balanced/Autonomous approval policy. When the official lease is not current, the tool call is denied.

### Gemini CLI, Codex, Claude Code, Cursor, OpenCode, and other MCP hosts

The shared MCP bridge exports `dockyard_public_gate`. Core DockyardOS MCP operations also call the same gate internally, including context, recommendations, team start/status/advance, checkpoints, command policy, and community capability entrypoints.

A blocked MCP result includes the sponsored placement and an instruction to display it clearly before retrying. Source-development builds return `development` and continue without the public-release gate.

## Fail-closed behavior

For an `official-public` build:

- missing/invalid release marker => DockyardOS execution gate unavailable;
- unreachable control plane => execution gate unavailable;
- missing server signing secret => control plane refuses token issuance;
- expired/tampered/wrong-install lease => rejected;
- minimum sponsored view window not elapsed => acknowledgement rejected;
- campaign service disabled => official public functionality remains gated rather than silently becoming ad-free.

There is no public `DISABLE_ADS`, `NO_ADS`, `SKIP_ADS`, or equivalent runtime flag.

## Campaign policy

Each campaign is bounded and text-oriented:

- stable ID;
- enabled flag;
- title/body;
- CTA label and credential-free HTTPS URL;
- weight (1-100);
- optional start/end timestamps.

The server currently permits at most 32 campaigns. If no configured campaign is active, the built-in DockyardOS house placement remains available.

## Commercial neutrality

Sponsored relationships must never influence:

- capability or skill scoring;
- provider ranking/fallback selection;
- free-tier/pricing evidence;
- agent/subagent selection;
- security findings, OWASP/Strix decisions, or risk gates;
- community package trust/quarantine decisions;
- code-review conclusions.

The placement is monetization UI, not technical evidence.

## Private personal edition

The private personal repository is deliberately **not** produced by adding a hidden bypass to the public repository. After the public core and capability-expansion milestones are fully validated, the completed tree can be copied to the private repository and patched there as a separate `private-personal` edition with the public monetization gate removed/disabled at build time.

Until that final synchronization checkpoint, `DockyardOS-pvt` should remain empty so it cannot drift from unfinished public functionality.
