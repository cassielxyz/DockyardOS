import {
  fulfillmentSummary,
  planCapabilityFulfillmentForIds,
  persistCapabilityFulfillment,
} from "./capability-fulfillment.js";
import {
  activateAutomaticCapabilities,
  capabilityActivationAgentText,
} from "./capability-fulfillment-activation.js";

function values(args: string[], name: string): string[] {
  const output: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== name || !args[index + 1]) continue;
    output.push(...args[index + 1]!.split(",").map((item) => item.trim()).filter(Boolean));
  }
  return output;
}

function value(args: string[], name: string): string | undefined {
  return values(args, name)[0];
}

function candidateIds(args: string[]): string[] {
  return [...new Set([...values(args, "--id"), ...values(args, "--ids")])];
}

function requestHash(args: string[]): string | undefined {
  const hash = value(args, "--request-hash");
  if (!hash) return undefined;
  if (!/^[a-f0-9]{64}$/i.test(hash)) throw new Error("--request-hash must be a 64-character SHA-256 value emitted by DockyardOS request mediation.");
  return hash.toLowerCase();
}

export async function handleCapabilityFulfillmentCommand(root: string, args: string[]): Promise<void> {
  const action = args[0] ?? "plan";
  const rest = args.slice(1);
  const ids = candidateIds(rest);
  if (!ids.length) throw new Error("At least one --id/--ids capability id is required.");
  const hash = requestHash(rest);

  const plan = await planCapabilityFulfillmentForIds(root, ids);
  const persistedPath = await persistCapabilityFulfillment(root, plan, hash);

  if (action === "plan") {
    console.log(JSON.stringify({ ...fulfillmentSummary(plan), persistedPath, ...(hash ? { requestHash: hash } : {}) }, null, 2));
    return;
  }

  if (action === "fulfill") {
    const result = await activateAutomaticCapabilities(root, plan, { requestHash: hash });
    console.log(JSON.stringify({
      ...result,
      summary: fulfillmentSummary(result.finalPlan),
      agentGuidance: capabilityActivationAgentText(result),
    }, null, 2));
    if (result.attempts.some((attempt) => attempt.status === "failed")) process.exitCode = 2;
    return;
  }

  throw new Error("Usage: dockyard capabilities plan|fulfill --ids ID[,ID] [--request-hash SHA256] [--json]");
}
