import { capabilityFulfillmentAgentText } from "./capability-fulfillment-agent.js";
import {
  planCapabilityFulfillmentForIds,
  persistCapabilityFulfillment,
  type CapabilityFulfillmentPlan,
} from "./capability-fulfillment.js";
import { activateAutomaticCapabilities, capabilityActivationAgentText, type CapabilityActivationResult } from "./capability-fulfillment-activation.js";
import { bundledCapabilityAgentText } from "./bundled-capability-guidance.js";
import type { RequestMediationResult } from "./request-mediation.js";
import type { TeamRunState } from "./team-types.js";

export interface InvocationCapabilityFulfillment {
  candidateIds: string[];
  plan: CapabilityFulfillmentPlan;
  persistedPath: string;
  agentLines: string[];
  activation?: CapabilityActivationResult;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function capabilityIdsForInvocation(
  mediation: RequestMediationResult,
  team?: TeamRunState,
): string[] {
  if (team && team.status !== "completed" && team.status !== "cancelled") {
    const phase = team.composition.phases.find((item) => item.id === team.currentPhase);
    if (phase) {
      return unique([
        ...phase.assignments.map((assignment) => assignment.agentId),
        ...phase.skills,
        ...phase.tools,
        ...phase.mcps,
      ]);
    }
  }
  return unique([
    ...mediation.skills,
    ...mediation.agents,
    ...mediation.tools,
    ...mediation.mcps,
  ]);
}

export async function prepareCapabilityFulfillmentForInvocation(
  root: string,
  mediation: RequestMediationResult,
  team?: TeamRunState,
): Promise<InvocationCapabilityFulfillment | undefined> {
  const candidateIds = capabilityIdsForInvocation(mediation, team);
  if (!candidateIds.length) return undefined;

  const plan = await planCapabilityFulfillmentForIds(root, candidateIds);
  const persistedPath = await persistCapabilityFulfillment(root, plan, mediation.requestHash);
  let effectivePlan = plan;
  let activation: CapabilityActivationResult | undefined;
  const agentLines: string[] = [];

  if (plan.installable.length) {
    activation = await activateAutomaticCapabilities(root, plan, {
      requestHash: mediation.requestHash,
      maxAutomaticInstalls: 8,
    });
    effectivePlan = activation.finalPlan;
    agentLines.push(...capabilityActivationAgentText(activation));
  }

  agentLines.push(...capabilityFulfillmentAgentText(effectivePlan));
  agentLines.push(...bundledCapabilityAgentText(effectivePlan.ready));
  if (effectivePlan.unresolved.length) {
    agentLines.push("Proceed using verified-ready capabilities only. Approval-required, quarantined, missing-runtime, or unconnected capabilities remain explicitly unresolved; do not ask the user to download packages manually.");
  }
  return { candidateIds, plan: effectivePlan, persistedPath, agentLines, ...(activation ? { activation } : {}) };
}
