import assert from "node:assert/strict";
import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const dockyard = await import("../dist/index.js");

function input(indexPath) {
  return {
    indexPath,
    registryId: "dockyard-community",
    keyId: "dockyard-community-key-1",
    sequence: 7,
    expiresAt: "2026-10-05T00:00:00.000Z",
    repository: "cassielxyz/registry-test",
    targetPath: "registry/community.json",
    branch: "registry",
    reviewedBy: "maintainer-1",
    rationale: "Reviewed publication fixture for realpath confinement regression coverage.",
    reviewedAt: "2026-09-28T00:00:00.000Z",
  };
}

function validIndex() {
  return {
    schemaVersion: 1,
    updatedAt: "2026-09-28T00:00:00.000Z",
    packages: [],
    discoverySources: [],
  };
}

test("P19 rejects review indexes reached through a parent-directory symlink escape", async (t) => {
  if (process.platform === "win32") {
    t.skip("directory symlink creation may require elevated privileges on Windows");
    return;
  }

  const home = await mkdtemp(join(tmpdir(), "dockyard-p19-confinement-home-"));
  const root = await mkdtemp(join(tmpdir(), "dockyard-p19-confinement-root-"));
  const outside = await mkdtemp(join(tmpdir(), "dockyard-p19-confinement-outside-"));
  process.env.DOCKYARD_HOME = home;

  const queue = join(root, "registry", "remote-publications");
  await mkdir(queue, { recursive: true });
  await writeFile(join(outside, "reviewed-index.json"), `${JSON.stringify(validIndex(), null, 2)}\n`);
  await symlink(outside, join(queue, "linked"), "dir");

  let ghCalls = 0;
  await assert.rejects(
    () => dockyard.planRegistryPublication(
      root,
      input("registry/remote-publications/linked/reviewed-index.json"),
      { ghExec: () => { ghCalls += 1; throw new Error("gh must not run"); } },
    ),
    /resolves outside registry\/remote-publications/i,
  );
  assert.equal(ghCalls, 0);
});

test("P19 rejects trust stores reached through a parent-directory symlink escape", async (t) => {
  if (process.platform === "win32") {
    t.skip("directory symlink creation may require elevated privileges on Windows");
    return;
  }

  const home = await mkdtemp(join(tmpdir(), "dockyard-p19-trust-home-"));
  const root = await mkdtemp(join(tmpdir(), "dockyard-p19-trust-root-"));
  const outside = await mkdtemp(join(tmpdir(), "dockyard-p19-trust-outside-"));
  process.env.DOCKYARD_HOME = home;

  const registry = join(root, "registry");
  const queue = join(registry, "remote-publications");
  await mkdir(queue, { recursive: true });
  await writeFile(join(queue, "reviewed-index.json"), `${JSON.stringify(validIndex(), null, 2)}\n`);
  await writeFile(join(outside, "registry-keys.json"), "{}\n");
  await symlink(outside, join(registry, "linked"), "dir");

  let ghCalls = 0;
  await assert.rejects(
    () => dockyard.planRegistryPublication(
      root,
      input("registry/remote-publications/reviewed-index.json"),
      {
        trustStorePath: "registry/linked/registry-keys.json",
        ghExec: () => { ghCalls += 1; throw new Error("gh must not run"); },
      },
    ),
    /trust store resolves outside the repository registry directory/i,
  );
  assert.equal(ghCalls, 0);
});
