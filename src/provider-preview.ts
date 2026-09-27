import { resolve } from "node:path";
import { writeJsonAtomic } from "./fs-utils.js";
import { projectDirectory, projectIdForRoot } from "./project.js";
import {
  executeProviderAction,
  planProviderAction,
  type ProviderActionExecutionResult,
  type ProviderActionPlan,
} from "./provider-actions.js";

export type PreviewWebTarget = "vercel" | "cloudflare-pages" | "cloudflare-worker";
export type PreviewDatabaseTarget = "supabase";
export type PreviewWorkflowTarget = "github";

export interface PreviewEnvironmentRequest {
  web?: PreviewWebTarget;
  database?: PreviewDatabaseTarget;
  workflow?: PreviewWorkflowTarget;
  params?: Record<string, string>;
}

export interface PreviewEnvironmentPlan {
  schemaVersion: 1;
  createdAt: string;
  approvalRequired: true;
  environment: "preview";
  steps: ProviderActionPlan[];
  notes: string[];
}

export interface PreviewEnvironmentResult {
  schemaVersion: 1;
  status: "success" | "partial" | "error";
  startedAt: string;
  finishedAt: string;
  steps: ProviderActionExecutionResult[];
  remaining: Array<{ providerId: string; actionId: string }>;
  artifactPath: string;
  summary: string;
}

const PREFIXES = new Set(["vercel", "cloudflare", "supabase", "github"]);

function scopedParams(all: Record<string, string>, prefix: string): Record<string, string> {
  const result: Record<string, string> = {};
  const marker = `${prefix}.`;
  for (const [key, value] of Object.entries(all)) {
    if (!key.startsWith(marker)) continue;
    const local = key.slice(marker.length);
    if (!local) throw new Error(`Invalid preview parameter: ${key}`);
    result[local] = value;
  }
  return result;
}

function validateNamespaces(params: Record<string, string>): void {
  for (const key of Object.keys(params)) {
    const dot = key.indexOf(".");
    if (dot <= 0 || !PREFIXES.has(key.slice(0, dot))) {
      throw new Error(`Preview parameter must use one of these namespaces: vercel.*, cloudflare.*, supabase.*, github.* (got ${key}).`);
    }
  }
}

export function planPreviewEnvironment(root: string, request: PreviewEnvironmentRequest): PreviewEnvironmentPlan {
  if (!request.web && !request.database && !request.workflow) {
    throw new Error("Preview environment requires at least one of web, database, or workflow.");
  }
  const allParams = request.params ?? {};
  validateNamespaces(allParams);
  const steps: ProviderActionPlan[] = [];

  if (request.database === "supabase") {
    steps.push(planProviderAction(root, {
      providerId: "supabase",
      actionId: "preview-branch-create",
      environment: "preview",
      params: scopedParams(allParams, "supabase"),
    }));
  }

  if (request.web === "vercel") {
    steps.push(planProviderAction(root, {
      providerId: "vercel",
      actionId: "preview-deploy",
      environment: "preview",
      params: scopedParams(allParams, "vercel"),
    }));
  } else if (request.web === "cloudflare-pages") {
    steps.push(planProviderAction(root, {
      providerId: "cloudflare",
      actionId: "pages-preview-deploy",
      environment: "preview",
      params: scopedParams(allParams, "cloudflare"),
    }));
  } else if (request.web === "cloudflare-worker") {
    steps.push(planProviderAction(root, {
      providerId: "cloudflare",
      actionId: "worker-preview-upload",
      environment: "preview",
      params: scopedParams(allParams, "cloudflare"),
    }));
  }

  if (request.workflow === "github") {
    steps.push(planProviderAction(root, {
      providerId: "github",
      actionId: "workflow-dispatch",
      environment: "preview",
      params: scopedParams(allParams, "github"),
    }));
  }

  return {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    approvalRequired: true,
    environment: "preview",
    steps,
    notes: [
      "Preview steps execute sequentially so each provider mutation is verified before the next begins.",
      "Execution stops on the first failed or verification-failed step; DockyardOS does not claim a healthy preview when only part of the environment was verified.",
      "This orchestrator does not contain production actions and does not infer provider credentials, project refs, workflow inputs, or deployment directories.",
    ],
  };
}

function bundleArtifactPath(root: string): string {
  const stamp = new Date().toISOString().replace(/[-:.]/g, "");
  return resolve(projectDirectory(projectIdForRoot(root)), "providers", "previews", `${stamp}-preview.json`);
}

export async function executePreviewEnvironment(
  root: string,
  plan: PreviewEnvironmentPlan,
  options: { approve?: boolean } = {},
): Promise<PreviewEnvironmentResult> {
  if (!options.approve) throw new Error("Preview provisioning mutates external providers and requires explicit --approve.");
  if (!plan.steps.length) throw new Error("Preview plan contains no provider steps.");
  if (plan.steps.some((step) => step.environment !== "preview" || step.productionApprovalRequired)) {
    throw new Error("Preview orchestrator refuses non-preview or production-gated provider actions.");
  }

  const startedAt = new Date().toISOString();
  const completed: ProviderActionExecutionResult[] = [];
  let failedAt = -1;
  for (let index = 0; index < plan.steps.length; index += 1) {
    const step = plan.steps[index]!;
    let result: ProviderActionExecutionResult;
    try {
      result = await executeProviderAction(root, step, { approve: true, approveProduction: false });
    } catch (error) {
      const targetArtifact = bundleArtifactPath(root);
      const remaining = plan.steps.slice(index).map((item) => ({ providerId: item.providerId, actionId: item.actionId }));
      const failed: PreviewEnvironmentResult = {
        schemaVersion: 1,
        status: completed.length ? "partial" : "error",
        startedAt,
        finishedAt: new Date().toISOString(),
        steps: completed,
        remaining,
        artifactPath: targetArtifact,
        summary: `Preview provisioning stopped before ${step.providerId}/${step.actionId}: ${error instanceof Error ? error.message : String(error)}`,
      };
      await writeJsonAtomic(targetArtifact, { schemaVersion: 1, plan, result: failed });
      return failed;
    }
    completed.push(result);
    if (result.status !== "success") {
      failedAt = index;
      break;
    }
  }

  const remaining = failedAt >= 0
    ? plan.steps.slice(failedAt + 1).map((item) => ({ providerId: item.providerId, actionId: item.actionId }))
    : [];
  const status: PreviewEnvironmentResult["status"] = failedAt >= 0 ? "partial" : "success";
  const targetArtifact = bundleArtifactPath(root);
  const result: PreviewEnvironmentResult = {
    schemaVersion: 1,
    status,
    startedAt,
    finishedAt: new Date().toISOString(),
    steps: completed,
    remaining,
    artifactPath: targetArtifact,
    summary: status === "success"
      ? "Every requested preview provider step completed and passed its post-action verification."
      : "Preview provisioning stopped after a provider step failed or could not be verified; remaining steps were not executed.",
  };
  await writeJsonAtomic(targetArtifact, { schemaVersion: 1, plan, result });
  return result;
}
