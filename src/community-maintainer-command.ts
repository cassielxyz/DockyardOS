import { lstat, readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { loadCommunityRegistry } from "./community-registry.js";
import { loadPublisherKeys } from "./community-signature.js";
import { writeJsonAtomic } from "./fs-utils.js";
import {
  assertMaintainerApplyApproval,
  planContributionPromotion,
  planPublisherOnboarding,
  planPublisherRevocation,
  planPublisherRotation,
  type MaintainerPlan,
} from "./community-maintainer.js";

function value(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function required(args: string[], name: string): string {
  const found = value(args, name);
  if (!found) throw new Error(`${name} is required`);
  return found;
}

function has(args: string[], name: string): boolean {
  return args.includes(name);
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(resolve(path), "utf8")) as unknown;
}

async function assertMaintainerRepository(root: string): Promise<void> {
  const packageJson = await readJson(resolve(root, "package.json"));
  if (!packageJson || typeof packageJson !== "object" || Array.isArray(packageJson) || (packageJson as { name?: unknown }).name !== "dockyardos") {
    throw new Error("Maintainer trust operations must run from the DockyardOS source repository.");
  }
}

function reviewed(args: string[]): { reviewedBy: string; rationale: string } {
  return {
    reviewedBy: required(args, "--reviewed-by"),
    rationale: required(args, "--rationale"),
  };
}

function reviewedAt(args: string[]): Date {
  const supplied = value(args, "--reviewed-at");
  if (!supplied) {
    if (has(args, "--apply")) {
      throw new Error("--reviewed-at is required when --apply is used; reuse plan.review.reviewedAt from the exact reviewed plan.");
    }
    return new Date();
  }
  const parsed = new Date(supplied);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== supplied) {
    throw new Error("--reviewed-at must be the canonical ISO timestamp returned by plan.review.reviewedAt.");
  }
  return parsed;
}

function repositoryFile(root: string, pathArg: string | undefined, expectedRelative: string): string {
  const expected = resolve(root, expectedRelative);
  const target = resolve(root, pathArg ?? expectedRelative);
  if (target !== expected) throw new Error(`Maintainer mutation target must be exactly ${expectedRelative} in the DockyardOS repository.`);
  return target;
}

async function stagedReviewFile(root: string, pathArg: string, expectedDirectory: string, label: string): Promise<string> {
  const base = resolve(root, expectedDirectory);
  const target = resolve(root, pathArg);
  const rel = relative(base, target);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`${label} must be a file inside ${expectedDirectory}.`);
  }
  const stat = await lstat(target);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`${label} must be a regular non-symlink file inside ${expectedDirectory}.`);
  }
  return target;
}

async function maybeApply<T>(
  plan: MaintainerPlan<T>,
  target: string,
  args: string[],
  approvalFlag: "--approve-trust-change" | "--approve-registry-change",
): Promise<{ applied: boolean; target: string; plan: MaintainerPlan<T> }> {
  if (!has(args, "--apply")) return { applied: false, target, plan };
  const expectedBeforeSha256 = required(args, "--expected-sha256");
  const expectedAfterSha256 = required(args, "--expected-after-sha256");
  assertMaintainerApplyApproval(plan, expectedBeforeSha256, has(args, approvalFlag));
  if (!/^[0-9a-f]{64}$/.test(expectedAfterSha256) || expectedAfterSha256 !== plan.afterSha256) {
    throw new Error(`Expected after-state SHA-256 does not match the exact reviewed next state. Expected ${plan.afterSha256}.`);
  }
  await writeJsonAtomic(target, plan.next);
  return { applied: true, target, plan };
}

async function handlePublisher(root: string, args: string[]): Promise<void> {
  const action = args[0];
  const rest = args.slice(1);
  const target = repositoryFile(root, value(rest, "--publishers-file"), "registry/publishers.json");
  const current = await loadPublisherKeys(target);
  const reviewTime = reviewedAt(rest);
  let plan;

  if (action === "onboard") {
    const proposalPath = await stagedReviewFile(root, required(rest, "--proposal"), "registry/publisher-proposals", "Publisher proposal");
    const proposal = await readJson(proposalPath);
    plan = planPublisherOnboarding(proposal, current, reviewed(rest), reviewTime);
  } else if (action === "rotate") {
    const proposalPath = await stagedReviewFile(root, required(rest, "--proposal"), "registry/publisher-proposals", "Publisher proposal");
    const proposal = await readJson(proposalPath);
    plan = planPublisherRotation(proposal, current, required(rest, "--old-key-id"), reviewed(rest), reviewTime);
  } else if (action === "revoke") {
    plan = planPublisherRevocation(current, required(rest, "--key-id"), reviewed(rest), reviewTime);
  } else {
    throw new Error("Usage: dockyard community maintainer publisher onboard --proposal registry/publisher-proposals/FILE --reviewed-by ID --rationale TEXT [--reviewed-at ISO --apply --expected-sha256 SHA --expected-after-sha256 SHA --approve-trust-change] | rotate --proposal registry/publisher-proposals/FILE --old-key-id KEY --reviewed-by ID --rationale TEXT [--reviewed-at ISO --apply ...] | revoke --key-id KEY --reviewed-by ID --rationale TEXT [--reviewed-at ISO --apply ...]");
  }

  console.log(JSON.stringify(await maybeApply(plan, target, rest, "--approve-trust-change"), null, 2));
}

async function handlePromotion(root: string, args: string[]): Promise<void> {
  const target = repositoryFile(root, value(args, "--registry-file"), "registry/community.json");
  const publisherKeysPath = repositoryFile(root, value(args, "--publisher-keys"), "registry/publishers.json");
  const manifestPath = await stagedReviewFile(root, required(args, "--file"), "registry/contributions", "Contribution manifest");
  const [manifest, registry, keys] = await Promise.all([
    readJson(manifestPath),
    loadCommunityRegistry(target),
    loadPublisherKeys(publisherKeysPath),
  ]);
  const plan = await planContributionPromotion(manifest, registry, keys, reviewed(args), manifestPath, reviewedAt(args));
  console.log(JSON.stringify(await maybeApply(plan, target, args, "--approve-registry-change"), null, 2));
}

export async function handleCommunityMaintainerCommand(root: string, args: string[]): Promise<void> {
  await assertMaintainerRepository(root);
  const area = args[0];
  const rest = args.slice(1);
  if (area === "publisher") return handlePublisher(root, rest);
  if (area === "promote") return handlePromotion(root, rest);
  throw new Error("Usage: dockyard community maintainer publisher onboard|rotate|revoke ... | promote --file registry/contributions/MANIFEST --reviewed-by ID --rationale TEXT [--reviewed-at ISO --apply --expected-sha256 SHA --expected-after-sha256 SHA --approve-registry-change]");
}
