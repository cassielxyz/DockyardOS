import assert from "node:assert/strict";
import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const dockyard = await import("../dist/index.js");

async function setup() {
  const home = await mkdtemp(join(tmpdir(), "dockyard-migration-home-"));
  const root = await mkdtemp(join(tmpdir(), "dockyard-migration-root-"));
  process.env.DOCKYARD_HOME = home;
  await mkdir(join(root, "db"), { recursive: true });
  const forwardPath = join(root, "db", "forward.sql");
  const rollbackPath = join(root, "db", "rollback.sql");
  await writeFile(forwardPath, "CREATE TABLE dockyard_fixture (id bigint PRIMARY KEY);\n", "utf8");
  await writeFile(rollbackPath, "DROP TABLE dockyard_fixture;\n", "utf8");
  return { home, root, forwardPath, rollbackPath };
}

function request(paths, overrides = {}) {
  return {
    providerId: "supabase",
    environment: "preview",
    migrationId: "create-fixture",
    targetLabel: "preview database",
    expectedDatabase: "postgres",
    forwardPath: paths.forwardPath,
    rollbackPath: paths.rollbackPath,
    ...overrides,
  };
}

test("migration plan binds exact forward and rollback hashes and flags destructive rollback", async () => {
  const paths = await setup();
  const plan = await dockyard.planPostgresMigration(paths.root, request(paths));
  assert.equal(plan.providerId, "supabase");
  assert.equal(plan.environment, "preview");
  assert.match(plan.forward.sha256, /^[a-f0-9]{64}$/);
  assert.match(plan.rollback.sha256, /^[a-f0-9]{64}$/);
  assert.equal(plan.forward.risk, "standard");
  assert.equal(plan.rollback.risk, "destructive");
  assert.equal(plan.risk, "destructive");
  assert.equal(plan.approvalRequired, true);
  assert.equal(plan.productionApprovalRequired, false);
  assert.equal(plan.destructiveApprovalRequired, true);
  assert.equal(plan.executor.command, "psql");
  assert.equal(plan.executor.transactionMode, "single-transaction");
});

test("migration SQL rejects psql meta commands and admin/server escape operations", () => {
  assert.throws(() => dockyard.inspectMigrationSql("\\! sh -c 'echo nope'\nSELECT 1;"), /meta-commands/i);
  assert.throws(() => dockyard.inspectMigrationSql("ALTER SYSTEM SET log_statement = 'all';"), /ALTER SYSTEM/i);
  assert.throws(() => dockyard.inspectMigrationSql("CREATE DATABASE other;"), /CREATE DATABASE/i);
  assert.throws(() => dockyard.inspectMigrationSql("COPY users TO PROGRAM 'cat >/tmp/x';"), /COPY PROGRAM/i);
  assert.throws(() => dockyard.inspectMigrationSql("BEGIN; CREATE TABLE x(id int); COMMIT;"), /must not manage its own transaction/i);
});

test("migration risk ignores destructive words in comments and strings but catches real destructive statements", () => {
  const safe = dockyard.inspectMigrationSql("-- DROP TABLE users\nINSERT INTO audit(message) VALUES ('DELETE FROM users');");
  assert.equal(safe.risk, "standard");
  const dangerous = dockyard.inspectMigrationSql("ALTER TABLE users DROP COLUMN legacy; DELETE FROM sessions WHERE expired = true;");
  assert.equal(dangerous.risk, "destructive");
  assert.ok(dangerous.riskSignals.includes("ALTER TABLE DROP"));
  assert.ok(dangerous.riskSignals.includes("DELETE FROM"));
});

test("migration plan confines SQL files to project root and rejects symlinks", async () => {
  const paths = await setup();
  const outside = join(await mkdtemp(join(tmpdir(), "dockyard-outside-")), "outside.sql");
  await writeFile(outside, "SELECT 1;\n", "utf8");
  await assert.rejects(() => dockyard.planPostgresMigration(paths.root, request(paths, { forwardPath: outside })), /inside the current project root/i);

  const link = join(paths.root, "db", "linked.sql");
  await symlink(paths.forwardPath, link);
  await assert.rejects(() => dockyard.planPostgresMigration(paths.root, request(paths, { forwardPath: link })), /non-symlink regular file/i);
});

test("migration execution approval gates fail before psql access", async () => {
  const paths = await setup();
  const plan = await dockyard.planPostgresMigration(paths.root, request(paths));
  await assert.rejects(() => dockyard.executePostgresMigration(paths.root, request(paths), {
    approve: false,
    expectedForwardSha256: plan.forward.sha256,
    expectedRollbackSha256: plan.rollback.sha256,
  }), /explicit --approve/i);

  await assert.rejects(() => dockyard.executePostgresMigration(paths.root, request(paths), {
    approve: true,
    expectedForwardSha256: plan.forward.sha256,
    expectedRollbackSha256: plan.rollback.sha256,
  }), /--approve-destructive/i);

  const production = await dockyard.planPostgresMigration(paths.root, request(paths, { environment: "production" }));
  await assert.rejects(() => dockyard.executePostgresMigration(paths.root, request(paths, { environment: "production" }), {
    approve: true,
    approveDestructive: true,
    expectedForwardSha256: production.forward.sha256,
    expectedRollbackSha256: production.rollback.sha256,
  }), /--approve-production/i);
});

test("changed migration file invalidates reviewed SHA before external execution", async () => {
  const paths = await setup();
  const plan = await dockyard.planPostgresMigration(paths.root, request(paths));
  await writeFile(paths.forwardPath, "CREATE TABLE changed_fixture (id bigint PRIMARY KEY);\n", "utf8");
  await assert.rejects(() => dockyard.executePostgresMigration(paths.root, request(paths), {
    approve: true,
    approveDestructive: true,
    expectedForwardSha256: plan.forward.sha256,
    expectedRollbackSha256: plan.rollback.sha256,
  }), /Forward migration changed after review/i);
});

async function writeSuccessfulExecution(paths) {
  const plan = await dockyard.planPostgresMigration(paths.root, request(paths));
  const executionId = "11111111-2222-4333-8444-555555555555";
  const dir = join(dockyard.providerMigrationStateRoot(paths.root), plan.migrationId);
  await mkdir(dir, { recursive: true });
  const artifactPath = join(dir, `execution-${executionId}.json`);
  const artifact = {
    schemaVersion: 1,
    kind: "postgres-migration-execution",
    projectId: plan.projectId,
    executionId,
    migrationId: plan.migrationId,
    providerId: plan.providerId,
    environment: plan.environment,
    targetLabel: plan.targetLabel,
    expectedDatabase: plan.expectedDatabase,
    actualDatabase: plan.expectedDatabase,
    forwardPath: plan.forward.path,
    forwardSha256: plan.forward.sha256,
    rollbackPath: plan.rollback.path,
    rollbackSha256: plan.rollback.sha256,
    forwardRisk: plan.forward.risk,
    rollbackRisk: plan.rollback.risk,
    status: "success",
    startedAt: "2026-09-28T11:00:00.000Z",
    finishedAt: "2026-09-28T11:00:01.000Z",
    commandStatus: 0,
    artifactPath,
  };
  await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  return { plan, artifactPath };
}

test("rollback plan binds successful execution artifact and exact unchanged rollback SQL", async () => {
  const paths = await setup();
  const { artifactPath } = await writeSuccessfulExecution(paths);
  const rollback = await dockyard.planPostgresRollback(paths.root, artifactPath);
  assert.match(rollback.executionArtifactSha256, /^[a-f0-9]{64}$/);
  assert.match(rollback.approvalSha256, /^[a-f0-9]{64}$/);
  assert.equal(rollback.rollback.risk, "destructive");
  assert.equal(rollback.destructiveApprovalRequired, true);
});

test("rollback plan refuses changed rollback SQL and artifacts outside project state", async () => {
  const paths = await setup();
  const { artifactPath } = await writeSuccessfulExecution(paths);
  await writeFile(paths.rollbackPath, "DROP TABLE another_table;\n", "utf8");
  await assert.rejects(() => dockyard.planPostgresRollback(paths.root, artifactPath), /changed after the successful migration/i);

  const outside = join(paths.root, "execution.json");
  await writeFile(outside, "{}\n", "utf8");
  await assert.rejects(() => dockyard.planPostgresRollback(paths.root, outside), /provider-migrations directory/i);
});

test("rollback execution requires exact reviewed digest and approvals before psql access", async () => {
  const paths = await setup();
  const { artifactPath } = await writeSuccessfulExecution(paths);
  const plan = await dockyard.planPostgresRollback(paths.root, artifactPath);
  await assert.rejects(() => dockyard.executePostgresRollback(paths.root, artifactPath, {
    approve: false,
    expectedApprovalSha256: plan.approvalSha256,
  }), /explicit --approve/i);
  await assert.rejects(() => dockyard.executePostgresRollback(paths.root, artifactPath, {
    approve: true,
    expectedApprovalSha256: plan.approvalSha256,
  }), /--approve-destructive/i);
  await assert.rejects(() => dockyard.executePostgresRollback(paths.root, artifactPath, {
    approve: true,
    approveDestructive: true,
    expectedApprovalSha256: "f".repeat(64),
  }), /does not match/i);
});
