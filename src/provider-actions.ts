import { relative, resolve } from "node:path";
import { providerAdapter } from "./provider-adapters.js";
import { probeProvider } from "./provider-detection.js";
import { writeJsonAtomic } from "./fs-utils.js";
import { commandExists, run } from "./process.js";
import { projectDirectory, projectIdForRoot } from "./project.js";
import type { ProviderEnvironment } from "./types.js";

export type ProviderActionId =
  | "workflow-dispatch"
  | "preview-deploy"
  | "production-deploy"
  | "worker-preview-upload"
  | "pages-preview-deploy"
  | "preview-branch-create"
  | "functions-deploy";

export interface ProviderActionDefinition {
  providerId: "github" | "vercel" | "cloudflare" | "supabase";
  id: ProviderActionId;
  displayName: string;
  description: string;
  environments: ProviderEnvironment[];
  requiredParams: string[];
  optionalParams: string[];
  requiresAuthenticated: boolean;
  requiresLinked: boolean;
  timeoutMs: number;
  notes: string[];
}

export interface ProviderActionRequest {
  providerId: string;
  actionId: string;
  environment: ProviderEnvironment;
  params?: Record<string, string>;
}

export interface ProviderActionVerificationPlan {
  strategy: "command" | "vercel-deployment-url";
  command?: string;
  args?: string[];
  timeoutMs: number;
  description: string;
}

export interface ProviderActionPlan {
  schemaVersion: 1;
  providerId: string;
  actionId: string;
  displayName: string;
  environment: ProviderEnvironment;
  createdAt: string;
  command: string;
  args: string[];
  timeoutMs: number;
  params: Record<string, string>;
  mutating: true;
  approvalRequired: true;
  productionApprovalRequired: boolean;
  requiresAuthenticated: boolean;
  requiresLinked: boolean;
  verification: ProviderActionVerificationPlan;
  notes: string[];
}

export interface ProviderActionExecutionResult {
  schemaVersion: 1;
  providerId: string;
  actionId: string;
  environment: ProviderEnvironment;
  status: "success" | "verification-failed" | "error";
  startedAt: string;
  finishedAt: string;
  command: { executable: string; args: string[]; status: number | null; stdout: string; stderr: string };
  verification?: { executable: string; args: string[]; status: number | null; stdout: string; stderr: string };
  reference?: string;
  artifactPath: string;
  summary: string;
}

export interface ProviderActionApprovals {
  approve?: boolean;
  approveProduction?: boolean;
}

const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SAFE_PROJECT_REF = /^[a-z0-9][a-z0-9-]{3,79}$/;
const SAFE_GIT_REF = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/;
const SAFE_WORKFLOW = /^[A-Za-z0-9._/-]{1,200}$/;

export const providerActionDefinitions: ProviderActionDefinition[] = [
  {
    providerId: "github",
    id: "workflow-dispatch",
    displayName: "Dispatch GitHub workflow",
    description: "Trigger an existing workflow_dispatch workflow at an explicit branch or tag.",
    environments: ["preview", "production"],
    requiredParams: ["workflow"],
    optionalParams: ["ref"],
    requiresAuthenticated: true,
    requiresLinked: true,
    timeoutMs: 30_000,
    notes: [
      "DockyardOS does not pass arbitrary workflow inputs in P9 so secrets cannot be embedded in action plans or audit artifacts.",
      "The selected workflow may itself perform high-impact operations; production dispatch requires the additional production approval flag.",
    ],
  },
  {
    providerId: "vercel",
    id: "preview-deploy",
    displayName: "Deploy Vercel preview",
    description: "Create a Vercel preview deployment from the already-linked project.",
    environments: ["preview"],
    requiredParams: [],
    optionalParams: ["prebuilt"],
    requiresAuthenticated: true,
    requiresLinked: true,
    timeoutMs: 300_000,
    notes: ["Vercel preview deploy stdout is treated only as a candidate deployment URL and is verified with `vercel inspect --wait`."],
  },
  {
    providerId: "vercel",
    id: "production-deploy",
    displayName: "Deploy Vercel production",
    description: "Create a Vercel production deployment from the already-linked project.",
    environments: ["production"],
    requiredParams: [],
    optionalParams: ["prebuilt"],
    requiresAuthenticated: true,
    requiresLinked: true,
    timeoutMs: 300_000,
    notes: ["Production deployment requires both general mutation approval and explicit production approval."],
  },
  {
    providerId: "cloudflare",
    id: "worker-preview-upload",
    displayName: "Upload Cloudflare Worker preview version",
    description: "Upload a Worker version without deploying it to production traffic.",
    environments: ["preview"],
    requiredParams: [],
    optionalParams: ["path", "name", "alias"],
    requiresAuthenticated: true,
    requiresLinked: false,
    timeoutMs: 180_000,
    notes: ["Uses `wrangler versions upload`; it creates a version but does not deploy that version to production traffic."],
  },
  {
    providerId: "cloudflare",
    id: "pages-preview-deploy",
    displayName: "Deploy Cloudflare Pages preview",
    description: "Deploy a project-local static output directory to a non-production Pages branch.",
    environments: ["preview"],
    requiredParams: ["directory", "project", "branch"],
    optionalParams: [],
    requiresAuthenticated: true,
    requiresLinked: false,
    timeoutMs: 180_000,
    notes: ["The upload directory must stay inside the current project root.", "Use a non-production branch name; P9 refuses common production branch names."],
  },
  {
    providerId: "supabase",
    id: "preview-branch-create",
    displayName: "Create Supabase preview branch",
    description: "Create an ephemeral Supabase preview branch for an explicit parent project ref.",
    environments: ["preview"],
    requiredParams: ["project-ref", "branch"],
    optionalParams: [],
    requiresAuthenticated: true,
    requiresLinked: false,
    timeoutMs: 180_000,
    notes: ["P9 intentionally does not request `--with-data` or `--persistent`; preview branches remain minimal and ephemeral by default."],
  },
  {
    providerId: "supabase",
    id: "functions-deploy",
    displayName: "Deploy Supabase Edge Function",
    description: "Deploy one Edge Function to an explicit Supabase project ref.",
    environments: ["preview", "production"],
    requiredParams: ["project-ref", "function"],
    optionalParams: ["use-api"],
    requiresAuthenticated: true,
    requiresLinked: false,
    timeoutMs: 180_000,
    notes: [
      "The project ref is mandatory so DockyardOS never relies on an implicit linked database target for this mutation.",
      "P9 does not expose destructive function delete/prune or JWT-disable flags through this action adapter.",
    ],
  },
];

function definition(providerId: string, actionId: string): ProviderActionDefinition {
  const match = providerActionDefinitions.find((item) => item.providerId === providerId && item.id === actionId);
  if (!match) throw new Error(`Unsupported provider action: ${providerId}/${actionId}`);
  return match;
}

function safeText(value: string, label: string, pattern = SAFE_NAME): string {
  const trimmed = value.trim();
  if (!pattern.test(trimmed) || trimmed.startsWith("-") || trimmed.includes("..") || trimmed.includes("@{")) {
    throw new Error(`${label} contains unsupported or unsafe characters.`);
  }
  return trimmed;
}

function safeGitRef(value: string, label: string): string {
  const ref = safeText(value, label, SAFE_GIT_REF);
  if (ref.endsWith("/") || ref.endsWith(".") || ref.endsWith(".lock") || ref.includes("//") || ref.includes("/.")) {
    throw new Error(`${label} is not a safe Git ref.`);
  }
  return ref;
}

function safeProjectPath(root: string, value: string, label: string): string {
  const raw = value.trim();
  if (!raw || raw.startsWith("-") || raw.includes("\0")) throw new Error(`${label} is invalid.`);
  const absolute = resolve(root, raw);
  const rel = relative(resolve(root), absolute);
  if (rel === ".." || rel.startsWith("../") || rel.startsWith("..\\") || rel.startsWith("/") || rel.startsWith("\\")) {
    throw new Error(`${label} must stay inside the current project root.`);
  }
  return rel === "" ? "." : rel.replace(/\\/g, "/");
}

function providerCli(command: string, npmPackage: string): { command: string; prefix: string[] } {
  if (process.platform === "win32" && commandExists("npx")) return { command: "npx", prefix: ["-y", npmPackage] };
  if (commandExists(command)) return { command, prefix: [] };
  if (commandExists("npx")) return { command: "npx", prefix: ["-y", npmPackage] };
  return { command, prefix: [] };
}

function boolParam(params: Record<string, string>, name: string): boolean {
  const raw = params[name];
  if (raw === undefined) return false;
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  throw new Error(`${name} must be true/false or 1/0.`);
}

function validatedParams(
  root: string,
  action: ProviderActionDefinition,
  supplied: Record<string, string>,
): Record<string, string> {
  const allowed = new Set([...action.requiredParams, ...action.optionalParams]);
  for (const key of Object.keys(supplied)) if (!allowed.has(key)) throw new Error(`Unknown parameter for ${action.providerId}/${action.id}: ${key}`);
  for (const key of action.requiredParams) if (!supplied[key]?.trim()) throw new Error(`Missing required provider action parameter: ${key}`);

  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(supplied)) {
    if (key === "directory" || key === "path") params[key] = safeProjectPath(root, value, key);
    else if (key === "project-ref") params[key] = safeText(value, key, SAFE_PROJECT_REF);
    else if (key === "ref" || key === "branch") params[key] = safeGitRef(value, key);
    else if (key === "workflow") params[key] = safeText(value, key, SAFE_WORKFLOW);
    else if (key === "prebuilt" || key === "use-api") params[key] = boolParam(supplied, key) ? "true" : "false";
    else params[key] = safeText(value, key);
  }

  if (action.id === "pages-preview-deploy") {
    const branch = params.branch!.toLowerCase();
    if (["main", "master", "production", "prod"].includes(branch)) {
      throw new Error("Cloudflare Pages preview branch must not be a common production branch name.");
    }
  }
  return params;
}

function commandPlan(
  action: ProviderActionDefinition,
  params: Record<string, string>,
): { command: string; args: string[]; verification: ProviderActionVerificationPlan } {
  if (action.providerId === "github" && action.id === "workflow-dispatch") {
    const args = ["workflow", "run", params.workflow!];
    if (params.ref) args.push("--ref", params.ref);
    const verifyArgs = ["run", "list", "--workflow", params.workflow!];
    if (params.ref) verifyArgs.push("--branch", params.ref);
    verifyArgs.push("--limit", "1", "--json", "databaseId,status,conclusion,url,headBranch,headSha");
    return {
      command: "gh",
      args,
      verification: {
        strategy: "command",
        command: "gh",
        args: verifyArgs,
        timeoutMs: 30_000,
        description: "List the newest matching workflow run after dispatch.",
      },
    };
  }

  if (action.providerId === "vercel" && (action.id === "preview-deploy" || action.id === "production-deploy")) {
    const cli = providerCli("vercel", "vercel@latest");
    const args = [...cli.prefix, "deploy", "--yes"];
    if (params.prebuilt === "true") args.push("--prebuilt");
    if (action.id === "production-deploy") args.push("--prod");
    return {
      command: cli.command,
      args,
      verification: {
        strategy: "vercel-deployment-url",
        command: cli.command,
        args: cli.prefix,
        timeoutMs: 180_000,
        description: "Parse the HTTPS deployment URL from deploy stdout and verify it with the same Vercel CLI launcher.",
      },
    };
  }

  if (action.providerId === "cloudflare" && action.id === "worker-preview-upload") {
    const cli = providerCli("wrangler", "wrangler@latest");
    const args = [...cli.prefix, "versions", "upload"];
    if (params.path) args.push(params.path);
    if (params.name) args.push("--name", params.name);
    if (params.alias) args.push("--preview-alias", params.alias);
    const verifyArgs = ["versions", "list"];
    if (params.name) verifyArgs.push("--name", params.name);
    verifyArgs.push("--json");
    return {
      command: cli.command,
      args,
      verification: {
        strategy: "command",
        command: cli.command,
        args: [...cli.prefix, ...verifyArgs],
        timeoutMs: 60_000,
        description: "List recent Worker versions after the preview upload.",
      },
    };
  }

  if (action.providerId === "cloudflare" && action.id === "pages-preview-deploy") {
    const cli = providerCli("wrangler", "wrangler@latest");
    return {
      command: cli.command,
      args: [...cli.prefix, "pages", "deploy", params.directory!, "--project-name", params.project!, "--branch", params.branch!],
      verification: {
        strategy: "command",
        command: cli.command,
        args: [...cli.prefix, "pages", "deployment", "list", "--project-name", params.project!, "--environment", "preview", "--json"],
        timeoutMs: 60_000,
        description: "List preview deployments for the explicit Cloudflare Pages project.",
      },
    };
  }

  if (action.providerId === "supabase" && action.id === "preview-branch-create") {
    const cli = providerCli("supabase", "supabase@latest");
    return {
      command: cli.command,
      args: [...cli.prefix, "branches", "create", params.branch!, "--project-ref", params["project-ref"]!],
      verification: {
        strategy: "command",
        command: cli.command,
        args: [...cli.prefix, "branches", "get", params.branch!, "--project-ref", params["project-ref"]!],
        timeoutMs: 60_000,
        description: "Retrieve the explicit Supabase preview branch after creation.",
      },
    };
  }

  if (action.providerId === "supabase" && action.id === "functions-deploy") {
    const cli = providerCli("supabase", "supabase@latest");
    const args = [...cli.prefix, "functions", "deploy", params.function!, "--project-ref", params["project-ref"]!];
    if (params["use-api"] === "true") args.push("--use-api");
    return {
      command: cli.command,
      args,
      verification: {
        strategy: "command",
        command: cli.command,
        args: [...cli.prefix, "functions", "list", "--project-ref", params["project-ref"]!],
        timeoutMs: 60_000,
        description: "List Edge Functions on the explicit target project after deployment.",
      },
    };
  }

  throw new Error(`Provider action command builder is missing for ${action.providerId}/${action.id}.`);
}

export function listProviderActions(providerId?: string): ProviderActionDefinition[] {
  return providerActionDefinitions.filter((item) => !providerId || item.providerId === providerId);
}

export function planProviderAction(root: string, request: ProviderActionRequest): ProviderActionPlan {
  const action = definition(request.providerId, request.actionId);
  if (!action.environments.includes(request.environment)) {
    throw new Error(`${action.providerId}/${action.id} does not support ${request.environment} environment.`);
  }
  const params = validatedParams(root, action, request.params ?? {});
  const built = commandPlan(action, params);
  return {
    schemaVersion: 1,
    providerId: action.providerId,
    actionId: action.id,
    displayName: action.displayName,
    environment: request.environment,
    createdAt: new Date().toISOString(),
    command: built.command,
    args: built.args,
    timeoutMs: action.timeoutMs,
    params,
    mutating: true,
    approvalRequired: true,
    productionApprovalRequired: request.environment === "production",
    requiresAuthenticated: action.requiresAuthenticated,
    requiresLinked: action.requiresLinked,
    verification: built.verification,
    notes: action.notes,
  };
}

export function assertProviderActionApproval(plan: ProviderActionPlan, approvals: ProviderActionApprovals): void {
  if (!approvals.approve) throw new Error(`Provider action ${plan.providerId}/${plan.actionId} is mutating and requires explicit --approve.`);
  if (plan.productionApprovalRequired && !approvals.approveProduction) {
    throw new Error(`Production provider action ${plan.providerId}/${plan.actionId} requires explicit --approve-production in addition to --approve.`);
  }
}

function httpsReference(stdout: string): string | undefined {
  const match = stdout.match(/https:\/\/[^\s\]\[()<>"']+/i);
  if (!match) return undefined;
  try {
    const url = new URL(match[0]);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function artifactPath(root: string, plan: ProviderActionPlan): string {
  const stamp = new Date().toISOString().replace(/[-:.]/g, "");
  const safeAction = `${plan.providerId}-${plan.actionId}`.replace(/[^A-Za-z0-9._-]/g, "-");
  return resolve(projectDirectory(projectIdForRoot(root)), "providers", "actions", `${stamp}-${safeAction}.json`);
}

export async function executeProviderAction(
  root: string,
  plan: ProviderActionPlan,
  approvals: ProviderActionApprovals = {},
): Promise<ProviderActionExecutionResult> {
  assertProviderActionApproval(plan, approvals);
  const adapter = providerAdapter(plan.providerId);
  if (!adapter) throw new Error(`Provider adapter is unavailable: ${plan.providerId}`);
  if (!commandExists(plan.command)) throw new Error(`Provider action CLI is not installed: ${plan.command}`);

  const probe = await probeProvider(adapter, root, { live: true });
  if (plan.requiresAuthenticated && probe.authenticated !== true) {
    throw new Error(`${adapter.displayName} live authentication could not be verified; mutation refused.`);
  }
  if (plan.requiresLinked && probe.linked !== true) {
    throw new Error(`${adapter.displayName} project linkage could not be verified; mutation refused.`);
  }

  const startedAt = new Date().toISOString();
  const targetArtifact = artifactPath(root, plan);
  const mutation = run(plan.command, plan.args, {
    cwd: root,
    timeoutMs: plan.timeoutMs,
    maxOutputBytes: 64 * 1024,
  });

  let reference: string | undefined;
  let verification: ProviderActionExecutionResult["verification"];
  let status: ProviderActionExecutionResult["status"] = mutation.ok ? "success" : "error";
  let summary = mutation.ok ? "Provider mutation command completed." : "Provider mutation command failed.";

  if (mutation.ok) {
    let verifyCommand: string | undefined;
    let verifyArgs: string[] | undefined;
    if (plan.verification.strategy === "vercel-deployment-url") {
      reference = httpsReference(mutation.stdout);
      if (!reference) {
        status = "verification-failed";
        summary = "Vercel mutation succeeded but no HTTPS deployment URL could be safely extracted for verification.";
      } else {
        verifyCommand = plan.verification.command ?? "vercel";
        verifyArgs = [...(plan.verification.args ?? []), "inspect", reference, "--wait"];
      }
    } else {
      verifyCommand = plan.verification.command;
      verifyArgs = plan.verification.args;
    }

    if (verifyCommand && verifyArgs) {
      const checked = run(verifyCommand, verifyArgs, {
        cwd: root,
        timeoutMs: plan.verification.timeoutMs,
        maxOutputBytes: 64 * 1024,
      });
      verification = {
        executable: verifyCommand,
        args: verifyArgs,
        status: checked.status,
        stdout: checked.stdout,
        stderr: checked.stderr,
      };
      if (!checked.ok) {
        status = "verification-failed";
        summary = "Provider mutation completed but post-action verification failed.";
      } else {
        summary = "Provider mutation completed and post-action verification succeeded.";
      }
    }
  }

  const result: ProviderActionExecutionResult = {
    schemaVersion: 1,
    providerId: plan.providerId,
    actionId: plan.actionId,
    environment: plan.environment,
    status,
    startedAt,
    finishedAt: new Date().toISOString(),
    command: {
      executable: plan.command,
      args: plan.args,
      status: mutation.status,
      stdout: mutation.stdout,
      stderr: mutation.stderr,
    },
    ...(verification ? { verification } : {}),
    ...(reference ? { reference } : {}),
    artifactPath: targetArtifact,
    summary,
  };
  await writeJsonAtomic(targetArtifact, { schemaVersion: 1, plan, result });
  return result;
}
