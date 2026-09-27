import type { ProviderEnvironment } from "./types.js";
import { executeProviderAction, listProviderActions, planProviderAction } from "./provider-actions.js";

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

export async function handleProviderActionCommand(root: string, args: string[]): Promise<void> {
  const subcommand = args[0] ?? "actions";
  const rest = args.slice(1);

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

  throw new Error("Usage: dockyard providers actions [--provider ID] | action plan|run --provider ID --action ID --environment preview|production [--param key=value] [--approve] [--approve-production]");
}
