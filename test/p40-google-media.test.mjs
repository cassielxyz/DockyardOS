import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const dockyard = await import("../dist/index.js");
const require = createRequire(import.meta.url);
const { normalizeConnections, providerDefinition } = require("../integrations/vscode/connections-model.js");

test("P40 Google AI adapter uses secure in-memory credential verification", async () => {
  const adapter = dockyard.providerAdapter("google-ai");
  assert.ok(adapter);
  assert.deepEqual(adapter.cliCommands, []);
  assert.deepEqual(adapter.secureCredentialProbe.envVars, ["GEMINI_API_KEY", "GOOGLE_API_KEY"]);
  assert.equal(adapter.secureCredentialProbe.header, "x-goog-api-key");
  assert.match(adapter.secureCredentialProbe.validationUrl, /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models$/);

  const root = await mkdtemp(join(tmpdir(), "dockyard-google-ai-"));
  const prior = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "AIzaTEST_DO_NOT_LOG_abcdefghijklmnopqrstuvwxyz";
  try {
    const local = await dockyard.probeProvider(adapter, root, { live: false });
    assert.equal(local.configured, true);
    assert.equal(local.readiness, "configured");
    assert.equal(local.authenticated, undefined);
    assert.doesNotMatch(JSON.stringify(local), /AIzaTEST_DO_NOT_LOG/);

    let observedHeader = "";
    const live = await dockyard.probeProvider(adapter, root, {
      live: true,
      httpFetch: async (url, init) => {
        assert.equal(url, adapter.secureCredentialProbe.validationUrl);
        observedHeader = init.headers["x-goog-api-key"];
        return { ok: true, status: 200 };
      },
    });
    assert.equal(observedHeader, process.env.GEMINI_API_KEY);
    assert.equal(live.authenticated, true);
    assert.equal(live.readiness, "authenticated");
    assert.doesNotMatch(JSON.stringify(live), /AIzaTEST_DO_NOT_LOG/);
  } finally {
    if (prior === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = prior;
  }
});

test("P40 failed Google AI live verification remains configured but not authenticated", async () => {
  const adapter = dockyard.providerAdapter("google-ai");
  const root = await mkdtemp(join(tmpdir(), "dockyard-google-ai-fail-"));
  const prior = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "AIzaTEST_INVALID_abcdefghijklmnopqrstuvwxyz";
  try {
    const probe = await dockyard.probeProvider(adapter, root, {
      live: true,
      httpFetch: async () => ({ ok: false, status: 401 }),
    });
    assert.equal(probe.configured, true);
    assert.equal(probe.authenticated, false);
    assert.equal(probe.readiness, "configured");
    assert.ok(probe.signals.some((signal) => signal.type === "auth" && /HTTP 401/.test(signal.detail)));
    assert.doesNotMatch(JSON.stringify(probe), /AIzaTEST_INVALID/);
  } finally {
    if (prior === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = prior;
  }
});

test("P40 Veo generation plan is deterministic, billable, exact-hash bound, and plan-only", async () => {
  const root = await mkdtemp(join(tmpdir(), "dockyard-media-plan-"));
  const request = {
    prompt: "A cinematic motorcycle reveal in a dark studio, slow camera arc.",
    priority: "quality",
    resolution: "1080p",
    aspectRatio: "16:9",
    durationSeconds: 8,
  };
  const first = dockyard.planMediaGeneration(root, request);
  const second = dockyard.planMediaGeneration(root, request);

  assert.equal(first.providerId, "google-ai");
  assert.equal(first.actionId, "veo-generate-video");
  assert.equal(first.billable, true);
  assert.equal(first.approvalRequired, true);
  assert.equal(first.executionEnabled, false);
  assert.equal(first.modelId, "veo-3.1-generate-preview");
  assert.equal(first.request.durationSeconds, 8);
  assert.match(first.request.promptSha256, /^[a-f0-9]{64}$/);
  assert.match(first.requestBodySha256, /^[a-f0-9]{64}$/);
  assert.match(first.approvalSha256, /^[a-f0-9]{64}$/);
  assert.equal(first.approvalSha256, second.approvalSha256);
  assert.equal(first.credential.persistedByDockyardCore, false);
  assert.equal(first.pricing.status, "live-review-required");

  assert.throws(
    () => dockyard.assertMediaGenerationApproval(first, {}),
    /approve-billable/i,
  );
  assert.throws(
    () => dockyard.assertMediaGenerationApproval(first, { approveBillable: true, expectedPlanSha256: "0".repeat(64) }),
    /expected-plan-sha256/i,
  );
  assert.throws(
    () => dockyard.assertMediaGenerationApproval(first, { approveBillable: true, expectedPlanSha256: first.approvalSha256 }),
    /execution is not enabled/i,
  );
});

test("P40 Veo planner enforces current duration/resolution constraints", async () => {
  const root = await mkdtemp(join(tmpdir(), "dockyard-media-constraints-"));
  assert.throws(
    () => dockyard.planMediaGeneration(root, {
      prompt: "A product shot.",
      resolution: "1080p",
      durationSeconds: 6,
    }),
    /1080p.*8-second/i,
  );
  const plan = dockyard.planMediaGeneration(root, {
    prompt: "A portrait cinematic product reveal.",
    resolution: "720p",
    durationSeconds: 4,
    aspectRatio: "9:16",
    priority: "speed",
  });
  assert.equal(plan.request.durationSeconds, 4);
  assert.equal(plan.request.aspectRatio, "9:16");
  assert.equal(plan.modelId, "veo-3.1-fast-generate-preview");
});

test("P40 durable evidence template contains hashes and no prompt or credential", async () => {
  const root = await mkdtemp(join(tmpdir(), "dockyard-media-evidence-"));
  const prompt = "Private storyboard text that should not enter durable evidence.";
  const plan = dockyard.planMediaGeneration(root, { prompt });
  const evidence = dockyard.mediaGenerationEvidenceTemplate(plan);
  const serialized = JSON.stringify(evidence);
  assert.match(serialized, /promptSha256/);
  assert.doesNotMatch(serialized, /Private storyboard/);
  assert.doesNotMatch(serialized, /GEMINI_API_KEY|GOOGLE_API_KEY|x-goog-api-key/);
  assert.equal(evidence.credentialStored, false);
  assert.equal(evidence.status, "planned");
});

test("P40 Connections exposes Google AI as SecretStorage-backed without sending secrets to webview", async () => {
  const definition = providerDefinition("google-ai");
  assert.equal(definition.secretInput, true);
  assert.equal(definition.secretStorageKey, "dockyardOS.provider.google-ai.apiKey");
  assert.equal(definition.secretEnvVar, "GEMINI_API_KEY");

  const model = normalizeConnections([{
    providerId: "google-ai",
    displayName: "Google AI / Gemini API",
    readiness: "authenticated",
    installed: false,
    configured: true,
    authenticated: true,
    liveChecked: true,
    signals: [{ type: "auth", ok: true, detail: "Read-only API authentication probe succeeded." }],
  }], { liveChecked: true });
  const google = model.providers.find((provider) => provider.id === "google-ai");
  assert.equal(google.status.state, "authenticated");
  assert.equal(google.connectionKind, "secret-storage");
  assert.equal(google.canForgetSecret, true);
  assert.equal(google.canConnect, true);

  const controller = await readFile(new URL("../integrations/vscode/connections-controller.js", import.meta.url), "utf8");
  assert.match(controller, /context\.secrets\.store/);
  assert.match(controller, /context\.secrets\.delete/);
  assert.match(controller, /password:\s*true/);
  assert.match(controller, /providerSecretEnvironment/);
  assert.match(controller, /env:\s*\{\s*\.\.\.process\.env/);
  assert.doesNotMatch(controller, /message\.(?:secret|apiKey|token|credential)/);
  assert.doesNotMatch(controller, /shell\s*:\s*true/);
});

test("P40 process redaction catches standalone Google API-key shaped values", () => {
  const key = "AIzaSyDUMMY0123456789abcdefghijklmnopqrstuvwxyz";
  const redacted = dockyard.redactSensitiveOutput(`provider response included ${key}`);
  assert.equal(redacted.includes(key), false);
  assert.match(redacted, /\[REDACTED\]/);
});
