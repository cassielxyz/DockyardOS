import { planRegistryPublication, publishRegistryEnvelope, type RegistryPublicationInput } from "./community-registry-publication.js";

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

function sequence(args: string[]): number {
  const raw = required(args, "--sequence");
  if (!/^[1-9][0-9]*$/.test(raw)) throw new Error("--sequence must be a positive integer.");
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed)) throw new Error("--sequence must be a positive safe integer.");
  return parsed;
}

function input(args: string[], requireReviewedAt: boolean): RegistryPublicationInput {
  const reviewedAt = value(args, "--reviewed-at");
  if (requireReviewedAt && !reviewedAt) {
    throw new Error("--reviewed-at is required for publication; reuse plan.review.reviewedAt from the exact reviewed plan.");
  }
  return {
    indexPath: required(args, "--file"),
    registryId: required(args, "--registry-id"),
    keyId: required(args, "--key-id"),
    sequence: sequence(args),
    expiresAt: required(args, "--expires-at"),
    repository: required(args, "--repository"),
    targetPath: required(args, "--path"),
    branch: required(args, "--branch"),
    reviewedBy: required(args, "--reviewed-by"),
    rationale: required(args, "--rationale"),
    ...(reviewedAt ? { reviewedAt } : {}),
  };
}

export async function handleRegistryPublicationCommand(root: string, args: string[]): Promise<void> {
  const action = args[0] ?? "plan";
  const rest = args.slice(1);
  if (action === "plan") {
    console.log(JSON.stringify(await planRegistryPublication(root, input(rest, false)), null, 2));
    return;
  }
  if (action === "run") {
    const result = await publishRegistryEnvelope(root, input(rest, true), {
      approvePublication: has(rest, "--approve-publication"),
      expectedPlanSha256: required(rest, "--expected-plan-sha256"),
    });
    console.log(JSON.stringify(result, null, 2));
    if (result.status === "published-unverified") process.exitCode = 2;
    return;
  }
  throw new Error("Usage: dockyard community maintainer registry-publication plan|run --file registry/remote-publications/INDEX.json --registry-id ID --key-id KEY --sequence N --expires-at ISO --repository OWNER/REPO --path PATH.json --branch BRANCH --reviewed-by ID --rationale TEXT [--reviewed-at ISO --expected-plan-sha256 SHA256 --approve-publication]");
}
