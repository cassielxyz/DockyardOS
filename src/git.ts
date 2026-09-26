import { writeFile } from "node:fs/promises";
import type { GitSnapshot } from "./types.js";
import { run } from "./process.js";

const MAX_PATCH_BYTES = 1_000_000;

function parseStatus(lines: string[]) {
  let staged = false;
  let unstaged = false;
  const untracked: string[] = [];
  for (const line of lines) {
    if (!line || line.startsWith("##")) continue;
    if (line.startsWith("??")) {
      untracked.push(line.slice(3));
      continue;
    }
    if (line[0] && line[0] !== " ") staged = true;
    if (line[1] && line[1] !== " ") unstaged = true;
  }
  return { staged, unstaged, untracked };
}

export async function captureGitSnapshot(root: string, patchPath?: string): Promise<GitSnapshot> {
  const probe = run("git", ["rev-parse", "--is-inside-work-tree"], root);
  if (!probe.ok || probe.stdout !== "true") {
    return {
      repository: false,
      dirty: false,
      staged: false,
      unstaged: false,
      untracked: [],
      status: [],
      patchStored: false,
      patchTruncated: false,
    };
  }

  const statusResult = run("git", ["status", "--porcelain=v1", "--branch"], root);
  const lines = statusResult.stdout ? statusResult.stdout.split("\n") : [];
  const parsed = parseStatus(lines);
  const branchResult = run("git", ["branch", "--show-current"], root);
  const headResult = run("git", ["rev-parse", "HEAD"], root);

  let patchStored = false;
  let patchTruncated = false;
  if (patchPath) {
    const unstagedPatch = run("git", ["diff", "--no-ext-diff", "--unified=3"], root);
    const stagedPatch = run("git", ["diff", "--cached", "--no-ext-diff", "--unified=3"], root);
    const combined = [
      unstagedPatch.stdout ? "# Unstaged changes\n" + unstagedPatch.stdout : "",
      stagedPatch.stdout ? "# Staged changes\n" + stagedPatch.stdout : "",
    ].filter(Boolean).join("\n\n");
    if (combined) {
      const bytes = Buffer.byteLength(combined, "utf8");
      if (bytes <= MAX_PATCH_BYTES) {
        await writeFile(patchPath, `${combined}\n`, "utf8");
        patchStored = true;
      } else {
        patchTruncated = true;
      }
    }
  }

  return {
    repository: true,
    ...(branchResult.stdout ? { branch: branchResult.stdout } : {}),
    ...(headResult.stdout ? { head: headResult.stdout } : {}),
    dirty: parsed.staged || parsed.unstaged || parsed.untracked.length > 0,
    staged: parsed.staged,
    unstaged: parsed.unstaged,
    untracked: parsed.untracked,
    status: lines,
    patchStored,
    patchTruncated,
  };
}
