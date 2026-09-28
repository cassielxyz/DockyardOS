import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const dockyard = await import("../dist/index.js");

async function setup() {
  const home = await mkdtemp(join(tmpdir(), "dockyard-mediation-home-"));
  const root = await mkdtemp(join(tmpdir(), "dockyard-mediation-root-"));
  process.env.DOCKYARD_HOME = home;
  await dockyard.initProject(root, { name: "mediation-test", mode: "balanced" });
  return { home, root };
}

async function transcript(root, records) {
  const path = join(root, "transcript.jsonl");
  await writeFile(path, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`, "utf8");
  return path;
}

test("latest user request is recovered from bounded Antigravity-style JSONL", async () => {
  const { root } = await setup();
  const path = await transcript(root, [
    { event: "user", message: { role: "user", content: "First request" } },
    { event: "assistant", message: { role: "assistant", content: "Working" } },
    { type: "user_message", message: { role: "user", content: [{ type: "text", text: "Build the new dashboard" }] } },
  ]);
  const found = await dockyard.latestUserRequestFromTranscript(path);
  assert.equal(found.text, "Build the new dashboard");
  assert.match(found.recordHash, /^[a-f0-9]{64}$/);
});

test("request classifier separates continuation, advisory, quick, and team work", () => {
  assert.equal(dockyard.classifyRequest("continue from where you left"), "continuation");
  assert.equal(dockyard.classifyRequest("How does this architecture work?"), "advisory");
  assert.equal(dockyard.classifyRequest("Change the button color in the React page"), "quick");
  assert.equal(dockyard.classifyRequest("Build authentication and database-backed admin pages for the app"), "team");
});

test("substantial request is mediated before the model and starts one persistent team", async () => {
  const { root } = await setup();
  await writeFile(join(root, "package.json"), JSON.stringify({
    dependencies: { next: "latest", react: "latest", "@supabase/supabase-js": "latest" },
    devDependencies: { typescript: "latest", tailwindcss: "latest" },
  }), "utf8");
  const path = await transcript(root, [{
    event: "user",
    message: { role: "user", content: "Implement secure login, Supabase RLS, admin permissions, and production-ready tests for this Next.js app" },
  }]);

  const first = await dockyard.mediateAgentRequest(root, { transcriptPath: path, conversationId: "conversation-1", host: "antigravity" });
  assert.equal(first.route, "team");
  assert.equal(first.newRequest, true);
  assert.equal(first.requestAvailable, true);
  assert.equal(first.security, "high");
  assert.ok(first.stack.includes("nextjs"));
  assert.ok(first.stack.includes("supabase"));
  assert.ok(first.skills.length > 0);
  assert.ok(first.agents.length > 0);
  assert.ok(first.securityGates.includes("owasp-review"));
  assert.ok(first.securityGates.includes("strix-verification"));
  assert.ok(first.team);

  const active = await dockyard.loadTeamRun(root);
  assert.ok(active);
  const activeId = active.id;

  const second = await dockyard.mediateAgentRequest(root, { transcriptPath: path, conversationId: "conversation-1", host: "antigravity" });
  assert.equal(second.newRequest, false);
  const again = await dockyard.loadTeamRun(root);
  assert.equal(again.id, activeId, "same request must not create a duplicate team on later model invocations");

  const serialized = JSON.stringify(second);
  assert.doesNotMatch(serialized, /Implement secure login/);
  assert.doesNotMatch(serialized, /admin permissions/);
});

test("advisory request uses project context without creating a team", async () => {
  const { root } = await setup();
  const path = await transcript(root, [{ event: "user", message: { role: "user", content: "What does the current checkpoint mean?" } }]);
  const result = await dockyard.mediateAgentRequest(root, { transcriptPath: path, conversationId: "advisory", host: "antigravity" });
  assert.equal(result.route, "advisory");
  assert.equal(result.team, undefined);
  assert.equal(await dockyard.loadTeamRun(root), undefined);
  assert.match(result.visibleReplyHint, /do not ask the user to open/i);
});

test("quick request is capability-routed without spawning a full persistent team", async () => {
  const { root } = await setup();
  await writeFile(join(root, "package.json"), JSON.stringify({ dependencies: { react: "latest" } }), "utf8");
  const path = await transcript(root, [{ event: "user", message: { role: "user", content: "Change the button color on the React page" } }]);
  const result = await dockyard.mediateAgentRequest(root, { transcriptPath: path, conversationId: "quick", host: "antigravity" });
  assert.equal(result.route, "quick");
  assert.equal(result.workflowProfile, "fast");
  assert.equal(result.team, undefined);
  assert.ok(result.skills.length <= 4);
  assert.ok(result.agents.length <= 2);
});

test("agent text requires visible Dockyard routing and no extension handoff", async () => {
  const { root } = await setup();
  const path = await transcript(root, [{ event: "user", message: { role: "user", content: "Build a new API feature with tests" } }]);
  const mediation = await dockyard.mediateAgentRequest(root, { transcriptPath: path, conversationId: "agent-text", host: "antigravity" });
  const text = dockyard.requestMediationAgentText(mediation).join("\n");
  assert.match(text, /DOCKYARDOS REQUEST MEDIATION: ACTIVE/);
  assert.match(text, /DockyardOS active/);
  assert.match(text, /Do not tell the user to open the extension/i);
});

test("stored mediation state contains routing metadata but not raw user prompt", async () => {
  const { home, root } = await setup();
  const request = "Build a private API feature using a sensitive placeholder phrase ALPHA_DO_NOT_PERSIST";
  const path = await transcript(root, [{ event: "user", message: { role: "user", content: request } }]);
  await dockyard.mediateAgentRequest(root, { transcriptPath: path, conversationId: "privacy", host: "antigravity" });
  const projectId = dockyard.projectIdForRoot(root);
  const dir = join(home, "projects", projectId, "request-mediation");
  const files = await import("node:fs/promises").then((fs) => fs.readdir(dir));
  assert.equal(files.length, 1);
  const stored = await readFile(join(dir, files[0]), "utf8");
  assert.doesNotMatch(stored, /ALPHA_DO_NOT_PERSIST/);
  assert.doesNotMatch(stored, /private API feature/);
  assert.match(stored, /requestHash/);
});
