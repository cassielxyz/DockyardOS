import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("P20 public anchor bytes use immutable P19 review time, not the P20 approval timestamp", async () => {
  const source = await readFile("src/community-registry-anchor.ts", "utf8");
  assert.match(source, /publicationReviewedAt:\s*evidence\.reviewedAt/);
  assert.doesNotMatch(source, /anchoredAt:\s*review\.reviewedAt/);
  assert.match(source, /review,\s*publicationAuditPath:/s);
});
