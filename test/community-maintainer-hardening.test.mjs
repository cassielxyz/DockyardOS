import assert from "node:assert/strict";
import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const { handleCommunityMaintainerCommand } = await import("../dist/community-maintainer-command.js");

test("P14 rejects a symlink canonical publisher trust registry before planning or applying", async (t) => {
  if (process.platform === "win32") {
    t.skip("symlink creation may require elevated privileges on Windows");
    return;
  }
  const root = await mkdtemp(join(tmpdir(), "dockyard-maintainer-hardening-"));
  const registry = join(root, "registry");
  await mkdir(registry, { recursive: true });
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "dockyardos" }));
  const outside = join(root, "outside-publishers.json");
  await writeFile(outside, JSON.stringify({ schemaVersion: 1, updatedAt: "2026-09-28T00:00:00.000Z", keys: [] }));
  await symlink(outside, join(registry, "publishers.json"));

  await assert.rejects(
    () => handleCommunityMaintainerCommand(root, [
      "publisher", "revoke",
      "--key-id", "missing-key",
      "--reviewed-by", "maintainer",
      "--rationale", "Verify canonical target confinement.",
    ]),
    /regular non-symlink file/i,
  );
});
