import type { CapabilityFulfillmentPlan } from "./capability-fulfillment.js";

function line(label: string, values: string[]): string {
  return values.length ? `${label}: ${values.join(", ")}` : "";
}

export function capabilityFulfillmentAgentText(plan: CapabilityFulfillmentPlan): string[] {
  const lines = [
    "DOCKYARDOS CAPABILITY FULFILLMENT: VERIFIED READINESS",
    line("Ready now", plan.ready),
    line("Installable but not yet assessed/activated", plan.installable),
    line("Needs host/account connection verification", plan.needsConnection),
    line("Known but discovery-only", plan.discoveryOnly),
    line("Missing local runtime", plan.missingRuntime),
    line("Blocked", plan.blocked),
    ...plan.warnings.map((warning) => `Fulfillment warning: ${warning}`),
    plan.unresolved.length
      ? "Do not claim an unresolved capability is installed, connected, loaded, or active. Use only ready capabilities until DockyardOS safely fulfills the prerequisite or an existing approval/connection boundary is satisfied."
      : "Every selected capability in this request is currently verified ready.",
    plan.installable.length
      ? "For installable package-backed capabilities, use DockyardOS quarantine/assessment and immutable revision+SHA activation. Never fetch/execute the upstream repository directly as a shortcut."
      : "",
    plan.needsConnection.length
      ? "For MCP/connectors, do not assume credentials or connectivity. Use the host/plugin connection surface and preserve its authorization boundary."
      : "",
  ];
  return lines.filter(Boolean);
}
