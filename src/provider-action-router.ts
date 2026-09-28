import {
  executeProviderAction as executePrimaryProviderAction,
  listProviderActions as listPrimaryProviderActions,
  planProviderAction as planPrimaryProviderAction,
  type ProviderActionApprovals,
  type ProviderActionExecutionResult,
  type ProviderActionPlan,
  type ProviderActionRequest,
} from "./provider-actions.js";
import {
  executeAlternativeProviderAction,
  isAlternativeProviderAction,
  listAlternativeProviderActions,
  planAlternativeProviderAction,
  type AlternativeProviderActionDefinition,
} from "./provider-actions-alternative.js";
import type { ProviderActionDefinition } from "./provider-actions.js";

export type RoutedProviderActionDefinition = ProviderActionDefinition | (AlternativeProviderActionDefinition & { requiresAuthenticated: true });

export function listProviderActions(providerId?: string): RoutedProviderActionDefinition[] {
  const alternative = listAlternativeProviderActions(providerId).map((item) => ({
    ...item,
    requiresAuthenticated: true as const,
  }));
  return [
    ...listPrimaryProviderActions(providerId),
    ...alternative,
  ];
}

export function planProviderAction(root: string, request: ProviderActionRequest): ProviderActionPlan {
  if (isAlternativeProviderAction(request.providerId, request.actionId)) {
    return planAlternativeProviderAction(root, request);
  }
  return planPrimaryProviderAction(root, request);
}

export async function executeProviderAction(
  root: string,
  plan: ProviderActionPlan,
  approvals: ProviderActionApprovals = {},
): Promise<ProviderActionExecutionResult> {
  if (isAlternativeProviderAction(plan.providerId, plan.actionId)) {
    return executeAlternativeProviderAction(root, plan, approvals);
  }
  return executePrimaryProviderAction(root, plan, approvals);
}
