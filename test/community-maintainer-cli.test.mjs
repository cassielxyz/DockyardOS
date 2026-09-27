import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const main = resolve("dist/main.js");

function run(cwd, args) {
  return spawnSync(process.execPath, [main, ...args], { cwd, encoding: "utf8" });
}

async function setupRepository() {
  const root = await mkdtemp(join(tmpdir(), "dockyard-maintainer-cli-"));
  await mkdir(join(root, "registry", "publisher-proposals"), { recursive: true });
  await writeFile(join(root, "package.json"), `${JSON.stringify({ name: "dockyardos", version: "test" }, null, 2)}\n`);
  await writeFile(join(root, "registry", "publishers.json"), `${JSON.stringify({ schemaVersion: 1, updatedAt: "2026-09-27T00:00:00.000Z", keys: [] }, null, 2)}\n`);
  await writeFile(join(root, "registry", "community.json"), `${JSON.stringify({ schemaVersion: 1, updatedAt: "2026-09-27T00:00:00.000Z", packages: [], discoverySources: [] }, null, 2)}\n`);
  const { publicKey } = generateKeyPairSync("ed25519");
  const proposal = {
    schemaVersion: 1,
    id: "cli-key-1",
    publisherId: "cli-publisher",
    algorithm: "ed25519",
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    createdAt: "2026-09-27T12:00:00.000Z",
  };
  await writeFile(join(root, "registry", "publisher-proposals", "cli-key.json"), `${JSON.stringify(proposal, null, 2)}\n`);
  return root;
}

const reviewArgs = [
  "--reviewed-by", "ci-maintainer",
  "--rationale", "Independent publisher identity and public key ownership review completed.",
];

test("maintainer publisher plan is non-mutating and exact approved apply changes only canonical trust file", async () => {
  const root = await setupRepository();
  const command = [
    "community", "maintainer", "publisher", "onboard",
    "--proposal", "registry/publisher-proposals/cli-key.json",
    ...reviewArgs,
  ];

  const planned = run(root, command);
  assert.equal(planned.status, 0, planned.stderr);
  const planOutput = JSON.parse(planned.stdout);
  assert.equal(planOutput.applied, false);
  assert.equal(planOutput.plan.operation, "publisher-onboard");
  const untouched = JSON.parse(await readFile(join(root, "registry", "publishers.json"), "utf8"));
  assert.equal(untouched.keys.length, 0);

  const missingApproval = run(root, [...command, "--apply", "--expected-sha256", planOutput.plan.beforeSha256]);
  assert.notEqual(missingApproval.status, 0);
  assert.match(missingApproval.stderr, /approval flag/i);
  const stillUntouched = JSON.parse(await readFile(join(root, "registry", "publishers.json"), "utf8"));
  assert.equal(stillUntouched.keys.length, 0);

  const applied = run(root, [
    ...command,
    "--apply",
    "--expected-sha256", planOutput.plan.beforeSha256,
    "--approve-trust-change",
  ]);
  assert.equal(applied.status, 0, applied.stderr);
  const appliedOutput = JSON.parse(applied.stdout);
  assert.equal(appliedOutput.applied, true);
  const trusted = JSON.parse(await readFile(join(root, "registry", "publishers.json"), "utf8"));
  assert.deepEqual(trusted.keys.map((key) => key.id), ["cli-key-1"]);
});

test("maintainer command refuses alternate trust file targets", async () => {
  const root = await setupRepository();
  const result = run(root, [
    "community", "maintainer", "publisher", "onboard",
    "--proposal", "registry/publisher-proposals/cli-key.json",
    "--publishers-file", "registry/other.json",
    ...reviewArgs,
  ]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must be exactly registry\/publishers\.json/i);
});
