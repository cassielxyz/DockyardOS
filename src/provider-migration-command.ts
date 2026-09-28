import {
  executePostgresMigration,
  executePostgresRollback,
  planPostgresMigration,
  planPostgresRollback,
  type PostgresMigrationProvider,
  type PostgresMigrationRequest,
} from "./provider-migrations.js";
import type { ProviderEnvironment } from "./types.js";

function value(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function required(args: string[], name: string): string {
  const found = value(args, name);
  if (!found) throw new Error(`${name} is required`);
  return found;
}

function has(args: string[], name: string): boolean {
  return args.includes(name);
}

function environment(args: string[]): ProviderEnvironment {
  const found = value(args, "--environment") ?? "preview";
  if (!["local", "preview", "production"].includes(found)) {
    throw new Error("--environment must be local, preview, or production");
  }
  return found as ProviderEnvironment;
}

function migrationRequest(args: string[]): PostgresMigrationRequest {
  return {
    providerId: required(args, "--provider") as PostgresMigrationProvider,
    environment: environment(args),
    migrationId: required(args, "--id"),
    targetLabel: required(args, "--target-label"),
    expectedDatabase: required(args, "--expected-database"),
    forwardPath: required(args, "--forward"),
    rollbackPath: required(args, "--rollback"),
  };
}

const MIGRATION_USAGE = "dockyard providers migration plan|run --provider supabase|neon|railway|render|postgres --environment local|preview|production --id ID --target-label LABEL --expected-database DB --forward PATH.sql --rollback PATH.sql [--expected-forward-sha256 SHA --expected-rollback-sha256 SHA --approve --approve-production --approve-destructive]";
const ROLLBACK_USAGE = "dockyard providers migration rollback plan|run --artifact PATH [--expected-approval-sha256 SHA --approve --approve-production --approve-destructive]";

export async function handleProviderMigrationCommand(root: string, args: string[]): Promise<void> {
  const operation = args[0] ?? "plan";
  const rest = args.slice(1);

  if (operation === "plan") {
    console.log(JSON.stringify(await planPostgresMigration(root, migrationRequest(rest)), null, 2));
    return;
  }

  if (operation === "run") {
    const result = await executePostgresMigration(root, migrationRequest(rest), {
      approve: has(rest, "--approve"),
      approveProduction: has(rest, "--approve-production"),
      approveDestructive: has(rest, "--approve-destructive"),
      expectedForwardSha256: required(rest, "--expected-forward-sha256"),
      expectedRollbackSha256: required(rest, "--expected-rollback-sha256"),
    });
    console.log(JSON.stringify(result, null, 2));
    if (result.status !== "success") process.exitCode = 1;
    return;
  }

  if (operation === "rollback") {
    const rollbackOperation = rest[0] ?? "plan";
    const rollbackArgs = rest.slice(1);
    const artifact = required(rollbackArgs, "--artifact");
    if (rollbackOperation === "plan") {
      console.log(JSON.stringify(await planPostgresRollback(root, artifact), null, 2));
      return;
    }
    if (rollbackOperation === "run") {
      const result = await executePostgresRollback(root, artifact, {
        approve: has(rollbackArgs, "--approve"),
        approveProduction: has(rollbackArgs, "--approve-production"),
        approveDestructive: has(rollbackArgs, "--approve-destructive"),
        expectedApprovalSha256: required(rollbackArgs, "--expected-approval-sha256"),
      });
      console.log(JSON.stringify(result, null, 2));
      if (result.status !== "success") process.exitCode = 1;
      return;
    }
    throw new Error(`Usage: ${ROLLBACK_USAGE}`);
  }

  throw new Error(`Usage: ${MIGRATION_USAGE} | ${ROLLBACK_USAGE}`);
}
