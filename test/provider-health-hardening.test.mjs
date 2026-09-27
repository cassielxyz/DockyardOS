import assert from "node:assert/strict";
import test from "node:test";

const dockyard = await import("../dist/index.js");
const { handleProviderActionCommand } = await import("../dist/provider-command.js");

function definition(id = "github") {
  const found = dockyard.providerHealthDefinitions.find((item) => item.providerId === id);
  assert.ok(found, `missing health definition: ${id}`);
  return found;
}

test("provider health enforces the streamed 512 KiB response bound without Content-Length", async () => {
  const def = definition();
  const oversizedBody = new Uint8Array((512 * 1024) + 1);
  const result = await dockyard.checkProviderHealth(def, {
    fetchImpl: async () => new Response(oversizedBody, { status: 200 }),
  });
  assert.equal(result.health, "unavailable");
  assert.match(result.error, /512 KiB/i);
});

test("provider health CLI rejects timeout values outside the documented bounded range before network access", async () => {
  await assert.rejects(
    () => handleProviderActionCommand(process.cwd(), ["health", "--timeout-ms", "999"]),
    /integer from 1000 through 15000/i,
  );
  await assert.rejects(
    () => handleProviderActionCommand(process.cwd(), ["health", "--timeout-ms", "15001"]),
    /integer from 1000 through 15000/i,
  );
  await assert.rejects(
    () => handleProviderActionCommand(process.cwd(), ["health", "--timeout-ms", "1.5"]),
    /integer from 1000 through 15000/i,
  );
});
