# P21 — Alternative Provider Actions

DockyardOS P21 extends the guarded provider-action boundary beyond GitHub, Vercel, Cloudflare, and Supabase.

The goal is **not** to expose every command a provider CLI supports. P21 adds a small set of bounded, useful actions for fallback providers while keeping the P9 mutation model:

```text
plan (read-only)
  -> explicit target and parameter validation
  -> authenticated provider CLI
  -> --approve required for every mutation
  -> --approve-production additionally required for production
  -> provider command
  -> provider-native/read-only verification
  -> external DockyardOS audit artifact
```

Provider credentials remain owned by the provider CLI/environment. DockyardOS does not accept access tokens, API keys, deploy-hook URLs, or arbitrary command strings as action parameters.

## Supported P21 actions

### Neon — preview branch creation

```bash
dockyard providers action plan \
  --provider neon \
  --action preview-branch-create \
  --environment preview \
  --param project=<project-id> \
  --param branch=preview/pr-42
```

The generated mutation uses an explicit project and branch and includes `--no-secrets`. Current Neon CLI branch/project creation can otherwise include connection credentials in output, so DockyardOS deliberately suppresses that data before it can reach agent context or provider audit artifacts.

P21 creates from the project's default branch only. Alternate-parent branching is not exposed in this milestone.

References:
- https://neon.com/cli
- https://www.npmjs.com/package/neon

### Firebase Hosting — preview channel

```bash
dockyard providers action plan \
  --provider firebase \
  --action hosting-preview-deploy \
  --environment preview \
  --param project=<firebase-project-id> \
  --param channel=pr-42
```

Optional `target=<hosting-target>` limits the deploy to a configured Hosting target.

Firebase preview URLs are shareable/public to anyone who knows the URL, and preview Hosting normally talks to the selected project's real backend resources. DockyardOS therefore requires an explicit project and refuses common production names (`main`, `master`, `production`, `prod`, `live`) as a preview channel.

References:
- https://firebase.google.com/docs/hosting/test-preview-deploy
- https://firebase.google.com/docs/cli/targets

### Firebase Hosting — production

```bash
dockyard providers action plan \
  --provider firebase \
  --action hosting-production-deploy \
  --environment production \
  --param project=<firebase-project-id>
```

Optional `target=<hosting-target>` maps to `--only hosting:<target>`.

Execution requires both:

```text
--approve --approve-production
```

### Railway — explicit service deploy

```bash
dockyard providers action plan \
  --provider railway \
  --action service-deploy \
  --environment preview \
  --param project=<project-id> \
  --param railway-environment=<environment> \
  --param service=<service>
```

Optional `path=<project-local-path>` uploads a project-local subdirectory. The path cannot escape the current workspace.

DockyardOS requires project + environment + service even though Railway can infer some of them from local linkage. This keeps autonomous actions explicit. `railway up --ci --json` waits for the deploy result and exits non-zero on deployment failure. A bounded log read using the same project/environment/service is used as post-action verification.

References:
- https://docs.railway.com/cli/up
- https://docs.railway.com/cli/logs

### Render — service deploy

```bash
dockyard providers action plan \
  --provider render \
  --action service-deploy \
  --environment preview \
  --param service=<service-id>
```

An optional `commit=<40-character-git-sha>` pins a Git-backed service deploy to one exact revision.

DockyardOS uses the authenticated Render CLI rather than deploy-hook URLs, because deploy hooks are secret-bearing URLs that should not appear in plans, agent context, or audit artifacts. `--wait` makes a failed deploy return a non-zero status, followed by an explicit deploy listing for verification.

References:
- https://render.com/docs/cli
- https://render.com/docs/cli-reference

### Appwrite — one function

```bash
dockyard providers action plan \
  --provider appwrite \
  --action function-deploy \
  --environment preview \
  --param function-id=<function-id>
```

This action requires an existing `appwrite.config.json` so the target endpoint/project is explicit in the linked project configuration. P21 pushes one selected function with Appwrite's non-interactive `--force` mode; it does not expose push-all, database, table, bucket, or team mutations.

For preview use, the linked Appwrite config should target a dedicated non-production project.

Reference:
- https://appwrite.io/docs/tooling/command-line/non-interactive

## Approval boundary

Planning never invokes provider mutation commands.

Every action run requires:

```text
--approve
```

Production actions additionally require:

```text
--approve-production
```

Approval checks run before CLI availability/authentication checks. This prevents an unapproved action from reaching external tooling at all.

## Parameter boundary

P21 rejects:

- unknown parameters;
- API-key/token/secret parameters because they are not part of any action schema;
- arbitrary deploy-hook URLs;
- unsafe branch/channel identifiers;
- project paths outside the current workspace;
- short/ambiguous Render commit identifiers;
- common production names when an action is explicitly a preview action.

## Providers still detection-only

DockyardOS continues to know about Fly.io, Turso, PocketBase, Google Cloud Run, Sentry, and other provider candidates. P21 does not automatically promote every detected provider into a mutation adapter.

A provider remains detection/planning-only until DockyardOS has a current, bounded, noninteractive action contract with explicit target selection and a safe verification path.

## Verification

P21 deterministic tests cover:

- routed primary + alternative action discovery;
- exact action command plans;
- Neon `--no-secrets` behavior;
- Firebase preview/production separation;
- Railway explicit project/environment/service and project-path confinement;
- Render full commit SHA validation;
- Appwrite single-function/linkage requirement;
- unknown/secret parameter rejection;
- approval and production-approval ordering before any external CLI invocation.

Normal CI also exercises read-only CLI planning only. It never performs a live provider mutation.
