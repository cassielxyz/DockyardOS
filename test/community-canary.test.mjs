import assert from "node:assert/strict";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const home = await mkdtemp(join(tmpdir(), "dockyard-p7-canary-"));
process.env.DOCKYARD_HOME = home;
const dockyard = await import("../dist/index.js");
const packagePath = resolve(home, "community", "quarantine", "canary-test", "0123456789abcdef0123456789abcdef01234567");
await mkdir(packagePath, { recursive: true });
const pinnedImage = `dockyardos/canary@sha256:${"a".repeat(64)}`;

test("community canary plan enforces a hardened no-network read-only container", () => {
  const plan = dockyard.planCommunityCanary({
    packageId: "canary-test",
    packagePath,
    image: pinnedImage,
    command: "node",
    args: ["./smoke.mjs"],
    backend: "docker",
    timeoutSeconds: 30,
  });
  const joined = plan.runnerArgs.join(" ");
  for (const expected of ["--pull=never", "--network=none", "--read-only", "--cap-drop=ALL", "no-new-privileges", "--pids-limit=128", "--memory=256m", "--cpus=1", "readonly"]) {
    assert.ok(joined.includes(expected), `missing sandbox control ${expected}`);
  }
  assert.equal(plan.image, pinnedImage);
  assert.equal(plan.command, "node");
});

test("community canary refuses floating images and paths outside quarantine", () => {
  assert.throws(() => dockyard.planCommunityCanary({
    packageId: "canary-test",
    packagePath,
    image: "node:22-alpine",
    command: "node",
    backend: "docker",
  }), /digest-pinned/i);

  assert.throws(() => dockyard.planCommunityCanary({
    packageId: "canary-test",
    packagePath: resolve(home, "outside"),
    image: pinnedImage,
    command: "node",
    backend: "docker",
  }), /quarantine/i);
});

test("community canary execution never falls back to direct host execution", async () => {
  const plan = dockyard.planCommunityCanary({
    packageId: "canary-test",
    packagePath,
    image: `dockyardos/nonexistent-canary@sha256:${"b".repeat(64)}`,
    command: "node",
    args: ["./smoke.mjs"],
    backend: "docker",
    timeoutSeconds: 5,
  });
  const result = await dockyard.executeCommunityCanary(plan);
  assert.equal(result.status, "unavailable");
  assert.notEqual(result.status, "pass");
  assert.ok(/unavailable|not already available/i.test(result.summary));
});
