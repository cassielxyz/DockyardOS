# DockyardOS Provider Migrations

P23 adds a constrained migration executor for PostgreSQL-family providers. The goal is not to expose a generic SQL shell. It is to make a reviewed forward migration and its reviewed rollback reproducible, approval-bound, target-checked, and recoverable across supported Postgres providers.

## Supported targets

The migration executor currently accepts these audit/provider labels:

- `supabase`
- `neon`
- `railway`
- `render`
- `postgres`

They all use the PostgreSQL wire protocol and are executed through the local `psql` client. Non-Postgres products such as Firebase or Appwrite are intentionally not treated as equivalent migrations.

## Authentication

DockyardOS does **not** accept a connection URI, password, API token, or database secret as a migration CLI argument.

`psql` uses native libpq configuration already present in the environment, for example:

- `PGHOST`
- `PGPORT`
- `PGDATABASE`
- `PGUSER`
- `PGPASSWORD`
- `PGSERVICE`
- `.pgpass` / provider-native PostgreSQL configuration

DockyardOS sets only `PGAPPNAME=DockyardOS` for the child process. Credentials therefore stay in the normal PostgreSQL authentication layer instead of being copied into command history, plan JSON, checkpoints, or migration evidence.

## Migration files

Every migration requires two project-local SQL files:

```text
forward.sql
rollback.sql
```

Both files must:

- stay inside the current project root;
- be regular files, not symlinks;
- use the `.sql` extension;
- be non-empty and no larger than 2 MiB;
- pass DockyardOS SQL boundary checks.

A plan records the exact SHA-256 and size of both files. A later run must provide those reviewed digests and DockyardOS hashes the files again before connecting to the database.

## Read-only plan

Example:

```bash
dockyard providers migration plan \
  --provider supabase \
  --environment preview \
  --id add-profiles \
  --target-label preview-db \
  --expected-database postgres \
  --forward db/migrations/add-profiles.forward.sql \
  --rollback db/migrations/add-profiles.rollback.sql
```

The plan contains:

- provider/environment/migration identity;
- a human-readable non-secret target label;
- the database name DockyardOS must observe before mutation;
- forward and rollback paths, SHA-256 values, sizes, and risk signals;
- whether production approval is required;
- whether destructive approval is required;
- execution mode and safety notes.

Planning does not call `psql` and does not contact the database.

## SQL boundary

DockyardOS deliberately refuses several operations that are outside an application migration boundary, including:

- psql meta-commands such as lines beginning with `\`;
- explicit `BEGIN`, `COMMIT`, or `ROLLBACK` in the migration file;
- `ALTER SYSTEM`;
- `CREATE DATABASE` / `DROP DATABASE`;
- role/user creation, alteration, or deletion;
- `COPY ... PROGRAM`;
- selected PostgreSQL server-file primitives such as `pg_read_file` / `pg_read_binary_file` / `lo_import`.

This is not a full SQL sandbox. Application SQL still has whatever privileges the connected PostgreSQL role grants. The boundary prevents common ways of escaping the intended transactional application-migration workflow.

## Destructive classification

DockyardOS marks a migration as destructive when the reviewed SQL contains operations such as:

- dropping tables/schemas/types/views/indexes/functions/triggers/sequences;
- `TRUNCATE`;
- `DELETE FROM`;
- `ALTER TABLE ... DROP COLUMN/CONSTRAINT`.

Comments and ordinary quoted strings are removed before this heuristic classification so text such as `-- DROP TABLE` does not trigger the flag by itself.

Destructive migrations require an additional explicit `--approve-destructive` flag.

## Apply a reviewed migration

After reviewing the plan, copy the exact forward and rollback digests into the run command:

```bash
dockyard providers migration run \
  --provider supabase \
  --environment preview \
  --id add-profiles \
  --target-label preview-db \
  --expected-database postgres \
  --forward db/migrations/add-profiles.forward.sql \
  --rollback db/migrations/add-profiles.rollback.sql \
  --expected-forward-sha256 <forward-sha256> \
  --expected-rollback-sha256 <rollback-sha256> \
  --approve
```

If either SQL file is destructive, also add:

```text
--approve-destructive
```

For production, add the separate production acknowledgement:

```text
--approve-production
```

A production destructive migration therefore requires all three approvals:

```text
--approve --approve-production --approve-destructive
```

## Target verification

Before SQL execution DockyardOS runs a small read-only `psql` query:

```sql
SELECT current_database();
```

The returned name must exactly match `--expected-database`. A connection that points to a different database is refused before the migration file is executed.

The target label is only human-readable audit context. It never substitutes for the explicit database-name check.

## Transactional execution

Forward and rollback files are run as:

```text
psql --no-psqlrc --set ON_ERROR_STOP=1 --single-transaction --file <reviewed.sql>
```

This means:

- user/system `.psqlrc` startup commands are not loaded;
- the first SQL error stops processing;
- the file is wrapped in one PostgreSQL transaction;
- an execution error rolls back the transaction rather than intentionally committing earlier statements.

Some PostgreSQL operations cannot execute inside a transaction. P23 fails those migrations instead of silently switching to a weaker partial-apply mode.

## Migration evidence

Every attempted migration writes external evidence under:

```text
~/.dockyardos/projects/<project-id>/provider-migrations/<migration-id>/
```

The execution artifact includes the reviewed provider/environment, target identity, exact forward/rollback hashes, risk state, timestamps, command status, and artifact path.

Successful stdout is not intended as an evidence channel; migration SQL should not be used to print application data. Failure diagnostics are bounded/redacted by DockyardOS process handling.

The source repository is not modified by these runtime artifacts.

## Rollback planning

Only a successful current-project migration execution artifact can become the source of a rollback plan:

```bash
dockyard providers migration rollback plan \
  --artifact ~/.dockyardos/projects/<project-id>/provider-migrations/add-profiles/execution-<id>.json
```

DockyardOS verifies that:

- the execution artifact is a non-symlink file under this project's external migration state;
- it identifies this DockyardOS project;
- the original migration status is `success`;
- the stored rollback file still exists inside the project root;
- the rollback SHA-256 is exactly the hash bound to the successful migration.

If the rollback SQL changed after the successful migration, DockyardOS refuses automatic rollback planning. Recovery then needs a newly reviewed controlled migration rather than pretending the old rollback is still valid.

The rollback plan emits an `approvalSha256` that binds the successful execution artifact, provider/environment/target identity, and exact rollback hash.

## Execute rollback

```bash
dockyard providers migration rollback run \
  --artifact <execution-artifact.json> \
  --expected-approval-sha256 <rollback-plan-approval-sha256> \
  --approve
```

Production and destructive rollback plans require the same additional acknowledgement flags as forward execution.

Immediately before rollback DockyardOS re-reads the execution artifact, re-hashes the rollback SQL, recalculates the approval digest, and re-verifies the current database. Any drift fails closed.

Rollback itself also uses one `psql --single-transaction` invocation with `ON_ERROR_STOP=1` and writes a separate external rollback artifact.

## What P23 does not do

P23 intentionally does not:

- generate rollback SQL automatically;
- assume a provider's snapshot/backup is equivalent to application rollback SQL;
- accept arbitrary SQL text directly on the command line;
- store database passwords or connection URIs;
- silently execute a migration because an agent selected a provider;
- downgrade approval requirements in autonomous mode;
- pretend non-Postgres data models are compatible with the same executor.

For especially sensitive production changes, provider-native backups/snapshots and a separately reviewed operational recovery plan should complement the DockyardOS rollback artifact.
