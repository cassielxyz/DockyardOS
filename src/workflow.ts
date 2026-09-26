import type { SecurityLevel, WorkflowPlan, WorkflowProfile } from "./types.js";
import { providers } from "./registry.js";

export function composeWorkflow(input: {
  profile: WorkflowProfile;
  stack: string[];
  security: SecurityLevel;
}): WorkflowPlan {
  const stack = input.stack.map((item) => item.toLowerCase());
  const agents = input.profile === "fast"
    ? ["implementer", "qa-reviewer"]
    : input.profile === "standard"
      ? ["planner", "implementer", "qa-reviewer", "security-reviewer"]
      : ["requirements", "architect", "planner", "frontend", "backend", "data", "security-reviewer", "qa-reviewer", "release-verifier"];

  const skills = new Set<string>();
  if (input.profile !== "fast") skills.add("superpowers");
  if (stack.some((item) => ["react", "nextjs", "next.js", "web"].includes(item))) {
    skills.add("ui-ux-pro-max");
    skills.add("shadcn");
  }
  skills.add("owasp");

  const tools = new Set<string>(["playwright", "gitleaks", "osv-scanner"]);
  const securityGates = ["secret-scan", "dependency-scan", "owasp-review"];
  if (input.security === "high") {
    tools.add("strix");
    securityGates.push("threat-model", "strix-verification", "post-fix-regression");
  }

  const providerCandidates = providers
    .filter((provider) => {
      if (stack.includes("supabase") && provider.id === "supabase") return true;
      if (stack.includes("firebase") && provider.id === "firebase") return true;
      if (stack.some((item) => ["nextjs", "next.js", "web"].includes(item)) && ["vercel", "cloudflare", "render"].includes(provider.id)) return true;
      return ["github", "sentry"].includes(provider.id);
    })
    .map((provider) => provider.id);

  return {
    profile: input.profile,
    agents,
    skills: [...skills],
    tools: [...tools],
    securityGates,
    providerCandidates,
  };
}
