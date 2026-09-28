import { relative, resolve } from "node:path";
import { writeJsonAtomic } from "./fs-utils.js";
import { providerAdapter } from "./provider-adapters.js";
import { probeProvider } from "./provider-detection.js";
import {
  assertProviderActionApproval,
  type ProviderActionApprovals,
  type ProviderActionExecutionResult,
  type ProviderActionPlan,
  type ProviderActionRequest,
  type ProviderActionVerificationPlan,
} from "./provider-actions.js";
import { commandExists, run } from "./process.js";
import { projectDirectory, projectIdForRoot } from "./project.js";
import type { ProviderEnvironment } from "./types.js";

export interface AlternativeProviderActionDefinition {
  providerId: "neon" | "firebase" | "railway" | "render" | "appwrite";
  id: string;
  displayName: string;
  description: string;
  environments: ProviderEnvironment[];
  requiredParams: string[];
  optionalParams: string[];
  requiresLinked: boolean;
  timeoutMs: number;
  authProbe: { command: string; args: string[]; timeoutMs: number };
  notes: string[];
}

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SAFE_BRANCH = /^[A-Za-z0-9][A-Za-z0-9._\/-]{0,159}$/;
const COMMIT_SHA = /^[a-f0-9]{40}$/i;

export const alternativeProviderActionDefinitions: AlternativeProviderActionDefinition[] = [
  {
    providerId: "neon",
    id: "preview-branch-create",
    displayName: "Create Neon preview branch",
    description: "Create an isolated Neon branch in an explicit project for preview/test work.",
    environments: ["preview"],
    requiredParams: ["project", "branch"],
    optionalParams: [],
    requiresLinked: false,
    timeoutMs: 120_000,
    authProbe: { command: "neon", args: ["projects", "list", "--output", "json"], timeoutMs: 15_000 },
    notes: [
      "Uses the current Neon CLI with explicit project/branch parameters and --no-secrets so connection credentials are not returned to DockyardOS logs or audit artifacts.",
      "Preview branch names commonly use preview/...; common production branch names are refused for this action.",
      "P21 creates from the project's default branch only; alternate-parent branching stays unexposed until its current CLI contract is independently pinned.",
    ],
  },
  {
    providerId: "firebase",
    id: "hosting-preview-deploy",
    displayName: "Deploy Firebase Hosting preview",
    description: "Deploy Hosting content to an explicit Firebase preview channel.",
    environments: ["preview"],
    requiredParams: ["project", "channel"],
    optionalParams: ["target"],
    requiresLinked: false,
    timeoutMs: 180_000,
    authProbe: { command: "firebase", args: ["projects:list", "--json"], timeoutMs: 15_000 },
    notes: [
      "Preview URLs are public to anyone who knows the URL and normally use the target project's real backend resources.",
      "The Firebase project is explicit; DockyardOS does not rely on the current CLI default project for this mutation.",
    ],
  },
  {
    providerId: "firebase",
    id: "hosting-production-deploy",
    displayName: "Deploy Firebase Hosting production",
    description: "Deploy Hosting content to the live channel of an explicit Firebase project.",
    environments: ["production"],
    requiredParams: ["project"],
    optionalParams: ["target"],
    requiresLinked: false,
    timeoutMs: 180_000,
    authProbe: { command: "firebase", args: ["projects:list", "--json"], timeoutMs: 15_000 },
    notes: ["Production Hosting deploy requires both --approve and --approve-production."],
  },
  {
    providerId: "railway",
    id: "service-deploy",
    displayName: "Deploy Railway service",
    description: "Upload project source to an explicit Railway project/environment/service.",
    environments: ["preview", "production"],
    requiredParams: ["project", "railway-environment", "service"],
    optionalParams: ["path"],
    requiresLinked: false,
    timeoutMs: 300_000,
    authProbe: { command: "railway", args: ["whoami"], timeoutMs: 10_000 },
    notes: [
      "Uses Railway CI/JSON mode with explicit project, environment, and service instead of interactive linking.",
      "Railway up --ci exits non-zero when deployment fails; post-action verification reads bounded logs using the same explicit target.",
      "A preview Dockyard environment refuses common production Railway environment names.",
    ],
  },
  {
    providerId: "render",
    id: "service-deploy",
    displayName: "Deploy Render service",
    description: "Trigger and wait for a deploy of an explicit Render service, optionally pinned to a full Git commit.",
    environments: ["preview", "production"],
    requiredParams: ["service"],
    optionalParams: ["commit"],
    requiresLinked: false,
    timeoutMs: 300_000,
    authProbe: { command: "render", args: ["workspaces", "--output", "json"], timeoutMs: 15_000 },
    notes: [
      "Uses the current Render CLI instead of secret deploy-hook URLs, so secrets are not embedded in plans or audit artifacts.",
      "If commit is supplied DockyardOS requires a full 40-character SHA.",
    ],
  },
  {
    providerId: "appwrite",
    id: "function-deploy",
    displayName: "Deploy Appwrite function",
    description: "Push one configured Appwrite Function non-interactively from the linked project configuration.",
    environments: ["preview", "production"],
    requiredParams: ["function-id"],
    optionalParams: [],
    requiresLinked: true,
    timeoutMs: 240_000,
    authProbe: { command: "appwrite", args: ["whoami", "--json"], timeoutMs: 15_000 },
    notes: [
      "Appwrite target project/endpoint come from appwrite.config.json; preview use should point that config at a dedicated non-production project.",
      "Only one explicit function id is pushed; DockyardOS does not expose push-all or database/storage mutation through P21.",
    ],
  },
];

function definition(providerId: string, actionId: string): AlternativeProviderActionDefinition {
  const action = alternativeProviderActionDefinitions.find((item) => item.providerId === providerId && item.id === actionId);
  if (!action) throw new Error(`Unsupported alternative provider action: ${providerId}/${actionId}`);
  return action;
}

function safeIdentifier(value: string, label: string): string {
  const trimmed = value.trim();
  if (!SAFE_IDENTIFIER.test(trimmed) || trimmed.startsWith("-") || trimmed.includes("..") || trimmed.includes("@{")) {
    throw new Error(`${label} contains unsupported or unsafe characters.`);
  }
  return trimmed;
}

function safeBranch(value: string, label: string): string {
  const trimmed = value.trim();
  if (!SAFE_BRANCH.test(trimmed)
    || trimmed.startsWith("-")
    || trimmed.includes("..")
    || trimmed.includes("//")
    || trimmed.includes("@{")
    || trimmed.endsWith("/")
    || trimmed.endsWith(".")
    || trimmed.endsWith(".lock")) {
    throw new Error(`${label} is not a safe branch/channel name.`);
  }
  return trimmed;
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

function validatedParams(
  root: string,
  action: AlternativeProviderActionDefinition,
  environment: ProviderEnvironment,
  supplied: Record<string, string>,
): Record<string, string> {
  const allowed = new Set([...action.requiredParams, ...action.optionalParams]);
  for (const key of Object.keys(supplied)) if (!allowed.has(key)) throw new Error(`Unknown parameter for ${action.providerId}/${action.id}: ${key}`);
  for (const key of action.requiredParams) if (!supplied[key]?.trim()) throw new Error(`Missing required provider action parameter: ${key}`);

  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(supplied)) {
    if (key === "path") result[key] = safeProjectPath(root, value, key);
    else if (key === "branch" || key === "channel") result[key] = safeBranch(value, key);
    else if (key === "commit") {
      const commit = value.trim().toLowerCase();
      if (!COMMIT_SHA.test(commit)) throw new Error("Render commit must be a full 40-character Git SHA.");
      result[key] = commit;
    } else result[key] = safeIdentifier(value, key);
  }

  const previewReserved = new Set(["main", "master", "production", "prod", "live"]);
  if (environment === "preview") {
    const previewName = (result.branch ?? result.channel ?? result["railway-environment"] ?? "").toLowerCase();
    if (previewName && previewReserved.has(previewName)) throw new Error("Preview action refuses a common production branch/channel/environment name.");
  }
  return result;
}

function commandPlan(
  action: AlternativeProviderActionDefinition,
  environment: ProviderEnvironment,
  params: Record<string, string>,
): { command: string; args: string[]; verification: ProviderActionVerificationPlan } {
  if (action.providerId === "neon" && action.id === "preview-branch-create") {
    return {
      command: "neon",
      args: ["branches", "create", "--project-id", params.project!, "--name", params.branch!, "--output", "json", "--no-secrets"],
      verification: {
        strategy: "command",
        command: "neon",
        args: ["branches", "list", "--project-id", params.project!, "--output", "json"],
        timeoutMs: 30_000,
        description: "List branches for the explicit Neon project after branch creation.",
      },
    };
  }

  if (action.providerId === "firebase" && action.id === "hosting-preview-deploy") {
    const args = ["hosting:channel:deploy", params.channel!, "--project", params.project!, "--json"];
    if (params.target) args.push("--only", params.target);
    return {
      command: "firebase",
      args,
      verification: {
        strategy: "command",
        command: "firebase",
        args: ["hosting:channel:list", "--project", params.project!, "--json"],
        timeoutMs: 30_000,
        description: "List Hosting channels for the explicit Firebase project after preview deploy.",
      },
    };
  }

  if (action.providerId === "firebase" && action.id === "hosting-production-deploy") {
    const only = params.target ? `hosting:${params.target}` : "hosting";
    return {
      command: "firebase",
      args: ["deploy", "--project", params.project!, "--only", only, "--json"],
      verification: {
        strategy: "command",
        command: "firebase",
        args: ["hosting:channel:list", "--project", params.project!, "--json"],
        timeoutMs: 30_000,
        description: "List Hosting channels including live after the explicit Firebase production deploy.",
      },
    };
  }

  if (action.providerId === "railway" && action.id === "service-deploy") {
    const args = ["up"];
    if (params.path) args.push(params.path);
    args.push(
      "--project", params.project!,
      "--environment", params["railway-environment"]!,
      "--service", params.service!,
      "--ci", "--json",
    );
    return {
      command: "railway",
      args,
      verification: {
        strategy: "command",
        command: "railway",
        args: [
          "logs",
          "--project", params.project!,
          "--environment", params["railway-environment"]!,
          "--service", params.service!,
          "--lines", "1",
        ],
        timeoutMs: 45_000,
        description: "Read one bounded log line using the same explicit Railway project/environment/service after the CI deploy succeeds.",
      },
    };
  }

  if (action.providerId === "render" && action.id === "service-deploy") {
    const args = ["deploys", "create", params.service!, "--wait", "--output", "json", "--confirm"];
    if (params.commit) args.push("--commit", params.commit);
    return {
      command: "render",
      args,
      verification: {
        strategy: "command",
        command: "render",
        args: ["deploys", "list", params.service!, "--output", "json"],
        timeoutMs: 45_000,
        description: "List deploys for the explicit Render service after the waited deploy.",
      },
    };
  }

  if (action.providerId === "appwrite" && action.id === "function-deploy") {
    return {
      command: "appwrite",
      args: ["push", "functions", "--function-id", params["function-id"]!, "--force", "--json"],
      verification: {
        strategy: "command",
        command: "appwrite",
        args: ["functions", "list", "--json"],
        timeoutMs: 45_000,
        description: "List functions in the linked Appwrite project after pushing the selected function.",
      },
    };
  }

  throw new Error(`Alternative provider action command builder is missing for ${action.providerId}/${action.id}/${environment}.`);
}

export function isAlternativeProviderAction(providerId: string, actionId: string): boolean {
  return alternativeProviderActionDefinitions.some((item) => item.providerId === providerId && item.id === actionId);
}

export function listAlternativeProviderActions(providerId?: string): AlternativeProviderActionDefinition[] {
  return alternativeProviderActionDefinitions.filter((item) => !providerId || item.providerId === providerId);
}

export function planAlternativeProviderAction(root: string, request: ProviderActionRequest): ProviderActionPlan {
  const action = definition(request.providerId, request.actionId);
  if (!action.environments.includes(request.environment)) {
    throw new Error(`${action.providerId}/${action.id} does not support ${request.environment} environment.`);
  }
  const params = validatedParams(root, action, request.environment, request.params ?? {});
  const built = commandPlan(action, request.environment, params);
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
    requiresAuthenticated: true,
    requiresLinked: action.requiresLinked,
    verification: built.verification,
    notes: action.notes,
  };
}

function artifactPath(root: string, plan: ProviderActionPlan): string {
  const stamp = new Date().toISOString().replace(/[-:.]/g, "");
  const safeAction = `${plan.providerId}-${plan.actionId}`.replace(/[^A-Za-z0-9._-]/g, "-");
  return resolve(projectDirectory(projectIdForRoot(root)), "providers", "actions", `${stamp}-${safeAction}.json`);
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

export async function executeAlternativeProviderAction(
  root: string,
  plan: ProviderActionPlan,
  approvals: ProviderActionApprovals = {},
): Promise<ProviderActionExecutionResult> {
  assertProviderActionApproval(plan, approvals);
  const action = definition(plan.providerId, plan.actionId);
  if (!commandExists(plan.command)) throw new Error(`Provider action CLI is not installed: ${plan.command}`);

  const auth = run(action.authProbe.command, action.authProbe.args, {
    cwd: root,
    timeoutMs: action.authProbe.timeoutMs,
    maxOutputBytes: 16 * 1024,
  });
  if (!auth.ok) throw new Error(`${action.displayName} authentication could not be verified; mutation refused.`);

  if (action.requiresLinked) {
    const adapter = providerAdapter(action.providerId);
    if (!adapter) throw new Error(`Provider adapter is unavailable: ${action.providerId}`);
    const probe = await probeProvider(adapter, root, { live: false });
    if (probe.linked !== true) throw new Error(`${adapter.displayName} project linkage could not be verified; mutation refused.`);
  }

  const startedAt = new Date().toISOString();
  const targetArtifact = artifactPath(root, plan);
  const mutation = run(plan.command, plan.args, {
    cwd: root,
    timeoutMs: plan.timeoutMs,
    maxOutputBytes: 64 * 1024,
  });

  let reference = mutation.ok ? httpsReference(mutation.stdout) : undefined;
  let verification: ProviderActionExecutionResult["verification"];
  let status: ProviderActionExecutionResult["status"] = mutation.ok ? "success" : "error";
  let summary = mutation.ok ? "Provider mutation command completed." : "Provider mutation command failed.";

  if (mutation.ok && plan.verification.command && plan.verification.args) {
    const checked = run(plan.verification.command, plan.verification.args, {
      cwd: root,
      timeoutMs: plan.verification.timeoutMs,
      maxOutputBytes: 64 * 1024,
    });
    verification = {
      executable: plan.verification.command,
      args: plan.verification.args,
      status: checked.status,
      stdout: checked.stdout,
      stderr: checked.stderr,
    };
    if (!checked.ok) {
      status = "verification-failed";
      summary = "Provider mutation completed but post-action verification failed.";
    } else {
      summary = "Provider mutation completed and post-action verification succeeded.";
      if (!reference) reference = httpsReference(checked.stdout);
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
