# DockyardOS Security Principles

DockyardOS can mediate tools with access to source code, deployment providers, databases, DNS, and credentials. Its default security posture is deliberately conservative around irreversible or production-impacting actions.

## Rules

- Project-local reversible edits may run automatically in Balanced mode.
- Destructive Git, database, infrastructure, DNS, secret, and production deployment actions require explicit approval.
- Obviously machine-destructive commands are denied.
- Provider credentials are never stored in checkpoint JSON or committed project files.
- Remote URLs are sanitized before they are used as project identity material.
- Checkpoints store only bounded Git patches for tracked changes; they do not blindly archive the entire workspace.
- Community skills/tools require provenance, permission metadata, pinning, scanning, and isolated evaluation before automatic activation.
- Security exceptions never delete scanner evidence and never convert an incomplete/error scan into success.

## High-security workflow

A high-security production workflow includes, when applicable:

1. threat modeling
2. OWASP-oriented review
3. secret scanning
4. dependency vulnerability scanning
5. static-analysis verification
6. opt-in authorized Strix application-security verification when appropriate
7. remediation
8. same-scope regression and security rerun
9. explicit policy evaluation when an owned temporary exception is required
10. SARIF export for code-host/dashboard evidence

Security tools are verification aids; they do not replace manual review or authorization boundaries.

## Raw scanner truth remains authoritative

`dockyard security scan` writes normalized raw evidence to the run's external `result.json`. Existing scanner semantics do not change when a policy exception exists:

```text
clean | findings | incomplete | error
```

A missing required scanner remains `incomplete`. Scanner errors remain `error`. Findings remain present in `result.json` even if the project has an approved temporary exception.

Policy evaluation is a separate layer with these gates:

```text
pass | accepted-risk | fail | incomplete
```

- `pass`: the raw run completed without findings.
- `accepted-risk`: every raw finding matched an active owned exception; the findings remain preserved and are **not** described as clean.
- `fail`: at least one raw finding is not covered by an active exception.
- `incomplete`: the raw run was `incomplete` or `error`; exceptions cannot override missing/failed verification.

## Project-specific secret baselines

Gitleaks exceptions store only the scanner fingerprint. DockyardOS does not copy a secret value into its policy file.

Add a temporary baseline:

```bash
dockyard security policy add-secret \
  --id known-test-fixture \
  --fingerprint '<gitleaks-fingerprint>' \
  --owner security-team \
  --rationale 'Known inert fixture credential used only in tests.' \
  --expires 2027-01-15T00:00:00Z
```

Each exception requires:

- a stable unique id
- an owner
- a meaningful rationale
- a future expiry no more than 365 days from creation

Expired entries remain visible in policy/history but stop matching findings automatically.

## Dependency exceptions

OSV dependency exceptions bind to **both** advisory id and package name so a broad advisory-only waiver cannot silently suppress a different dependency.

```bash
dockyard security policy add-dependency \
  --id upstream-fix-pending \
  --advisory GHSA-XXXX-YYYY-ZZZZ \
  --package example-lib \
  --owner dependency-owner \
  --rationale 'Upstream fixed release is temporarily incompatible with the current runtime.' \
  --expires 2027-01-15T00:00:00Z
```

Inspect or remove policy entries:

```bash
dockyard security policy show
dockyard security policy remove --id upstream-fix-pending
```

The policy lives outside the source repository under the current project's DockyardOS external state.

## Expiry review reminders

Security exceptions are temporary by design. DockyardOS can generate a read-only review report for exceptions that are already expired or will expire soon:

```bash
dockyard security policy reminders
dockyard security policy reminders --within-days 14
dockyard security policy reminders --within-days 30 --owner security-team
```

The default review window is 30 days and can be set from 1 through 90 days. The report includes:

- exception id and kind;
- owner and rationale;
- created/expiry timestamps;
- `expired` or `expiring-soon` status;
- signed `daysUntilExpiry` evidence;
- the Gitleaks fingerprint or OSV advisory/package identity needed to understand what the exception covers;
- summary counts and `needsReview` for host/automation integrations.

`reminders` never renews an exception, changes its expiry, removes it, or converts it to a different policy state. An expired exception remains expired and already stops matching findings under the normal policy evaluator. The command only makes the approaching review obligation explicit so a human can remove the exception, remediate the underlying issue, or deliberately create a new reviewed policy decision through the existing bounded policy commands.

Owner filtering is case-insensitive and only narrows the read-only report; it does not transfer ownership.

## Evaluate a completed security run

Evaluate one immutable normalized run result:

```bash
dockyard security policy evaluate \
  --result ~/.dockyardos/projects/<project-id>/security/runs/<run-id>/result.json
```

DockyardOS validates that the supplied path belongs to the current project and exactly matches the run's recorded external artifact directory before applying exceptions.

Policy evaluation writes `policy-report.json` beside the raw run evidence. It records active, expired, matched, unmatched, accepted, and blocking exception/finding state without editing `result.json`.

CLI exit behavior for the policy gate is intentionally explicit:

- `pass` / `accepted-risk`: exit 0
- `fail`: exit 1
- `incomplete`: exit 2

This lets CI distinguish an explicit, owned accepted risk from a clean raw scan while still failing on uncovered findings or missing verification.

## SARIF aggregation

Export one normalized run to SARIF 2.1.0:

```bash
dockyard security sarif \
  --result ~/.dockyardos/projects/<project-id>/security/runs/<run-id>/result.json
```

The generated `dockyard.sarif` stays inside the run artifact directory. It contains every normalized Dockyard finding. A finding covered by an active exception is represented using a SARIF external suppression with the owner, exception id, rationale, and expiry in the justification; the underlying result is still present.

Incomplete/error runs set SARIF `executionSuccessful` to `false` and include scanner execution notifications. The SARIF properties also carry the raw run status and Dockyard policy gate so a dashboard cannot mistake an incomplete scan for clean evidence.

## Guarded GitHub SARIF upload

DockyardOS can optionally publish a generated `dockyard.sarif` to GitHub code scanning. Publication is never automatic and does not accept a token on the command line.

First review a non-mutating upload plan with an explicit GitHub repository, commit, and full Git ref:

```bash
dockyard security sarif upload plan \
  --sarif ~/.dockyardos/projects/<project-id>/security/runs/<run-id>/dockyard.sarif \
  --repository OWNER/REPO \
  --commit <40-character-commit-sha> \
  --ref refs/heads/main
```

The plan returns the exact SARIF SHA-256, raw/compressed size, run identity, target repository/ref/commit, and API endpoint. DockyardOS does not guess which commit the scan represents; the caller must review that mapping explicitly.

Only after reviewing the plan may the same artifact be uploaded:

```bash
dockyard security sarif upload run \
  --sarif ~/.dockyardos/projects/<project-id>/security/runs/<run-id>/dockyard.sarif \
  --repository OWNER/REPO \
  --commit <40-character-commit-sha> \
  --ref refs/heads/main \
  --expected-sha256 <sha256-from-plan> \
  --approve
```

Upload safeguards:

- only the generated `<run-id>/dockyard.sarif` inside the current project's external security-run directory is eligible;
- the SARIF must be version 2.1.0, identify `DockyardOS` as the tool, and embed the same Dockyard run ID as its directory;
- repository, commit, and ref are explicit and strictly validated;
- the report is re-hashed immediately before mutation and a stale reviewed digest fails closed;
- gzip-compressed SARIF above 10 MiB is rejected locally before upload;
- `--approve` is mandatory and there is no auto-approval path;
- the adapter uses the already-authenticated `gh` CLI, so tokens are not stored in Dockyard state or passed as CLI parameters;
- the gzip+Base64 API request is written only to a mode-`0600` ephemeral file beside the run artifacts and removed after the request;
- an external `sarif-upload-*.json` audit artifact records the target, exact SARIF digest, GitHub upload ID/status, and verification URLs without storing the compressed SARIF or credentials.

GitHub processes SARIF asynchronously. A successful POST can therefore return `accepted` before processing is complete. DockyardOS performs one immediate status query and reports `complete`, `accepted`, `accepted-unverified`, or `processing-failed` without pretending a pending/failed analysis is complete.

The authenticated GitHub identity must have the repository code-scanning write permission required by GitHub, and GitHub code scanning must be available for the target repository.

## Security evidence location

Security run artifacts, policy, reports, threat models, SARIF, and SARIF upload audit records stay under DockyardOS external project state instead of being written into the application repository:

```text
~/.dockyardos/projects/<project-id>/security/
```

This keeps project source clean while preserving durable evidence across agent/model/host changes.