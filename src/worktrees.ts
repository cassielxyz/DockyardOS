import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { projectDirectory, requireProject } from "./project.js";
import { run } from "./process.js";
import { attachWorktree } from "./team-state.js";
import type { WorktreePlan } from "./team-types.js";

function slug(value: string, max = 48): string {
  const clean = value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, max);
  if (!clean) throw new Error("Worktree task/agent identifier must contain at least one safe character.");
  return clean;
}

function verifyGitRef(root: string, ref: string): string {
  const result = run("git", ["rev-parse", "--verify", `${ref}^{commit}`], { cwd: root, timeoutMs: 5_000, maxOutputBytes: 4_096 });
  if (!result.ok || !result.stdout) throw new Error(`Cannot resolve Git base ref: ${ref}`);
  return result.stdout.split("\n")[0]!;
}

export async function planWorktree(root: string, input: { runId: string; taskId: string; agentId: string; baseRef?: string }): Promise<WorktreePlan> {
  const project = await requireProject(root);
  const baseRef = input.baseRef ?? "HEAD";
  verifyGitRef(project.root, baseRef);
  const runSlug = slug(input.runId, 24);
  const taskSlug = slug(input.taskId);
  const agentSlug = slug(input.agentId, 32);
  return {
    taskId: taskSlug,
    agentId: input.agentId,
    baseRef,
    branch: `dockyard/${runSlug}/${taskSlug}-${agentSlug}`,
    path: resolve(projectDirectory(project.id), "worktrees", runSlug, `${taskSlug}-${agentSlug}`),
  };
}

export async function createWorktree(
  root: string,
  input: { runId: string; taskId: string; agentId: string; baseRef?: string },
): Promise<WorktreePlan> {
  const project = await requireProject(root);
  const plan = await planWorktree(project.root, input);
  await mkdir(resolve(plan.path, ".."), { recursive: true });

  const existingBranch = run("git", ["show-ref", "--verify", "--quiet", `refs/heads/${plan.branch}`], { cwd: project.root, timeoutMs: 5_000, maxOutputBytes: 4_096 });
  if (existingBranch.ok) throw new Error(`Dockyard worktree branch already exists: ${plan.branch}`);

  const created = run("git", ["worktree", "add", "-b", plan.branch, plan.path, plan.baseRef], {
    cwd: project.root,
    timeoutMs: 30_000,
    maxOutputBytes: 16_384,
  });
  if (!created.ok) throw new Error(`Failed to create isolated worktree: ${created.stderr || created.stdout}`);

  await attachWorktree(project.root, { runId: input.runId, taskId: plan.taskId, agentId: input.agentId, branch: plan.branch, path: plan.path });
  return plan;
}

export function verifyWorktree(root: string, plan: WorktreePlan): { ok: boolean; head?: string; branch?: string; detail: string } {
  const projectRoot = resolve(root);
  const top = run("git", ["rev-parse", "--show-toplevel"], { cwd: plan.path, timeoutMs: 5_000, maxOutputBytes: 4_096 });
  const branch = run("git", ["branch", "--show-current"], { cwd: plan.path, timeoutMs: 5_000, maxOutputBytes: 4_096 });
  const head = run("git", ["rev-parse", "HEAD"], { cwd: plan.path, timeoutMs: 5_000, maxOutputBytes: 4_096 });
  const ok = top.ok && branch.ok && head.ok && branch.stdout === plan.branch && resolve(top.stdout) !== projectRoot;
  return {
    ok,
    ...(head.stdout ? { head: head.stdout } : {}),
    ...(branch.stdout ? { branch: branch.stdout } : {}),
    detail: ok ? "Isolated Git worktree is ready." : "Worktree verification failed or points at the main working tree.",
  };
}
