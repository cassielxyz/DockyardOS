import { createHash, randomUUID } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { commandExists, run } from "./process.js";
import { projectDirectory, projectIdForRoot } from "./project.js";
import { readJson, writeJsonAtomic } from "./fs-utils.js";
import type { ProviderEnvironment } from "./types.js";

export type PostgresMigrationProvider = "supabase" | "neon" | "railway" | "render" | "postgres";
export type MigrationRisk = "standard" | "destructive";

export interface PostgresMigrationRequest {
  providerId: PostgresMigrationProvider;
  environment: ProviderEnvironment;
  migrationId: string;
  targetLabel: string;
  expectedDatabase: string;
  forwardPath: string;
  rollbackPath: string;
}

export interface SqlArtifactEvidence {
  path: string;
  relativePath: string;
  sha256: string;
  bytes: number;
  risk: MigrationRisk;
  riskSignals: string[];
}

export interface PostgresMigrationPlan {
  schemaVersion: 1;
  projectId: string;
  createdAt: string;
  providerId: PostgresMigrationProvider;
  environment: ProviderEnvironment;
  migrationId: string;
  targetLabel: string;
  expectedDatabase: string;
  forward: SqlArtifactEvidence;
  rollback: SqlArtifactEvidence;
  risk: MigrationRisk;
  mutating: true;
  approvalRequired: true;
  productionApprovalRequired: boolean;
  destructiveApprovalRequired: boolean;
  executor: {
    command: "psql";
    transactionMode: "single-transaction";
    credentialSource: "postgres-environment";
  };
  notes: string[];
}

export interface MigrationApproval {
  approve?: boolean;
  approveProduction?: boolean;
  approveDestructive?: boolean;
  expectedForwardSha256: string;
  expectedRollbackSha256: string;
}

export interface MigrationExecutionArtifact {
  schemaVersion: 1;
  kind: "postgres-migration-execution";
  projectId: string;
  executionId: string;
  migrationId: string;
  providerId: PostgresMigrationProvider;
  environment: ProviderEnvironment;
  targetLabel: string;
  expectedDatabase: string;
  actualDatabase: string;
  forwardPath: string;
  forwardSha256: string;
  rollbackPath: string;
  rollbackSha256: string;
  forwardRisk: MigrationRisk;
  rollbackRisk: MigrationRisk;
  status: "success" | "error";
  startedAt: string;
  finishedAt: string;
  commandStatus: number | null;
  diagnostic?: string;
  artifactPath: string;
}

export interface RollbackPlan {
  schemaVersion: 1;
  projectId: string;
  createdAt: string;
  executionArtifactPath: string;
  executionArtifactSha256: string;
  executionId: string;
  migrationId: string;
  providerId: PostgresMigrationProvider;
  environment: ProviderEnvironment;
  targetLabel: string;
  expectedDatabase: string;
  rollback: SqlArtifactEvidence;
  approvalSha256: string;
  mutating: true;
  approvalRequired: true;
  productionApprovalRequired: boolean;
  destructiveApprovalRequired: boolean;
  notes: string[];
}

export interface RollbackApproval {
  approve?: boolean;
  approveProduction?: boolean;
  approveDestructive?: boolean;
  expectedApprovalSha256: string;
}

export interface RollbackExecutionArtifact {
  schemaVersion: 1;
  kind: "postgres-migration-rollback";
  projectId: string;
  rollbackId: string;
  sourceExecutionId: string;
  migrationId: string;
  providerId: PostgresMigrationProvider;
  environment: ProviderEnvironment;
  targetLabel: string;
  expectedDatabase: string;
  actualDatabase: string;
  rollbackPath: string;
  rollbackSha256: string;
  status: "success" | "error";
  startedAt: string;
  finishedAt: string;
  commandStatus: number | null;
  diagnostic?: string;
  artifactPath: string;
}

const PROVIDERS = new Set<PostgresMigrationProvider>(["supabase", "neon", "railway", "render", "postgres"]);
const SAFE_ID = /^[a-z0-9][a-z0-9._-]{1,79}$/;
const SAFE_LABEL = /^[A-Za-z0-9][A-Za-z0-9._ -]{0,127}$/;
const SAFE_DATABASE = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/;
const SHA256 = /^[a-f0-9]{64}$/i;
const MAX_SQL_BYTES = 2 * 1024 * 1024;
const MIGRATION_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_DIAGNOSTIC_BYTES = 8_192;

function migrationHome(root: string): string {
  return resolve(projectDirectory(projectIdForRoot(root)), "provider-migrations");
}

function isInside(root: string, candidate: string): boolean {
  const rel = relative(resolve(root), resolve(candidate));
  return rel === "" || (!rel.startsWith("..") && !rel.startsWith("/") && !rel.startsWith("\\"));
}

function safeId(value: string, label: string): string {
  const result = value.trim();
  if (!SAFE_ID.test(result)) throw new Error(`${label} must be 2-80 lowercase letters/numbers/dot/underscore/hyphen.`);
  return result;
}

function safeLabel(value: string, label: string): string {
  const result = value.trim();
  if (!SAFE_LABEL.test(result) || result.includes("..")) throw new Error(`${label} contains unsupported characters.`);
  return result;
}

function safeDatabase(value: string): string {
  const result = value.trim();
  if (!SAFE_DATABASE.test(result) || result.includes("..")) throw new Error("Expected database name contains unsupported characters.");
  return result;
}

function safeProvider(value: string): PostgresMigrationProvider {
  if (!PROVIDERS.has(value as PostgresMigrationProvider)) {
    throw new Error("Postgres migration provider must be supabase, neon, railway, render, or postgres.");
  }
  return value as PostgresMigrationProvider;
}

function safeEnvironment(value: ProviderEnvironment): ProviderEnvironment {
  if (!["local", "preview", "production"].includes(value)) throw new Error("Migration environment must be local, preview, or production.");
  return value;
}

function canonicalSqlForInspection(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\r\n]*/g, " ")
    .replace(/'(?:''|[^'])*'/g, "''")
    .replace(/"(?:""|[^"])*"/g, '""')
    .replace(/\s+/g, " ")
    .trim();
}

export function inspectMigrationSql(sql: string): { risk: MigrationRisk; riskSignals: string[] } {
  const rawLines = sql.split(/\r?\n/);
  if (rawLines.some((line) => /^\s*\\/.test(line))) {
    throw new Error("Migration SQL must not contain psql meta-commands (lines beginning with backslash).");
  }
  const normalized = canonicalSqlForInspection(sql);
  const forbidden: Array<[RegExp, string]> = [
    [/\bALTER\s+SYSTEM\b/i, "ALTER SYSTEM"],
    [/\bCREATE\s+DATABASE\b/i, "CREATE DATABASE"],
    [/\bDROP\s+DATABASE\b/i, "DROP DATABASE"],
    [/\bCREATE\s+(?:ROLE|USER)\b/i, "CREATE ROLE/USER"],
    [/\bALTER\s+(?:ROLE|USER)\b/i, "ALTER ROLE/USER"],
    [/\bDROP\s+(?:ROLE|USER)\b/i, "DROP ROLE/USER"],
    [/\bCOPY\b[\s\S]*?\bPROGRAM\b/i, "COPY PROGRAM"],
    [/\bpg_read_file\s*\(/i, "pg_read_file"],
    [/\bpg_read_binary_file\s*\(/i, "pg_read_binary_file"],
    [/\blo_import\s*\(/i, "lo_import"],
  ];
  for (const [pattern, name] of forbidden) {
    if (pattern.test(normalized)) throw new Error(`Migration SQL contains forbidden server/admin operation: ${name}.`);
  }
  if (/\b(?:BEGIN|COMMIT|ROLLBACK)\b\s*;/i.test(normalized)) {
    throw new Error("Migration SQL must not manage its own transaction; DockyardOS enforces one psql single transaction.");
  }

  const signals: string[] = [];
  const destructive: Array<[RegExp, string]> = [
    [/\bDROP\s+(?:TABLE|SCHEMA|TYPE|VIEW|MATERIALIZED\s+VIEW|INDEX|FUNCTION|TRIGGER|SEQUENCE)\b/i, "DROP object"],
    [/\bTRUNCATE\b/i, "TRUNCATE"],
    [/\bDELETE\s+FROM\b/i, "DELETE FROM"],
    [/\bALTER\s+TABLE\b[\s\S]*?\bDROP\s+(?:COLUMN|CONSTRAINT)\b/i, "ALTER TABLE DROP"],
  ];
  for (const [pattern, label] of destructive) if (pattern.test(normalized)) signals.push(label);
  return { risk: signals.length ? "destructive" : "standard", riskSignals: signals };
}

async function loadSqlArtifact(root: string, inputPath: string, label: string): Promise<SqlArtifactEvidence> {
  const target = resolve(root, inputPath);
  if (!isInside(root, target)) throw new Error(`${label} SQL path must stay inside the current project root.`);
  if (!target.toLowerCase().endsWith(".sql")) throw new Error(`${label} migration file must use the .sql extension.`);
  const info = await lstat(target);
  if (info.isSymbolicLink() || !info.isFile()) throw new Error(`${label} migration file must be a non-symlink regular file.`);
  if (info.size <= 0 || info.size > MAX_SQL_BYTES) throw new Error(`${label} migration file must be 1 byte through 2 MiB.`);
  const bytes = await readFile(target);
  const sql = bytes.toString("utf8");
  if (Buffer.from(sql, "utf8").length !== bytes.length) throw new Error(`${label} migration file must be valid UTF-8 text.`);
  const inspection = inspectMigrationSql(sql);
  return {
    path: target,
    relativePath: relative(resolve(root), target).replace(/\\/g, "/"),
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.length,
    risk: inspection.risk,
    riskSignals: inspection.riskSignals,
  };
}

function combinedRisk(a: MigrationRisk, b: MigrationRisk): MigrationRisk {
  return a === "destructive" || b === "destructive" ? "destructive" : "standard";
}

export async function planPostgresMigration(root: string, input: PostgresMigrationRequest): Promise<PostgresMigrationPlan> {
  const providerId = safeProvider(input.providerId);
  const environment = safeEnvironment(input.environment);
  const migrationId = safeId(input.migrationId, "Migration id");
  const targetLabel = safeLabel(input.targetLabel, "Target label");
  const expectedDatabase = safeDatabase(input.expectedDatabase);
  const forward = await loadSqlArtifact(root, input.forwardPath, "Forward");
  const rollback = await loadSqlArtifact(root, input.rollbackPath, "Rollback");
  if (forward.path === rollback.path) throw new Error("Forward and rollback migration files must be different files.");
  const risk = combinedRisk(forward.risk, rollback.risk);
  return {
    schemaVersion: 1,
    projectId: projectIdForRoot(root),
    createdAt: new Date().toISOString(),
    providerId,
    environment,
    migrationId,
    targetLabel,
    expectedDatabase,
    forward,
    rollback,
    risk,
    mutating: true,
    approvalRequired: true,
    productionApprovalRequired: environment === "production",
    destructiveApprovalRequired: risk === "destructive",
    executor: {
      command: "psql",
      transactionMode: "single-transaction",
      credentialSource: "postgres-environment",
    },
    notes: [
      "Plan is read-only. Run requires explicit approval and the exact forward/rollback SHA-256 values from this plan.",
      "Database credentials are never accepted as DockyardOS CLI parameters; psql uses standard PG* environment variables, PGSERVICE, .pgpass, or equivalent native libpq configuration.",
      "DockyardOS verifies current_database() equals the explicitly reviewed expected database before executing SQL.",
      "Forward SQL runs with --no-psqlrc, ON_ERROR_STOP=1, and --single-transaction so an execution error rolls back the transaction.",
      "A successful migration writes an external immutable-evidence artifact that binds the exact rollback file hash for later rollback planning.",
    ],
  };
}

function requireSha(value: string, label: string): string {
  const result = value.trim().toLowerCase();
  if (!SHA256.test(result)) throw new Error(`${label} must be a 64-character SHA-256 digest from the reviewed plan.`);
  return result;
}

function verifyApprovals(plan: PostgresMigrationPlan, approval: MigrationApproval): void {
  if (approval.approve !== true) throw new Error("Database migration requires explicit --approve.");
  if (plan.productionApprovalRequired && approval.approveProduction !== true) {
    throw new Error("Production database migration requires --approve-production in addition to --approve.");
  }
  if (plan.destructiveApprovalRequired && approval.approveDestructive !== true) {
    throw new Error("Destructive migration signals require --approve-destructive in addition to normal approval.");
  }
  if (requireSha(approval.expectedForwardSha256, "--expected-forward-sha256") !== plan.forward.sha256) {
    throw new Error("Forward migration changed after review; generate a fresh plan.");
  }
  if (requireSha(approval.expectedRollbackSha256, "--expected-rollback-sha256") !== plan.rollback.sha256) {
    throw new Error("Rollback migration changed after review; generate a fresh plan.");
  }
}

function psqlEnvironment(): Record<string, string | undefined> {
  return { PGAPPNAME: "DockyardOS" };
}

function actualDatabase(root: string): string {
  const probe = run("psql", ["--no-psqlrc", "--tuples-only", "--no-align", "--set", "ON_ERROR_STOP=1", "--command", "SELECT current_database();"], {
    cwd: root,
    timeoutMs: 20_000,
    maxOutputBytes: 4_096,
    env: psqlEnvironment(),
  });
  if (!probe.ok) throw new Error(`PostgreSQL target verification failed: ${probe.stderr || probe.stdout || `psql exited with ${probe.status}`}`);
  const lines = probe.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length !== 1 || !SAFE_DATABASE.test(lines[0]!)) throw new Error("PostgreSQL target verification returned an unexpected database identity.");
  return lines[0]!;
}

function diagnostic(result: { stderr: string; stdout: string }): string | undefined {
  const value = result.stderr || result.stdout;
  return value ? Buffer.from(value, "utf8").subarray(0, MAX_DIAGNOSTIC_BYTES).toString("utf8") : undefined;
}

async function revalidatePlanFiles(root: string, plan: PostgresMigrationPlan): Promise<PostgresMigrationPlan> {
  return planPostgresMigration(root, {
    providerId: plan.providerId,
    environment: plan.environment,
    migrationId: plan.migrationId,
    targetLabel: plan.targetLabel,
    expectedDatabase: plan.expectedDatabase,
    forwardPath: plan.forward.path,
    rollbackPath: plan.rollback.path,
  });
}

export async function executePostgresMigration(
  root: string,
  input: PostgresMigrationRequest,
  approval: MigrationApproval,
): Promise<MigrationExecutionArtifact> {
  const reviewed = await planPostgresMigration(root, input);
  verifyApprovals(reviewed, approval);
  if (!commandExists("psql")) throw new Error("PostgreSQL migration execution requires `psql` on PATH.");
  const finalPlan = await revalidatePlanFiles(root, reviewed);
  verifyApprovals(finalPlan, approval);
  const database = actualDatabase(root);
  if (database !== finalPlan.expectedDatabase) {
    throw new Error(`PostgreSQL target mismatch: expected database ${finalPlan.expectedDatabase}, connected to ${database}.`);
  }

  const executionId = randomUUID();
  const startedAt = new Date().toISOString();
  const result = run("psql", [
    "--no-psqlrc",
    "--set", "ON_ERROR_STOP=1",
    "--single-transaction",
    "--file", finalPlan.forward.path,
  ], {
    cwd: root,
    timeoutMs: MIGRATION_TIMEOUT_MS,
    maxOutputBytes: MAX_DIAGNOSTIC_BYTES,
    env: psqlEnvironment(),
  });
  const finishedAt = new Date().toISOString();
  const artifactPath = resolve(migrationHome(root), finalPlan.migrationId, `execution-${executionId}.json`);
  const artifact: MigrationExecutionArtifact = {
    schemaVersion: 1,
    kind: "postgres-migration-execution",
    projectId: finalPlan.projectId,
    executionId,
    migrationId: finalPlan.migrationId,
    providerId: finalPlan.providerId,
    environment: finalPlan.environment,
    targetLabel: finalPlan.targetLabel,
    expectedDatabase: finalPlan.expectedDatabase,
    actualDatabase: database,
    forwardPath: finalPlan.forward.path,
    forwardSha256: finalPlan.forward.sha256,
    rollbackPath: finalPlan.rollback.path,
    rollbackSha256: finalPlan.rollback.sha256,
    forwardRisk: finalPlan.forward.risk,
    rollbackRisk: finalPlan.rollback.risk,
    status: result.ok ? "success" : "error",
    startedAt,
    finishedAt,
    commandStatus: result.status,
    ...(diagnostic(result) ? { diagnostic: diagnostic(result) } : {}),
    artifactPath,
  };
  await writeJsonAtomic(artifactPath, artifact);
  return artifact;
}

async function loadExecutionArtifact(root: string, artifactPath: string): Promise<{ artifact: MigrationExecutionArtifact; bytes: Buffer; target: string }> {
  const target = resolve(artifactPath);
  const home = migrationHome(root);
  if (!isInside(home, target)) throw new Error("Migration execution artifact must be inside the current project's DockyardOS provider-migrations directory.");
  const info = await lstat(target);
  if (info.isSymbolicLink() || !info.isFile()) throw new Error("Migration execution artifact must be a non-symlink regular file.");
  const bytes = await readFile(target);
  if (!bytes.length || bytes.length > 256 * 1024) throw new Error("Migration execution artifact size is invalid.");
  let artifact: MigrationExecutionArtifact;
  try {
    artifact = JSON.parse(bytes.toString("utf8")) as MigrationExecutionArtifact;
  } catch {
    throw new Error("Migration execution artifact is not valid JSON.");
  }
  if (artifact.schemaVersion !== 1 || artifact.kind !== "postgres-migration-execution" || artifact.projectId !== projectIdForRoot(root)) {
    throw new Error("Migration execution artifact does not belong to this DockyardOS project.");
  }
  if (artifact.status !== "success") throw new Error("Only a successful migration execution can be used to plan rollback.");
  if (resolve(artifact.artifactPath) !== target) throw new Error("Migration execution artifact path identity does not match the requested artifact.");
  safeProvider(artifact.providerId);
  safeEnvironment(artifact.environment);
  safeId(artifact.migrationId, "Migration id");
  safeLabel(artifact.targetLabel, "Target label");
  safeDatabase(artifact.expectedDatabase);
  requireSha(artifact.forwardSha256, "Stored forward SHA-256");
  requireSha(artifact.rollbackSha256, "Stored rollback SHA-256");
  return { artifact, bytes, target };
}

function rollbackApprovalDigest(input: {
  executionArtifactSha256: string;
  executionId: string;
  migrationId: string;
  providerId: string;
  environment: string;
  targetLabel: string;
  expectedDatabase: string;
  rollbackSha256: string;
}): string {
  const canonical = JSON.stringify({
    executionArtifactSha256: input.executionArtifactSha256,
    executionId: input.executionId,
    migrationId: input.migrationId,
    providerId: input.providerId,
    environment: input.environment,
    targetLabel: input.targetLabel,
    expectedDatabase: input.expectedDatabase,
    rollbackSha256: input.rollbackSha256,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

export async function planPostgresRollback(root: string, artifactPath: string): Promise<RollbackPlan> {
  const loaded = await loadExecutionArtifact(root, artifactPath);
  const rollback = await loadSqlArtifact(root, loaded.artifact.rollbackPath, "Rollback");
  if (rollback.sha256 !== loaded.artifact.rollbackSha256) {
    throw new Error("Rollback SQL changed after the successful migration; rollback requires independent review and a new controlled recovery path.");
  }
  const executionArtifactSha256 = createHash("sha256").update(loaded.bytes).digest("hex");
  const approvalSha256 = rollbackApprovalDigest({
    executionArtifactSha256,
    executionId: loaded.artifact.executionId,
    migrationId: loaded.artifact.migrationId,
    providerId: loaded.artifact.providerId,
    environment: loaded.artifact.environment,
    targetLabel: loaded.artifact.targetLabel,
    expectedDatabase: loaded.artifact.expectedDatabase,
    rollbackSha256: rollback.sha256,
  });
  return {
    schemaVersion: 1,
    projectId: loaded.artifact.projectId,
    createdAt: new Date().toISOString(),
    executionArtifactPath: loaded.target,
    executionArtifactSha256,
    executionId: loaded.artifact.executionId,
    migrationId: loaded.artifact.migrationId,
    providerId: loaded.artifact.providerId,
    environment: loaded.artifact.environment,
    targetLabel: loaded.artifact.targetLabel,
    expectedDatabase: loaded.artifact.expectedDatabase,
    rollback,
    approvalSha256,
    mutating: true,
    approvalRequired: true,
    productionApprovalRequired: loaded.artifact.environment === "production",
    destructiveApprovalRequired: rollback.risk === "destructive",
    notes: [
      "Rollback requires explicit approval bound to this successful execution artifact and the exact unchanged rollback SQL SHA-256.",
      "Rollback reconnects using native PostgreSQL PG*/PGSERVICE credentials and re-verifies current_database() before executing.",
      "Rollback is executed as one psql single transaction with ON_ERROR_STOP=1.",
    ],
  };
}

export async function executePostgresRollback(root: string, artifactPath: string, approval: RollbackApproval): Promise<RollbackExecutionArtifact> {
  const plan = await planPostgresRollback(root, artifactPath);
  if (approval.approve !== true) throw new Error("Database rollback requires explicit --approve.");
  if (plan.productionApprovalRequired && approval.approveProduction !== true) {
    throw new Error("Production database rollback requires --approve-production in addition to --approve.");
  }
  if (plan.destructiveApprovalRequired && approval.approveDestructive !== true) {
    throw new Error("Destructive rollback signals require --approve-destructive in addition to normal approval.");
  }
  const expected = requireSha(approval.expectedApprovalSha256, "--expected-approval-sha256");
  if (expected !== plan.approvalSha256) throw new Error("Rollback approval digest does not match the reviewed rollback plan.");
  if (!commandExists("psql")) throw new Error("PostgreSQL rollback execution requires `psql` on PATH.");

  const fresh = await planPostgresRollback(root, artifactPath);
  if (fresh.approvalSha256 !== expected) throw new Error("Rollback evidence changed after review; generate a fresh rollback plan.");
  const database = actualDatabase(root);
  if (database !== fresh.expectedDatabase) {
    throw new Error(`PostgreSQL rollback target mismatch: expected database ${fresh.expectedDatabase}, connected to ${database}.`);
  }
  const rollbackId = randomUUID();
  const startedAt = new Date().toISOString();
  const result = run("psql", [
    "--no-psqlrc",
    "--set", "ON_ERROR_STOP=1",
    "--single-transaction",
    "--file", fresh.rollback.path,
  ], {
    cwd: root,
    timeoutMs: MIGRATION_TIMEOUT_MS,
    maxOutputBytes: MAX_DIAGNOSTIC_BYTES,
    env: psqlEnvironment(),
  });
  const finishedAt = new Date().toISOString();
  const artifactPathOut = resolve(migrationHome(root), fresh.migrationId, `rollback-${rollbackId}.json`);
  const artifact: RollbackExecutionArtifact = {
    schemaVersion: 1,
    kind: "postgres-migration-rollback",
    projectId: fresh.projectId,
    rollbackId,
    sourceExecutionId: fresh.executionId,
    migrationId: fresh.migrationId,
    providerId: fresh.providerId,
    environment: fresh.environment,
    targetLabel: fresh.targetLabel,
    expectedDatabase: fresh.expectedDatabase,
    actualDatabase: database,
    rollbackPath: fresh.rollback.path,
    rollbackSha256: fresh.rollback.sha256,
    status: result.ok ? "success" : "error",
    startedAt,
    finishedAt,
    commandStatus: result.status,
    ...(diagnostic(result) ? { diagnostic: diagnostic(result) } : {}),
    artifactPath: artifactPathOut,
  };
  await writeJsonAtomic(artifactPathOut, artifact);
  return artifact;
}

export function providerMigrationStateRoot(root: string): string {
  return migrationHome(root);
}
