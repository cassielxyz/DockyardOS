import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dockyard = await import("../dist/index.js");

function basePlan(entries) {
  const ready = entries.filter((entry) => entry.status === "ready").map((entry) => entry.candidateId);
  const unresolved = entries.filter((entry) => entry.status !== "ready").map((entry) => entry.candidateId);
  return {
    schemaVersion: 1,
    generatedAt: new Date(0).toISOString(),
    entries,
    ready,
    unresolved,
    installable: entries.filter((entry) => entry.status === "installable-unassessed").map((entry) => entry.candidateId),
    needsConnection: [],
    discoveryOnly: [],
    missingRuntime: [],
    blocked: entries.filter((entry) => entry.status === "blocked").map((entry) => entry.candidateId),
    warnings: [],
  };
}

function skillEntry(overrides = {}) {
  return {
    candidateId: "taste-skill",
    displayName: "Taste Skill",
    kind: "skill",
    status: "ready",
    reason: "fixture ready",
    sourceType: "github",
    sourceLocator: "Leonxlnx/taste-skill",
    packageId: "taste-skill",
    activeRevision: "a".repeat(40),
    automaticAction: "none",
    ...overrides,
  };
}

test("P39.1 loads only selected ready installed skill entrypoints", async () => {
  const calls = [];
  const plan = basePlan([
    skillEntry(),
    skillEntry({
      candidateId: "blocked-skill",
      packageId: "blocked-skill",
      activeRevision: "b".repeat(40),
      status: "blocked",
    }),
    {
      candidateId: "architect-agent",
      displayName: "Architecture Agent",
      kind: "agent",
      status: "ready",
      reason: "bundled",
      sourceType: "dockyard",
      sourceLocator: "dockyard://agent",
      automaticAction: "none",
    },
  ]);

  const result = await dockyard.loadSelectedSkillContext(plan, {
    dependencies: {
      loadSnapshot: async (packageId, revision) => {
        calls.push(["snapshot", packageId, revision]);
        return {
          schemaVersion: 1,
          packageId,
          revision,
          storedAt: new Date(0).toISOString(),
          origin: { kind: "bundled" },
          manifest: {
            id: packageId,
            kind: "skill",
            entrypoints: [{ type: "skill", path: "SKILL.md" }],
          },
        };
      },
      readEntrypoint: async (packageId, entrypoint) => {
        calls.push(["read", packageId, entrypoint]);
        return {
          packageId,
          revision: "a".repeat(40),
          origin: { kind: "bundled" },
          entrypoint,
          type: "skill",
          content: "# Taste\nUse deliberate hierarchy and avoid generic AI-looking UI.",
        };
      },
    },
  });

  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].candidateId, "taste-skill");
  assert.equal(result.entries[0].entrypoint, "SKILL.md");
  assert.match(result.entries[0].content, /deliberate hierarchy/);
  assert.deepEqual(calls.map((call) => call[1]), ["taste-skill", "taste-skill"]);
  assert.ok(!calls.some((call) => call[1] === "blocked-skill"));
});

test("P39.1 supports candidate-to-package aliases without loading unrelated skills", async () => {
  const revision = "c".repeat(40);
  const plan = basePlan([
    skillEntry({
      candidateId: "superpowers",
      displayName: "Superpowers",
      packageId: "superpowers-core-skills",
      activeRevision: revision,
    }),
    {
      ...skillEntry({
        candidateId: "ui-ux-pro-max",
        displayName: "UI UX Pro Max",
        packageId: undefined,
        activeRevision: undefined,
        sourceType: "dockyard",
        sourceLocator: "dockyard://bundled",
      }),
    },
  ]);

  const result = await dockyard.loadSelectedSkillContext(plan, {
    dependencies: {
      loadSnapshot: async (packageId, requestedRevision) => ({
        schemaVersion: 1,
        packageId,
        revision: requestedRevision,
        storedAt: new Date(0).toISOString(),
        origin: { kind: "bundled" },
        manifest: {
          id: packageId,
          kind: "skill",
          entrypoints: [{ type: "skill", path: "skills/planning/SKILL.md" }],
        },
      }),
      readEntrypoint: async (packageId, entrypoint) => ({
        packageId,
        revision,
        origin: { kind: "bundled" },
        entrypoint,
        type: "skill",
        content: "# Superpowers Planning\nPlan before implementation.",
      }),
    },
  });

  assert.deepEqual(result.entries.map((entry) => entry.candidateId), ["superpowers"]);
  assert.equal(result.entries[0].packageId, "superpowers-core-skills");
});

test("P39.1 skill injection is bounded and reports truncation", async () => {
  const plan = basePlan([skillEntry()]);
  const result = await dockyard.loadSelectedSkillContext(plan, {
    maxCharactersPerSkill: 600,
    maxTotalCharacters: 700,
    dependencies: {
      loadSnapshot: async (packageId, revision) => ({
        schemaVersion: 1,
        packageId,
        revision,
        storedAt: new Date(0).toISOString(),
        origin: { kind: "bundled" },
        manifest: {
          id: packageId,
          kind: "skill",
          entrypoints: [{ type: "skill", path: "SKILL.md" }],
        },
      }),
      readEntrypoint: async (packageId, entrypoint) => ({
        packageId,
        revision: "a".repeat(40),
        origin: { kind: "bundled" },
        entrypoint,
        type: "skill",
        content: "x".repeat(4_000),
      }),
    },
  });

  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].truncated, true);
  assert.ok(result.entries[0].characters <= 600);
  assert.match(result.entries[0].content, /truncated this skill/i);
  assert.ok(result.totalCharacters <= result.maxTotalCharacters);
});

test("P39.1 refuses to inject a selected skill when immutable verification/read fails", async () => {
  const plan = basePlan([skillEntry()]);
  const result = await dockyard.loadSelectedSkillContext(plan, {
    dependencies: {
      loadSnapshot: async (packageId, revision) => ({
        schemaVersion: 1,
        packageId,
        revision,
        storedAt: new Date(0).toISOString(),
        origin: { kind: "bundled" },
        manifest: {
          id: packageId,
          kind: "skill",
          entrypoints: [{ type: "skill", path: "SKILL.md" }],
        },
      }),
      readEntrypoint: async () => {
        throw new Error("integrity verification failed");
      },
    },
  });

  assert.equal(result.entries.length, 0);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /integrity verification failed/i);
  const lines = dockyard.selectedSkillContextAgentText(result).join("\n");
  assert.match(lines, /SKILL LOAD WARNINGS/);
  assert.doesNotMatch(lines, /BEGIN DOCKYARDOS SKILL/);
});

test("P39.1 injected skill text is explicitly subordinate to user and Dockyard policy", async () => {
  const context = {
    schemaVersion: 1,
    entries: [{
      candidateId: "taste-skill",
      packageId: "taste-skill",
      revision: "a".repeat(40),
      entrypoint: "SKILL.md",
      content: "# Taste\nMake deliberate visual choices.",
      truncated: false,
      characters: 41,
    }],
    warnings: [],
    totalCharacters: 41,
    maxSkills: 8,
    maxCharactersPerSkill: 10_000,
    maxTotalCharacters: 48_000,
  };
  const lines = dockyard.selectedSkillContextAgentText(context).join("\n");
  assert.match(lines, /Only skills selected for this invocation\/phase/i);
  assert.match(lines, /user's request/i);
  assert.match(lines, /approval policy/i);
  assert.match(lines, /BEGIN DOCKYARDOS SKILL taste-skill/);
  assert.match(lines, /END DOCKYARDOS SKILL taste-skill/);
});

test("P39.1 invocation fulfillment automatically injects selected installed skill context", async () => {
  const source = await readFile(new URL("../src/capability-fulfillment-hook.ts", import.meta.url), "utf8");
  assert.match(source, /loadSelectedSkillContext/);
  assert.match(source, /selectedSkillContextAgentText/);
  assert.match(source, /selectedSkillContextDependencies/);
  assert.match(source, /selectedSkillContext,/);
});
