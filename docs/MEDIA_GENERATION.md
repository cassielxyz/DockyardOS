# Credential-Safe Media Generation

DockyardOS keeps **provider connection**, **model selection**, **billable approval**, and **execution** as separate states.

## P40.1: Google AI connection

The VS Code Connections Center supports `google-ai` as a secret-backed provider.

Normal flow:

```text
Connections
  -> Google AI / Gemini API
  -> Connect
  -> masked API-key input
  -> read-only models probe
  -> key stored only in VS Code SecretStorage
  -> authenticated
```

The key is never sent to the webview model, written into the project, checkpoint JSON, logs, generated source, media plans, or durable evidence.

For Core verification the extension passes the key only in the spawned process environment as `GEMINI_API_KEY`. Core also accepts `GOOGLE_API_KEY` when used directly outside the extension.

Read-only live verification calls:

```text
GET https://generativelanguage.googleapis.com/v1beta/models
x-goog-api-key: <in-memory credential>
```

Dockyard records only success/failure and safe HTTP status metadata. It does not print response bodies on auth failure and never prints the credential.

## Veo plan-only boundary

P40.1 adds:

```bash
dockyard media plan \
  --prompt "Cinematic product reveal" \
  --priority quality \
  --resolution 1080p \
  --aspect 16:9 \
  --duration 8
```

The result contains:

- selected verified Veo model;
- exact provider endpoint;
- prompt SHA-256;
- request-body SHA-256;
- exact approval SHA-256;
- aspect ratio, resolution, duration, and video count;
- `billable: true`;
- `approvalRequired: true`;
- `executionEnabled: false`;
- credential-handling contract;
- a non-secret durable evidence template.

Planning performs **no generation request and no spend**.

Future live execution must:

1. re-plan immediately before generation;
2. require explicit billable approval;
3. require the exact current `approvalSha256`;
4. re-verify provider authentication;
5. review current provider pricing before spend;
6. send the key only in the `x-goog-api-key` header;
7. store only non-secret request/output hashes and status/timing evidence;
8. download and verify the generated clip before FFmpeg frame extraction.

## Current Veo constraints used by Dockyard

P40.1 follows the current Gemini API Veo 3.1 contract:

- aspect ratio: `16:9` or `9:16`;
- duration: `4`, `6`, or `8` seconds;
- 1080p and 4K generation require 8 seconds;
- one generated video per request;
- Veo generation is billable and current provider pricing must be reviewed immediately before execution.

The model catalogue remains:

- `veo-3.1-generate-preview`
- `veo-3.1-fast-generate-preview`
- `veo-3.1-lite-generate-preview`

Official references used for the current contract:

- https://ai.google.dev/gemini-api/docs/api-key
- https://ai.google.dev/api/models
- https://ai.google.dev/gemini-api/docs/veo
- https://ai.google.dev/gemini-api/docs/pricing

## Safety invariants

- configured != authenticated;
- authenticated != approved;
- approved != executed;
- model selected != credential available;
- a stored API key does not authorize generation spend;
- reconnecting a provider does not grant mutation approval;
- no key/token may enter Dockyard checkpoint state;
- the public MCP bridge does not expose billable media execution.
