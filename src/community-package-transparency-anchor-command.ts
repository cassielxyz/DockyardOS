import {
  planPackageTransparencyAnchor,
  publishPackageTransparencyAnchor,
  type PackageTransparencyAnchorInput,
} from "./community-package-transparency-anchor.js";

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

function input(args: string[], requireReviewedAt: boolean): PackageTransparencyAnchorInput {
  const reviewedAt = value(args, "--reviewed-at");
  if (requireReviewedAt && !reviewedAt) {
    throw new Error("--reviewed-at is required for anchoring; reuse plan.review.reviewedAt from the exact reviewed plan.");
  }
  return {
    anchorId: required(args, "--anchor-id"),
    repository: required(args, "--repository"),
    branch: required(args, "--branch"),
    reviewedBy: required(args, "--reviewed-by"),
    rationale: required(args, "--rationale"),
    ...(reviewedAt ? { reviewedAt } : {}),
  };
}

export async function handlePackageTransparencyAnchorCommand(root: string, args: string[]): Promise<void> {
  const action = args[0] ?? "plan";
  const rest = args.slice(1);
  if (action === "plan") {
    console.log(JSON.stringify(await planPackageTransparencyAnchor(root, input(rest, false)), null, 2));
    return;
  }
  if (action === "run") {
    const result = await publishPackageTransparencyAnchor(root, input(rest, true), {
      approveAnchor: has(rest, "--approve-anchor"),
      expectedPlanSha256: required(rest, "--expected-plan-sha256"),
    });
    console.log(JSON.stringify(result, null, 2));
    if (result.status === "anchored-unverified") process.exitCode = 2;
    return;
  }
  throw new Error("Usage: dockyard community transparency anchor plan|run --anchor-id ID --repository OWNER/PUBLIC_REPO --branch BRANCH --reviewed-by ID --rationale TEXT [--reviewed-at ISO --expected-plan-sha256 SHA256 --approve-anchor]");
}
