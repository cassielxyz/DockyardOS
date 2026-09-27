import { getCandidate } from "./registry.js";
import type { Candidate, SelectionResult } from "./types.js";
import type { AgentAssignment, TeamComposition, TeamCompositionRequest, TeamPhaseId, TeamPhasePlan } from "./team-types.js";

const PHASE_ORDER: TeamPhaseId[] = ["discovery", "architecture", "planning", "implementation", "verification", "security", "release"];

const AGENT_PHASES: Record<string, TeamPhaseId[]> = {
  "requirements-agent": ["discovery"],
  "research-agent": ["discovery"],
  "provider-selector-agent": ["discovery", "architecture"],
  "memory-agent": ["discovery", "planning"],
  "architect-agent": ["architecture", "planning"],
  "security-architect-agent": ["architecture", "security"],
  "planner-agent": ["planning"],
  "frontend-agent": ["implementation"],
  "backend-agent": ["implementation"],
  "database-agent": ["architecture", "implementation"],
  "mobile-agent": ["implementation"],
  "debugger-agent": ["implementation"],
  "refactor-agent": ["implementation"],
  "migration-agent": ["planning", "implementation"],
  "devops-agent": ["implementation", "release"],
  "qa-reviewer-agent": ["verification"],
  "browser-qa-agent": ["verification"],
  "accessibility-agent": ["verification"],
  "performance-agent": ["verification"],
  "api-reviewer-agent": ["verification"],
  "security-reviewer-agent": ["security"],
  "release-verifier-agent": ["release"],
  "observability-agent": ["verification", "release"],
  "docs-agent": ["release"],
};

const REVIEWERS = new Set([
  "qa-reviewer-agent",
  "browser-qa-agent",
  "accessibility-agent",
  "performance-agent",
  "api-reviewer-agent",
  "security-reviewer-agent",
  "release-verifier-agent",
]);

const IMPLEMENTERS = new Set([
  "frontend-agent",
  "backend-agent",
  "database-agent",
  "mobile-agent",
  "debugger-agent",
  "refactor-agent",
  "migration-agent",
  "devops-agent",
]);

function terms(candidate: Candidate): string[] {
  return [candidate.id, candidate.category, ...candidate.capabilities, ...candidate.tags].map((value) => value.toLowerCase());
}

function candidatePhases(candidate: Candidate): TeamPhaseId[] {
  if (candidate.kind === "agent") return AGENT_PHASES[candidate.id] ?? ["implementation"];
  const words = new Set(terms(candidate));
  const phases = new Set<TeamPhaseId>();
  const has = (...values: string[]) => values.some((value) => words.has(value));

  if (has("requirements", "planning", "research", "codebase-audit", "tool-discovery", "provider-selection")) phases.add("discovery");
  if (has("architecture", "system-design", "design-system", "schema", "database", "provider-selection", "security-architecture")) phases.add("architecture");
  if (has("planning", "implementation-plan", "task-breakdown", "tdd", "migration-plan")) phases.add("planning");
  if (has("frontend", "backend", "react", "nextjs", "components", "mobile-ui", "database", "migrations", "deployment", "workers", "animation", "refactor", "debugging")) phases.add("implementation");
  if (has("testing", "e2e", "browser-test", "unit-test", "integration-test", "accessibility", "wcag", "performance", "profiling", "code-review", "api-review")) phases.add("verification");
  if (has("security", "appsec", "owasp", "pentest", "secret-scan", "dependency-scan", "sast", "security-analysis", "security-fix")) phases.add("security");
  if (has("release", "deployment", "preview-deployment", "web-hosting", "observability", "logs", "metrics", "tracing", "ci")) phases.add("release");

  if (!phases.size) phases.add(candidate.kind === "mcp" ? "implementation" : "planning");
  return [...phases];
}

function assignment(agentId: string, phase: TeamPhaseId): AgentAssignment {
  const reviewer = REVIEWERS.has(agentId);
  const implementer = IMPLEMENTERS.has(agentId) && phase === "implementation";
  const lead = (phase === "discovery" && agentId === "requirements-agent")
    || (phase === "architecture" && agentId === "architect-agent")
    || (phase === "planning" && agentId === "planner-agent")
    || (phase === "security" && agentId === "security-reviewer-agent")
    || (phase === "release" && agentId === "release-verifier-agent");
  return {
    agentId,
    kind: lead ? "lead" : reviewer ? "reviewer" : implementer ? "implementer" : "specialist",
    isolation: reviewer ? "review-only" : implementer ? "worktree-write" : "shared-read",
    reason: reviewer
      ? `Independent ${phase} review; keep separate from implementation context and write access.`
      : implementer
        ? "Scoped implementation worker; use an isolated worktree when multiple writers are active."
        : `Phase specialist for ${phase}.`,
    required: lead || reviewer,
  };
}

function phaseBudget(profile: TeamCompositionRequest["workflowProfile"], phase: TeamPhaseId): number {
  if (profile === "fast") return phase === "implementation" || phase === "verification" ? 2 : 1;
  if (profile === "standard") return phase === "implementation" ? 3 : 2;
  return phase === "implementation" ? 5 : phase === "verification" || phase === "security" ? 3 : 3;
}

function maxWriters(profile: TeamCompositionRequest["workflowProfile"]): number {
  if (profile === "fast") return 1;
  if (profile === "standard") return 2;
  return 3;
}

function selectedForPhase(ids: string[], phase: TeamPhaseId): string[] {
  return ids.filter((id) => {
    const candidate = getCandidate(id);
    return candidate ? candidatePhases(candidate).includes(phase) : false;
  });
}

function phasePlan(request: TeamCompositionRequest, phase: TeamPhaseId): TeamPhasePlan {
  const budget = phaseBudget(request.workflowProfile, phase);
  let agents = request.selectedAgents.filter((id) => (AGENT_PHASES[id] ?? ["implementation"]).includes(phase));

  const priority = phase === "verification"
    ? ["qa-reviewer-agent", "browser-qa-agent", "api-reviewer-agent", "accessibility-agent", "performance-agent", "observability-agent"]
    : phase === "security"
      ? ["security-reviewer-agent", "security-architect-agent"]
      : phase === "release"
        ? ["release-verifier-agent", "devops-agent", "observability-agent", "docs-agent"]
        : phase === "architecture"
          ? ["architect-agent", "security-architect-agent", "database-agent", "provider-selector-agent"]
          : phase === "planning"
            ? ["planner-agent", "architect-agent", "migration-agent", "memory-agent"]
            : phase === "discovery"
              ? ["requirements-agent", "research-agent", "provider-selector-agent", "memory-agent"]
              : agents;

  if (phase !== "implementation") {
    const agentSet = new Set(agents);
    agents = priority.filter((id) => agentSet.has(id));
  }
  agents = agents.slice(0, budget);

  const skills = selectedForPhase(request.selectedSkills, phase).slice(0, phase === "implementation" ? 6 : 4);
  const tools = selectedForPhase(request.selectedTools, phase).slice(0, phase === "verification" || phase === "security" ? 5 : 3);
  const mcps = selectedForPhase(request.selectedMcps, phase).slice(0, 3);

  const outputs: Record<TeamPhaseId, string[]> = {
    discovery: ["requirements-and-constraints", "acceptance-criteria", "known-unknowns"],
    architecture: ["architecture-decisions", "trust-boundaries", "provider-and-data-decisions"],
    planning: ["ordered-task-graph", "verification-plan", "worktree-assignments"],
    implementation: ["scoped-code-changes", "local-tests", "implementation-notes"],
    verification: ["independent-test-results", "acceptance-evidence", "regression-findings"],
    security: ["security-evidence", "remediation-status", "security-regression-gate"],
    release: ["release-readiness", "preview-or-release-evidence", "rollback-and-observability-plan"],
  };
  const inputs: Record<TeamPhaseId, string[]> = {
    discovery: ["user-requirement", "repository-state", "latest-checkpoint"],
    architecture: ["requirements-and-constraints", "repository-architecture", "provider-readiness"],
    planning: ["architecture-decisions", "acceptance-criteria", "selected-capabilities"],
    implementation: ["ordered-task-graph", "scoped-assignment", "relevant-code-context"],
    verification: ["scoped-code-changes", "acceptance-criteria", "test-plan"],
    security: ["changed-attack-surface", "threat-model", "security-scan-plan"],
    release: ["verified-revision", "security-status", "provider-plan", "rollback-plan"],
  };

  const gates = phase === "security"
    ? request.securityGates
    : phase === "verification"
      ? ["tests-pass", "acceptance-criteria", "independent-review"]
      : phase === "release"
        ? ["verification-complete", ...(request.security === "high" ? ["security-complete"] : []), "rollback-ready"]
        : phase === "implementation"
          ? ["scoped-writes", "no-unreviewed-production-mutation"]
          : [];

  return {
    id: phase,
    title: phase[0]!.toUpperCase() + phase.slice(1),
    status: agents.length || skills.length || tools.length || mcps.length || phase === "implementation" || phase === "verification" ? "pending" : "skipped",
    assignments: agents.map((id) => assignment(id, phase)),
    skills,
    tools,
    mcps,
    inputs: inputs[phase],
    outputs: outputs[phase],
    gates,
    parallelizable: phase === "implementation" && agents.filter((id) => IMPLEMENTERS.has(id)).length > 1,
    maxParallelWriters: phase === "implementation" ? maxWriters(request.workflowProfile) : 0,
  };
}

export function composeTeam(request: TeamCompositionRequest): TeamComposition {
  const phases = PHASE_ORDER.map((phase) => phasePlan(request, phase));
  if (request.workflowProfile === "fast") {
    for (const phase of phases) {
      if (["discovery", "architecture", "planning", "security", "release"].includes(phase.id) && phase.assignments.length === 0) phase.status = "skipped";
    }
  }
  if (request.security === "high") {
    const security = phases.find((phase) => phase.id === "security")!;
    if (!security.assignments.some((item) => item.agentId === "security-reviewer-agent") && request.selectedAgents.includes("security-reviewer-agent")) {
      security.assignments.unshift(assignment("security-reviewer-agent", "security"));
      security.status = "pending";
    }
  }

  return {
    schemaVersion: 1,
    task: request.task,
    taskType: request.taskType,
    stack: request.stack,
    security: request.security,
    workflowProfile: request.workflowProfile,
    ...(request.recipeId ? { recipeId: request.recipeId } : {}),
    phases,
    contextPolicy: {
      maxActiveAgents: request.workflowProfile === "full" ? 5 : request.workflowProfile === "standard" ? 3 : 2,
      maxParallelWriters: maxWriters(request.workflowProfile),
      handoffIncludes: ["task", "phase outputs", "decisions", "unresolved blockers", "relevant file/function references", "verification evidence"],
      handoffExcludes: ["full previous transcript", "unrelated skills", "raw secrets", "unbounded tool output", "other writers' private scratch context"],
    },
  };
}

export function composeTeamFromSelection(task: string, selection: SelectionResult): TeamComposition {
  return composeTeam({
    task,
    taskType: selection.request.taskType,
    stack: selection.request.stack,
    security: selection.request.security,
    workflowProfile: selection.recipe?.workflowProfile ?? (selection.request.taskType === "bug-fix" ? "standard" : "standard"),
    ...(selection.recipe?.id ? { recipeId: selection.recipe.id } : {}),
    selectedAgents: selection.agents.map((item) => item.candidate.id),
    selectedSkills: selection.skills.map((item) => item.candidate.id),
    selectedTools: selection.tools.map((item) => item.candidate.id),
    selectedMcps: selection.mcps.map((item) => item.candidate.id),
    securityGates: selection.securityGates,
  });
}

export function teamCompositionSummary(team: TeamComposition): Record<string, unknown> {
  return {
    task: team.task,
    recipe: team.recipeId ?? null,
    workflowProfile: team.workflowProfile,
    security: team.security,
    contextPolicy: team.contextPolicy,
    phases: team.phases.map((phase) => ({
      id: phase.id,
      status: phase.status,
      agents: phase.assignments.map((assignment) => ({ agent: assignment.agentId, role: assignment.kind, isolation: assignment.isolation })),
      skills: phase.skills,
      tools: phase.tools,
      mcps: phase.mcps,
      gates: phase.gates,
      parallelizable: phase.parallelizable,
      maxParallelWriters: phase.maxParallelWriters,
    })),
  };
}
