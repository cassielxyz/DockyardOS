import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
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

function reviewed(args: string[]): { reviewedBy: string; rationale: string } {
  return {
    reviewedBy: required(args, "--reviewed-by"),
    rationale: required(args, "--rationale"),
  };
}

function repositoryFile(pathArg: string | undefined, expectedRelative: string): string {
  const expected = resolve(expectedRelative);
  const target = resolve(pathArg ?? expectedRelative);
  if (target !== expected) throw new Error(`Maintainer mutation target must be exactly ${expectedRelative} in the current repository.`);
  return target;
}

async function maybeApply<T>(
  plan: MaintainerPlan<T>,
  target: string,
  args: string[],
  approvalFlag: "--approve-trust-change" | "--approve-registry-change",
): Promise<{ applied: boolean; target: string; plan: MaintainerPlan<T> }> {
  if (!has(args, "--apply")) return { applied: false, target, plan };
  assertMaintainerApplyApproval(plan, required(args, "--expected-sha256"), has(args, approvalFlag));
  await writeJsonAtomic(target, plan.next);
  return { applied: true, target, plan };
}

async function handlePublisher(args: string[]): Promise<void> {
  const action = args[0];
  const rest = args.slice(1);
  const target = repositoryFile(value(rest, "--publishers-file"), "registry/publishers.json");
  const current = await loadPublisherKeys(target);
  let plan;

  if (action === "onboard") {
    const proposal = await readJson(required(rest, "--proposal"));
    plan = planPublisherOnboarding(proposal, current, reviewed(rest));
  } else if (action === "rotate") {
    const proposal = await readJson(required(rest, "--proposal"));
    plan = planPublisherRotation(proposal, current, required(rest, "--old-key-id"), reviewed(rest));
  } else if (action === "revoke") {
    plan = planPublisherRevocation(current, required(rest, "--key-id"), reviewed(rest));
  } else {
    throw new Error("Usage: dockyard community maintainer publisher onboard --proposal FILE --reviewed-by ID --rationale TEXT [--apply --expected-sha256 SHA --approve-trust-change] | rotate --proposal FILE --old-key-id KEY --reviewed-by ID --rationale TEXT [--apply ...] | revoke --key-id KEY --reviewed-by ID --rationale TEXT [--apply ...]");
  }

  console.log(JSON.stringify(await maybeApply(plan, target, rest, "--approve-trust-change"), null, 2));
}

async function handlePromotion(args: string[]): Promise<void> {
  const target = repositoryFile(value(args, "--registry-file"), "registry/community.json");
  const publisherKeysPath = repositoryFile(value(args, "--publisher-keys"), "registry/publishers.json");
  const manifestPath = required(args, "--file");
  const [manifest, registry, keys] = await Promise.all([
    readJson(manifestPath),
    loadCommunityRegistry(target),
    loadPublisherKeys(publisherKeysPath),
  ]);
  const plan = await planContributionPromotion(manifest, registry, keys, reviewed(args), resolve(manifestPath));
  console.log(JSON.stringify(await maybeApply(plan, target, args, "--approve-registry-change"), null, 2));
}

export async function handleCommunityMaintainerCommand(args: string[]): Promise<void> {
  const area = args[0];
  const rest = args.slice(1);
  if (area === "publisher") return handlePublisher(rest);
  if (area === "promote") return handlePromotion(rest);
  throw new Error("Usage: dockyard community maintainer publisher onboard|rotate|revoke ... | promote --file MANIFEST --reviewed-by ID --rationale TEXT [--apply --expected-sha256 SHA --approve-registry-change]");
}
