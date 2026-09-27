import { createHash } from "node:crypto";
import { resolve } from "node:path";
import type { TransparencyRecord } from "./community-types.js";
import { readJson, writeJsonAtomic } from "./fs-utils.js";
import { dockyardHome } from "./project.js";

interface TransparencyLog {
  schemaVersion: 1;
  records: TransparencyRecord[];
}

function logPath(): string {
  return resolve(dockyardHome(), "community", "transparency.json");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashRecord(input: Omit<TransparencyRecord, "recordHash">): string {
  return createHash("sha256").update(stableJson(input)).digest("hex");
}

export async function readTransparencyLog(): Promise<TransparencyLog> {
  return (await readJson<TransparencyLog>(logPath())) ?? { schemaVersion: 1, records: [] };
}

export async function appendTransparencyRecord(input: {
  action: TransparencyRecord["action"];
  packageId: string;
  revision?: string;
  contentSha256?: string;
  detail: string;
}): Promise<TransparencyRecord> {
  const log = await readTransparencyLog();
  const previousHash = log.records.at(-1)?.recordHash ?? "0".repeat(64);
  const base: Omit<TransparencyRecord, "recordHash"> = {
    schemaVersion: 1,
    sequence: log.records.length + 1,
    timestamp: new Date().toISOString(),
    action: input.action,
    packageId: input.packageId,
    ...(input.revision ? { revision: input.revision } : {}),
    ...(input.contentSha256 ? { contentSha256: input.contentSha256 } : {}),
    previousHash,
    detail: input.detail,
  };
  const record: TransparencyRecord = { ...base, recordHash: hashRecord(base) };
  log.records.push(record);
  await writeJsonAtomic(logPath(), log);
  return record;
}

export async function verifyTransparencyLog(): Promise<{ ok: boolean; records: number; errors: string[]; head?: string }> {
  const log = await readTransparencyLog();
  const errors: string[] = [];
  let previousHash = "0".repeat(64);
  for (let index = 0; index < log.records.length; index += 1) {
    const record = log.records[index]!;
    if (record.sequence !== index + 1) errors.push(`record ${index + 1}: unexpected sequence ${record.sequence}`);
    if (record.previousHash !== previousHash) errors.push(`record ${record.sequence}: previousHash mismatch`);
    const { recordHash, ...base } = record;
    const expected = hashRecord(base);
    if (recordHash !== expected) errors.push(`record ${record.sequence}: recordHash mismatch`);
    previousHash = recordHash;
  }
  return {
    ok: errors.length === 0,
    records: log.records.length,
    errors,
    ...(log.records.length ? { head: log.records.at(-1)!.recordHash } : {}),
  };
}
