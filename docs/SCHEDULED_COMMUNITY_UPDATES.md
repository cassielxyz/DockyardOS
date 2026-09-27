# Scheduled Community Updates

DockyardOS can use the VS Code extension as an opt-in host automation surface for recurring community-package update checks.

Scheduling does not create a new trust path. It wraps the existing P8 update commands and preserves their package-signature, quarantine, permission, risk, trust, immutable-revision, and content-digest decisions.

## Default behavior

Scheduled checks are disabled by default.

Enable only the check loop with:

```text
dockyardOS.communityUpdates.enabled = true
```

The default interval is 360 minutes. The extension clamps the configured interval to a minimum of 60 minutes and a maximum of 7 days.

The recurring check is equivalent to:

```bash
dockyard community updates check --json
```

The scheduler distinguishes automatic-safe candidates from `approval-required`, `quarantined`, `manifest-missing`, and `error` states. Those review/blocking states are never converted into automatic success.

## Optional safe-only apply

Unattended activation is a second, separate opt-in:

```text
dockyardOS.communityUpdates.applySafeAutomatically = true
```

When both scheduling and safe-only apply are enabled, the extension may invoke only:

```bash
dockyard community updates apply-safe --json
```

`apply-safe` rechecks each candidate and activates only an update that still has the `automatic` decision after a fresh pinned assessment. The activation call uses the exact candidate revision and content SHA-256 and sets approval to false.

The scheduler itself never invokes `community install` and never passes `--approve`.

Therefore these states remain non-unattended:

- permission expansion;
- trust downgrade;
- risk increase;
- missing, invalid, unknown, or revoked publisher signatures;
- inferred permissions that exceed the manifest;
- quarantine findings;
- registry/package ambiguity;
- missing effective manifest;
- assessment or activation errors.

## Workspace and lifecycle safeguards

The VS Code scheduler:

- does not run in an untrusted workspace;
- does not run unless a workspace folder is open;
- prevents overlapping update cycles;
- records the last attempt in workspace state before starting a check;
- derives the next run from the last attempt so restarts do not create a rapid retry loop;
- reschedules after failures at the bounded cadence;
- keeps no-update notifications disabled by default;
- can open the Community Hub when an update needs review.

The extension activates on VS Code startup so an explicitly enabled recurring schedule can function. When scheduling is disabled, startup activation does not execute DockyardOS project commands just because the editor opened.

## Manual check

Use:

```text
DockyardOS: Check Community Updates Now
```

A manual check never performs automatic apply, even if scheduled safe-only apply is enabled. It is useful before changing scheduler settings or when reviewing update state in the Community Hub.

## Configuration

| Setting | Default | Meaning |
| --- | --- | --- |
| `dockyardOS.communityUpdates.enabled` | `false` | Enable recurring checks. |
| `dockyardOS.communityUpdates.intervalMinutes` | `360` | Check interval, bounded to 60–10080 minutes. |
| `dockyardOS.communityUpdates.applySafeAutomatically` | `false` | Allow only P8 `apply-safe` automatic candidates to activate unattended. |
| `dockyardOS.communityUpdates.notifyWhenNoUpdates` | `false` | Show informational notifications when nothing needs attention. |

## Verification boundary

P15 tests and packaging checks verify that:

- scheduling remains opt-in;
- cadence bounds are enforced in both configuration metadata and runtime normalization;
- the scheduled cycle contains `updates check` and `updates apply-safe` but no `community install` or `--approve` path;
- workspace trust is checked before background work;
- failed cycles reschedule;
- the scheduler helper is syntax-checked and included in the produced VSIX.

The underlying P8 deterministic tests remain the authority for the safe-update activation decision itself.
