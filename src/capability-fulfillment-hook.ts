import { capabilityFulfillmentAgentText } from "./capability-fulfillment-agent.js";
import {
  planCapabilityFulfillmentForIds,
  persistCapabilityFulfillment,
  type CapabilityFulfillmentPlan,
} from "./capability-fulfillment.js";
import type { RequestMediationResult } from "./request-mediation.js";
import type { TeamRunState } from "./team-types.js";

export interface InvocationCapabilityFulfillment {
  candidateIds: string[];
  plan: CapabilityFulfillmentPlan;
  persistedPath: string;
  agentLines: string[];
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
  const agentLines = capabilityFulfillmentAgentText(plan);
  if (plan.installable.length) {
    agentLines.push(
      `Automatic-safe fulfillment is available for package-backed capabilities: ${plan.installable.join(", ")}.`,
      `Before relying on those capabilities, make your first suitable tool action: dockyard capabilities fulfill --ids ${candidateIds.join(",")} --request-hash ${mediation.requestHash} --json`,
      "That command may activate only packages whose existing DockyardOS quarantine/signature/permission assessment remains automatic after a fresh pinned reassessment. It must not pass approval for approval-required or quarantined packages.",
    );
  }
  if (plan.unresolved.length && !plan.installable.length) {
    agentLines.push("Proceed using verified-ready capabilities only; unresolved discovery/runtime/connection prerequisites must remain explicitly unresolved until satisfied.");
  }
  return { candidateIds, plan, persistedPath, agentLines };
}
