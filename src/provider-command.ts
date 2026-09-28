import type { ProviderEnvironment } from "./types.js";
import { executeProviderAction, listProviderActions, planProviderAction } from "./provider-action-router.js";
import { checkProviderHealthSet, providerHealthExitCode } from "./provider-health.js";
import { executePreviewEnvironment, planPreviewEnvironment, type PreviewDatabaseTarget, type PreviewWebTarget, type PreviewWorkflowTarget } from "./provider-preview.js";

function value(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function has(args: string[], name: string): boolean {
  return args.includes(name);
}

function params(args: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] !== "--param") continue;
    const pair = args[i + 1];
    if (!pair) throw new Error("--param requires key=value");
    const separator = pair.indexOf("=");
    if (separator <= 0) throw new Error(`Invalid --param value (expected key=value): ${pair}`);
    const key = pair.slice(0, separator).trim();
    const val = pair.slice(separator + 1);
    if (!key || Object.prototype.hasOwnProperty.call(result, key)) throw new Error(`Duplicate/invalid provider action parameter: ${key || pair}`);
    result[key] = val;
    i += 1;
  }
  return result;
}

function environment(args: string[]): ProviderEnvironment {
  const raw = value(args, "--environment") ?? "preview";
  if (!["preview", "production"].includes(raw)) throw new Error("Provider actions support only preview or production environments.");
  return raw as ProviderEnvironment;
}

function previewRequest(args: string[]) {
  const web = value(args, "--web");
  const database = value(args, "--database");
  const workflow = value(args, "--workflow");
  if (web && !["vercel", "cloudflare-pages", "cloudflare-worker"].includes(web)) throw new Error("--web must be vercel, cloudflare-pages, or cloudflare-worker");
  if (database && database !== "supabase") throw new Error("--database currently supports only supabase");
  if (workflow && workflow !== "github") throw new Error("--workflow currently supports only github");
  return {
    ...(web ? { web: web as PreviewWebTarget } : {}),
    ...(database ? { database: database as PreviewDatabaseTarget } : {}),
    ...(workflow ? { workflow: workflow as PreviewWorkflowTarget } : {}),
    params: params(args),
  };
}

function healthIds(args: string[]): string[] | undefined {
  const raw = value(args, "--provider");
  if (!raw) return undefined;
  const ids = raw.split(",").map((item) => item.trim()).filter(Boolean);
  if (!ids.length) throw new Error("--provider must contain at least one provider id.");
  return ids;
}

function healthTimeout(args: string[]): number | undefined {
  const raw = value(args, "--timeout-ms");
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1_000 || parsed > 15_000) {
    throw new Error("--timeout-ms must be an integer from 1000 through 15000.");
  }
  return parsed;
}

export async function handleProviderActionCommand(root: string, args: string[]): Promise<void> {
  const subcommand = args[0] ?? "actions";
  const rest = args.slice(1);

  if (subcommand === "health") {
    const results = await checkProviderHealthSet({ ids: healthIds(rest), timeoutMs: healthTimeout(rest) });
    const exitCode = providerHealthExitCode(results);
    console.log(JSON.stringify({
      schemaVersion: 1,
      checkedAt: new Date().toISOString(),
      health: exitCode === 0 ? "healthy" : exitCode === 1 ? "degraded-or-outage" : "verification-incomplete",
      exitCode,
      providers: results,
    }, null, 2));
    process.exitCode = exitCode;
    return;
  }

  if (subcommand === "actions") {
    const providerId = value(rest, "--provider");
    console.log(JSON.stringify(listProviderActions(providerId).map((action) => ({
      providerId: action.providerId,
      actionId: action.id,
      name: action.displayName,
      description: action.description,
      environments: action.environments,
      requiredParams: action.requiredParams,
      optionalParams: action.optionalParams,
      requiresAuthenticated: action.requiresAuthenticated,
      requiresLinked: action.requiresLinked,
      notes: action.notes,
    })), null, 2));
    return;
  }

  if (subcommand === "action") {
    const operation = rest[0] ?? "plan";
    const actionArgs = rest.slice(1);
    if (!["plan", "run"].includes(operation)) throw new Error("Usage: dockyard providers action plan|run --provider ID --action ID --environment preview|production [--param key=value] [--approve] [--approve-production]");
    const providerId = value(actionArgs, "--provider");
    const actionId = value(actionArgs, "--action");
    if (!providerId || !actionId) throw new Error("providers action requires --provider and --action");
    const plan = planProviderAction(root, {
      providerId,
      actionId,
      environment: environment(actionArgs),
      params: params(actionArgs),
    });
    if (operation === "plan") {
      console.log(JSON.stringify(plan, null, 2));
      return;
    }
    const result = await executeProviderAction(root, plan, {
      approve: has(actionArgs, "--approve"),
      approveProduction: has(actionArgs, "--approve-production"),
    });
    console.log(JSON.stringify(result, null, 2));
    if (result.status !== "success") process.exitCode = 1;
    return;
  }

  if (subcommand === "preview") {
    const operation = rest[0] ?? "plan";
    const previewArgs = rest.slice(1);
    if (!["plan", "run"].includes(operation)) throw new Error("Usage: dockyard providers preview plan|run [--web vercel|cloudflare-pages|cloudflare-worker] [--database supabase] [--workflow github] [--param provider.key=value] [--approve]");
    const plan = planPreviewEnvironment(root, previewRequest(previewArgs));
    if (operation === "plan") {
      console.log(JSON.stringify(plan, null, 2));
      return;
    }
    const result = await executePreviewEnvironment(root, plan, { approve: has(previewArgs, "--approve") });
    console.log(JSON.stringify(result, null, 2));
    if (result.status !== "success") process.exitCode = 1;
    return;
  }

  throw new Error("Usage: dockyard providers health [--provider github,vercel,cloudflare,supabase] [--timeout-ms 1000-15000] | actions [--provider ID] | action plan|run --provider ID --action ID --environment preview|production [--param key=value] [--approve] [--approve-production] | preview plan|run [--web vercel|cloudflare-pages|cloudflare-worker] [--database supabase] [--workflow github] [--param provider.key=value] [--approve]");
}
