import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

process.env.DOCKYARD_HOME = await mkdtemp(join(tmpdir(), "dockyard-community-runtime-home-"));
const dockyard = await import("../dist/index.js");

test("active community runtime exposes only declared verified entrypoints", async () => {
  const registry = await dockyard.loadCommunityRegistry();
  const manifest = registry.packages.find((pkg) => pkg.id === "superpowers-core-skills");
  assert.ok(manifest);
  const revision = "f".repeat(40);
  const quarantineBase = join(process.env.DOCKYARD_HOME, "community", "quarantine", manifest.id);
  await mkdir(quarantineBase, { recursive: true });
  const quarantine = await mkdtemp(join(quarantineBase, "runtime-"));
  const packageRoot = join(quarantine, "skills");

  for (const entrypoint of manifest.entrypoints) {
    const directory = join(packageRoot, ...entrypoint.path.split("/").slice(0, -1));
    await mkdir(directory, { recursive: true });
    await writeFile(join(packageRoot, entrypoint.path), `---\nname: ${entrypoint.path.split("/")[0]}\ndescription: runtime fixture\n---\nUse this fixture safely.\n`, "utf8");
  }
  await writeFile(join(packageRoot, "UNDECLARED.md"), "should not be exposed\n", "utf8");

  const digest = await dockyard.communityTreeSha256(packageRoot, { maxFiles: manifest.maxFiles, maxBytes: manifest.maxBytes });
  const scan = {
    packageId: manifest.id,
    revision,
    files: manifest.entrypoints.length + 1,
    bytes: 256,
    executableFiles: [],
    scriptFiles: [],
    entrypointsPresent: manifest.entrypoints.map((entrypoint) => entrypoint.path),
    entrypointsMissing: [],
    findings: [],
    inferredPermissions: ["filesystem-read", "shell"],
    canary: { status: "pass", checks: [{ name: "entrypoints", status: "pass", detail: "ok" }] },
  };
  const resolved = {
    packageId: manifest.id,
    repository: manifest.source.repository,
    requestedRef: manifest.source.ref,
    revision,
    resolvedAt: new Date().toISOString(),
    quarantinePath: quarantine,
    contentSha256: digest,
    files: scan.files,
    bytes: scan.bytes,
  };
  const assessment = await dockyard.assessCommunityPackage(manifest, resolved, scan);
  assert.equal(assessment.decision, "approval-required");
  await dockyard.installResolvedCommunityPackage(manifest, resolved, assessment, { approve: true });

  const active = await dockyard.activeCommunityPackages();
  assert.equal(active.length, 1);
  assert.equal(active[0].id, manifest.id);
  assert.equal(active[0].integrity, "verified");

  const declared = manifest.entrypoints[0].path;
  const entrypoint = await dockyard.readActiveCommunityEntrypoint(manifest.id, declared);
  assert.equal(entrypoint.entrypoint, declared);
  assert.match(entrypoint.content, /runtime fixture/);

  await assert.rejects(
    () => dockyard.readActiveCommunityEntrypoint(manifest.id, "UNDECLARED.md"),
    /not a declared entrypoint/,
  );
});
