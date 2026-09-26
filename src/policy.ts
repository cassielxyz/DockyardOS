import type { OperatingMode, PolicyDecision } from "./types.js";

const hardBlockFragments = ["mkfs.", "of=/dev/sd", "of=/dev/nvme"];

const approvalRules: Array<{ fragments: string[]; reason: string }> = [
  { fragments: ["git", "push", "--force"], reason: "Rewriting shared Git history requires explicit approval." },
  { fragments: ["git", "reset", "--hard"], reason: "Discarding local Git work requires explicit approval." },
  { fragments: ["git", "clean", "-f"], reason: "Deleting untracked files requires explicit approval." },
  { fragments: ["drop", "database"], reason: "Destructive database operations require explicit approval." },
  { fragments: ["drop", "table"], reason: "Destructive database operations require explicit approval." },
  { fragments: ["truncate", "table"], reason: "Destructive database operations require explicit approval." },
  { fragments: ["supabase", "db", "reset"], reason: "Database resets require explicit approval." },
  { fragments: ["terraform", "destroy"], reason: "Infrastructure destruction requires explicit approval." },
  { fragments: ["kubectl", "delete"], reason: "Cluster resource deletion requires explicit approval." },
  { fragments: ["vercel", "--prod"], reason: "Production deployments require explicit approval." },
  { fragments: ["wrangler", "deploy"], reason: "Cloudflare deployments can affect live traffic and require approval." },
  { fragments: ["firebase", "deploy"], reason: "Firebase deployments can affect live resources and require approval." },
  { fragments: ["npm", "-g"], reason: "Global package installation changes the machine outside the project." },
  { fragments: ["pnpm", "--global"], reason: "Global package installation changes the machine outside the project." },
  { fragments: ["printenv"], reason: "Environment output may expose credentials or tokens." },
  { fragments: ["cat", ".env"], reason: "Reading environment files through shell can expose credentials." },
];

const safePrefixes = [
  "git status",
  "git diff",
  "git log",
  "git show",
  "git branch",
  "git rev-parse",
  "npm test",
  "npm run test",
  "npm run build",
  "npm run lint",
  "npm run check",
  "pnpm test",
  "yarn test",
  "bun test",
  "node --test",
  "tsc",
  "eslint",
];

function containsFragments(command: string, fragments: string[]): boolean {
  const normalized = command.toLowerCase();
  return fragments.every((fragment) => normalized.includes(fragment.toLowerCase()));
}

export function evaluateCommand(command: string, mode: OperatingMode): PolicyDecision {
  const normalized = command.trim().toLowerCase();
  if (hardBlockFragments.some((fragment) => normalized.includes(fragment))) {
    return { decision: "deny", reason: "DockyardOS blocked a machine-destructive command." };
  }
  for (const rule of approvalRules) {
    if (containsFragments(command, rule.fragments)) return { decision: "force_ask", reason: rule.reason };
  }
  if (safePrefixes.some((prefix) => normalized.startsWith(prefix))) {
    return { decision: "allow", reason: "Reversible development command." };
  }
  if (mode === "safe") return { decision: "ask", reason: "Safe mode asks before unclassified shell commands." };
  return {
    decision: "allow",
    reason: mode === "autonomous"
      ? "Autonomous mode allows non-destructive commands."
      : "Balanced mode allows non-destructive project commands.",
  };
}

export function evaluateTool(
  toolName: string,
  args: Record<string, unknown> | undefined,
  mode: OperatingMode,
): PolicyDecision {
  if (toolName === "run_command") {
    const command = String(args?.CommandLine ?? args?.command ?? "");
    return evaluateCommand(command, mode);
  }
  if (["write_to_file", "replace_file_content", "multi_replace_file_content"].includes(toolName)) {
    return { decision: "allow", reason: "Project file edits are reversible and checkpointed." };
  }
  return mode === "safe"
    ? { decision: "ask", reason: "Safe mode asks before unclassified tool actions." }
    : { decision: "allow", reason: "No destructive DockyardOS policy matched." };
}
