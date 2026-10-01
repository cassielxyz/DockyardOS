import type { CapabilityFulfillmentEntry, CapabilityFulfillmentPlan, CapabilityFulfillmentStatus, RuntimeConnectionEvidence } from "./capability-fulfillment.js";
import type { HostId } from "./types.js";

const MCP_ID = /^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9])?$/;
const MAX_OBSERVATION_LENGTH = 240;

export interface HostSessionMcpEvidence {
  kind: "mcp";
  id: string;
  host: HostId;
  verifiedAt: string;
  observation: string;
  scope: "process";
  grantsMutationApproval: false;
}

export class HostSessionConnectionRegistry {
  private readonly mcpEvidence = new Map<string, HostSessionMcpEvidence>();

  attestMcp(host: HostId, id: string, observation: string, now = new Date()): HostSessionMcpEvidence {
    const normalizedId = id.trim();
    const normalizedObservation = observation.trim();
    if (normalizedId !== normalizedId.toLowerCase() || !MCP_ID.test(normalizedId)) {
      throw new Error("MCP connection id must be a lowercase path-safe identifier between 1 and 128 characters.");
    }
    if (!normalizedObservation || normalizedObservation.length > MAX_OBSERVATION_LENGTH) {
      throw new Error(`MCP verification observation must be between 1 and ${MAX_OBSERVATION_LENGTH} characters.`);
    }
    const evidence: HostSessionMcpEvidence = {
      kind: "mcp",
      id: normalizedId,
      host,
      verifiedAt: now.toISOString(),
      observation: normalizedObservation,
      scope: "process",
      grantsMutationApproval: false,
    };
    this.mcpEvidence.set(`${host}:${normalizedId}`, evidence);
    return evidence;
  }

  listMcp(host: HostId): HostSessionMcpEvidence[] {
    return [...this.mcpEvidence.values()]
      .filter((item) => item.host === host)
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  hasMcp(host: HostId, id: string): boolean {
    const normalizedId = id.trim();
    if (normalizedId !== normalizedId.toLowerCase() || !MCP_ID.test(normalizedId)) return false;
    return this.mcpEvidence.has(`${host}:${normalizedId}`);
  }
}

function verifiedConnectionDetail(host: HostId, id: string): string {
  return `MCP ${id} was explicitly attested after successful use by the active ${host} host session. Evidence is process-scoped, stores no credential, and grants no external mutation approval.`;
}

function withVerifiedMcpConnection(connection: RuntimeConnectionEvidence, host: HostId, verifiedIds: Set<string>): RuntimeConnectionEvidence {
  if (connection.kind !== "mcp" || !verifiedIds.has(connection.id)) return connection;
  return {
    ...connection,
    ready: true,
    detail: verifiedConnectionDetail(host, connection.id),
  };
}

function updateEntry(entry: CapabilityFulfillmentEntry, host: HostId, verifiedIds: Set<string>): CapabilityFulfillmentEntry {
  if (entry.kind === "mcp" && verifiedIds.has(entry.candidateId)) {
    return {
      ...entry,
      status: "ready",
      connections: [{
        kind: "mcp",
        id: entry.candidateId,
        required: true,
        ready: true,
        detail: verifiedConnectionDetail(host, entry.candidateId),
      }],
      reason: `The selected MCP is verified usable by the active ${host} host session. This connection evidence is process-scoped and does not imply permission for any external mutation.`,
    };
  }

  if (!entry.connections?.length) return entry;
  const connections = entry.connections.map((connection) => withVerifiedMcpConnection(connection, host, verifiedIds));
  if (entry.status !== "needs-connection") return { ...entry, connections };
  const unresolvedRequired = connections.filter((connection) => connection.required && !connection.ready);
  if (unresolvedRequired.length) return { ...entry, connections };
  const unresolvedOptional = connections.filter((connection) => !connection.required && !connection.ready);
  return {
    ...entry,
    connections,
    status: "ready",
    reason: unresolvedOptional.length
      ? `The immutable package revision, local runtime, and all required external connections are verified. Optional connection(s) remain unverified and are not assumed: ${unresolvedOptional.map((item) => `${item.kind}:${item.id}`).join(", ")}.`
      : `The immutable package revision, local runtime, and all required external connections are verified ready for the active ${host} host session.`,
  };
}

export function applyHostSessionConnectionEvidence(
  plan: CapabilityFulfillmentPlan,
  host: HostId,
  evidence: HostSessionMcpEvidence[],
): CapabilityFulfillmentPlan {
  const verifiedIds = new Set(evidence.filter((item) => item.host === host && item.kind === "mcp").map((item) => item.id));
  if (!verifiedIds.size) return plan;
  const entries = plan.entries.map((entry) => updateEntry(entry, host, verifiedIds));
  const ids = (status: CapabilityFulfillmentStatus) => entries.filter((entry) => entry.status === status).map((entry) => entry.candidateId);
  return {
    ...plan,
    entries,
    ready: ids("ready"),
    unresolved: entries.filter((entry) => entry.status !== "ready").map((entry) => entry.candidateId),
    installable: ids("installable-unassessed"),
    needsConnection: ids("needs-connection"),
    discoveryOnly: ids("discovery-only"),
    missingRuntime: ids("missing-runtime"),
    blocked: ids("blocked"),
  };
}
