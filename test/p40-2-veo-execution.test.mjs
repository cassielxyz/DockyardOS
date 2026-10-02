import assert from "node:assert/strict";
import { access, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

process.env.DOCKYARD_HOME = await mkdtemp(join(tmpdir(), "dockyard-p40-2-home-"));
const dockyard = await import("../dist/index.js");

const pricingHtml = `
<html><body>
<h2>Veo 3.1</h2>
Free Tier Not available
veo-3.1-generate-preview
Veo 3.1 Standard video with audio price (default) $0.40 (720p and 1080p) $0.60 (4k)
veo-3.1-fast-generate-preview
Veo 3.1 Fast video with audio price (default) $0.10 (720p) $0.12 (1080p) $0.30 (4k)
veo-3.1-lite-generate-preview
Veo 3.1 Lite video with audio price (default) $0.05 (720p) $0.08 (1080p) (4k output not supported)
<h2>Lyria 3</h2>
</body></html>`;

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function pricingResponse(html = pricingHtml) {
  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function requestOf(input, init) {
  return {
    url: typeof input === "string" ? input : input.toString(),
    method: init?.method || "GET",
    headers: new Headers(init?.headers || {}),
    body: init?.body,
  };
}

test("P40.2 live pricing verifier confirms current paid Veo rate without credentials", async () => {
  let seenKey = false;
  const evidence = await dockyard.verifyCurrentVeoPricing({
    modelId: "veo-3.1-generate-preview",
    resolution: "1080p",
    durationSeconds: 8,
  }, {
    fetchImpl: async (input, init) => {
      const req = requestOf(input, init);
      seenKey ||= req.headers.has("x-goog-api-key");
      assert.equal(req.url, dockyard.VEO_PRICING_URL);
      return pricingResponse();
    },
    now: new Date("2026-10-02T12:00:00Z"),
  });
  assert.equal(seenKey, false);
  assert.equal(evidence.freeTierAvailable, false);
  assert.equal(evidence.rateUsdPerSecond, 0.40);
  assert.equal(evidence.estimatedMaxUsd, 3.2);
  assert.match(evidence.sourceSha256, /^[a-f0-9]{64}$/);
});

test("P40.2 exact plan hash binds expected rate and estimated maximum cost", async () => {
  const root = await mkdtemp(join(tmpdir(), "dockyard-p40-2-plan-"));
  const standard = dockyard.planMediaGeneration(root, {
    prompt: "Cinematic bike reveal",
    priority: "quality",
    resolution: "1080p",
    durationSeconds: 8,
  });
  const fast = dockyard.planMediaGeneration(root, {
    prompt: "Cinematic bike reveal",
    priority: "speed",
    resolution: "1080p",
    durationSeconds: 8,
  });
  assert.equal(standard.pricing.expectedRateUsdPerSecond, 0.40);
  assert.equal(standard.pricing.estimatedMaxUsd, 3.2);
  assert.equal(fast.pricing.expectedRateUsdPerSecond, 0.12);
  assert.equal(fast.pricing.estimatedMaxUsd, 0.96);
  assert.notEqual(standard.approvalSha256, fast.approvalSha256);
});

test("P40.2 mocked Veo run rechecks auth/pricing, polls, downloads, hashes, and writes non-secret evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "dockyard-p40-2-run-"));
  await dockyard.initProject(root, { name: "media-fixture", mode: "balanced" });
  const request = {
    prompt: "A premium cinematic motorcycle reveal with a slow studio camera arc.",
    priority: "quality",
    resolution: "1080p",
    aspectRatio: "16:9",
    durationSeconds: 8,
  };
  const plan = dockyard.planMediaGeneration(root, request);
  const prior = process.env.GEMINI_API_KEY;
  const secret = "AIzaMOCK_ONLY_NEVER_PERSIST_abcdefghijklmnopqrstuvwxyz";
  process.env.GEMINI_API_KEY = secret;
  const calls = [];
  let poll = 0;
  const videoBytes = new TextEncoder().encode("mock-mp4-bytes-for-dockyard");

  try {
    const result = await dockyard.executeMediaGeneration(root, request, {
      approveBillable: true,
      expectedPlanSha256: plan.approvalSha256,
    }, {
      sleep: async () => undefined,
      now: () => new Date("2026-10-02T12:00:00Z"),
      fetchImpl: async (input, init) => {
        const req = requestOf(input, init);
        calls.push(req);
        if (req.url === "https://generativelanguage.googleapis.com/v1beta/models" && req.method === "GET") {
          assert.equal(req.headers.get("x-goog-api-key"), secret);
          return jsonResponse({ models: [] });
        }
        if (req.url === dockyard.VEO_PRICING_URL) {
          assert.equal(req.headers.has("x-goog-api-key"), false);
          return pricingResponse();
        }
        if (req.url === plan.endpoint && req.method === "POST") {
          assert.equal(req.headers.get("x-goog-api-key"), secret);
          const body = JSON.parse(String(req.body));
          assert.equal(body.instances[0].prompt, request.prompt);
          assert.equal(body.parameters.numberOfVideos, 1);
          return jsonResponse({ name: "models/veo-3.1-generate-preview/operations/op123" });
        }
        if (req.url.endsWith("/models/veo-3.1-generate-preview/operations/op123")) {
          poll += 1;
          assert.equal(req.headers.get("x-goog-api-key"), secret);
          if (poll === 1) return jsonResponse({ name: "models/veo-3.1-generate-preview/operations/op123", done: false });
          return jsonResponse({
            name: "models/veo-3.1-generate-preview/operations/op123",
            done: true,
            response: {
              generateVideoResponse: {
                generatedSamples: [{
                  video: { uri: "https://generativelanguage.googleapis.com/v1beta/files/video123:download?alt=media" },
                }],
              },
            },
          });
        }
        if (req.url.startsWith("https://generativelanguage.googleapis.com/v1beta/files/video123:download")) {
          assert.equal(req.headers.get("x-goog-api-key"), secret);
          return new Response(null, {
            status: 302,
            headers: { location: "https://storage.googleapis.com/dockyard-mock/video123.mp4?signature=mock" },
          });
        }
        if (req.url.startsWith("https://storage.googleapis.com/dockyard-mock/video123.mp4")) {
          assert.equal(req.headers.has("x-goog-api-key"), false, "API key must not leak to storage redirect hosts");
          return new Response(videoBytes, {
            status: 200,
            headers: { "content-type": "video/mp4", "content-length": String(videoBytes.byteLength) },
          });
        }
        throw new Error(`unexpected mocked request: ${req.method} ${req.url}`);
      },
    });

    assert.equal(result.status, "success");
    assert.equal(result.evidence.providerRequestSent, true);
    assert.equal(result.evidence.status, "success");
    assert.equal(result.evidence.pricing.estimatedMaxUsd, 3.2);
    assert.equal(result.evidence.output.bytes, videoBytes.byteLength);
    assert.equal(result.evidence.output.sha256, dockyard.mediaSha256(videoBytes));
    assert.equal(result.evidence.frameSequenceHandoff.ffmpegRequired, true);
    assert.equal(result.evidence.frameSequenceHandoff.suggestedFps, 24);
    await access(result.evidence.output.path);
    await access(result.evidencePath);

    const evidenceText = await readFile(result.evidencePath, "utf8");
    assert.equal(evidenceText.includes(secret), false);
    assert.equal(evidenceText.includes(request.prompt), false);
    assert.match(evidenceText, /promptSha256/);
    assert.match(evidenceText, /sourceSha256/);
    const handoffPath = join(result.evidence.output.path, "..", "frame-sequence-handoff.json");
    await access(handoffPath);
    assert.ok(calls.length >= 7);
  } finally {
    if (prior === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = prior;
  }
});

test("P40.2 rejects missing/wrong approval before any provider or pricing request", async () => {
  const root = await mkdtemp(join(tmpdir(), "dockyard-p40-2-approval-"));
  const request = { prompt: "A test generation that must never be sent.", resolution: "720p", durationSeconds: 4 };
  let fetches = 0;
  await assert.rejects(
    dockyard.executeMediaGeneration(root, request, {
      approveBillable: false,
      expectedPlanSha256: "0".repeat(64),
    }, {
      fetchImpl: async () => {
        fetches += 1;
        return jsonResponse({});
      },
    }),
    /approve-billable/i,
  );
  assert.equal(fetches, 0);
});

test("P40.2 refuses pricing drift before sending the billable generation POST", async () => {
  const root = await mkdtemp(join(tmpdir(), "dockyard-p40-2-pricing-drift-"));
  const request = { prompt: "Pricing drift fixture.", priority: "quality", resolution: "1080p", durationSeconds: 8 };
  const plan = dockyard.planMediaGeneration(root, request);
  const prior = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "AIzaMOCK_PRICE_DRIFT_abcdefghijklmnopqrstuvwxyz";
  let generationPosts = 0;
  try {
    await assert.rejects(
      dockyard.executeMediaGeneration(root, request, {
        approveBillable: true,
        expectedPlanSha256: plan.approvalSha256,
      }, {
        fetchImpl: async (input, init) => {
          const req = requestOf(input, init);
          if (req.url.endsWith("/models")) return jsonResponse({ models: [] });
          if (req.url === dockyard.VEO_PRICING_URL) {
            return pricingResponse(pricingHtml.replace("$0.40", "$0.99"));
          }
          if (req.method === "POST") generationPosts += 1;
          throw new Error("billable request should not be reached");
        },
      }),
      /pricing page no longer matches|expected.*rate/i,
    );
    assert.equal(generationPosts, 0);
  } finally {
    if (prior === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = prior;
  }
});

test("P40.2 refuses an unsafe video download host and leaves non-secret failed evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "dockyard-p40-2-host-"));
  const request = { prompt: "Unsafe URI fixture.", priority: "speed", resolution: "720p", durationSeconds: 4 };
  const plan = dockyard.planMediaGeneration(root, request);
  const prior = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "AIzaMOCK_UNSAFE_URI_abcdefghijklmnopqrstuvwxyz";
  try {
    await assert.rejects(
      dockyard.executeMediaGeneration(root, request, {
        approveBillable: true,
        expectedPlanSha256: plan.approvalSha256,
      }, {
        sleep: async () => undefined,
        fetchImpl: async (input, init) => {
          const req = requestOf(input, init);
          if (req.url.endsWith("/models")) return jsonResponse({ models: [] });
          if (req.url === dockyard.VEO_PRICING_URL) return pricingResponse();
          if (req.url === plan.endpoint && req.method === "POST") return jsonResponse({ name: "operations/op-unsafe" });
          if (req.url.endsWith("/operations/op-unsafe")) {
            return jsonResponse({
              name: "operations/op-unsafe",
              done: true,
              response: { generateVideoResponse: { generatedSamples: [{ video: { uri: "https://evil.example/video.mp4" } }] } },
            });
          }
          throw new Error("unexpected request");
        },
      }),
      /unapproved initial video download URI/i,
    );
    const path = join(dockyard.projectDirectory(plan.projectId), "media-generations", plan.approvalSha256, "evidence.json");
    const evidence = JSON.parse(await readFile(path, "utf8"));
    assert.equal(evidence.status, "failed");
    assert.equal(evidence.providerRequestSent, true);
    assert.equal(JSON.stringify(evidence).includes(process.env.GEMINI_API_KEY), false);
    assert.equal(JSON.stringify(evidence).includes(request.prompt), false);
  } finally {
    if (prior === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = prior;
  }
});
