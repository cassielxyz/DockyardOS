import type { TeamRecipe } from "./types.js";

export const creativeRecipes: TeamRecipe[] = [
  {
    id: "creative-web-ui",
    displayName: "Creative / Premium Web UI",
    taskTypes: ["landing-page", "new-project", "feature", "ui"],
    stacks: ["web", "react", "nextjs", "vue", "svelte"],
    capabilities: [
      "ui-design",
      "design-system",
      "design-inspiration",
      "visual-direction",
      "anti-slop",
      "responsive",
      "accessibility",
      "web-performance",
    ],
    required: ["playwright", "axe-core", "lighthouse"],
    preferred: [
      "inspo-mcp",
      "taste-skill",
      "awesome-design-skills",
      "ui-ux-pro-max",
      "vercel-web-design-guidelines",
      "shadcn",
      "playwright-mcp",
    ],
    agents: [
      "research-agent",
      "frontend-agent",
      "browser-qa-agent",
      "accessibility-agent",
      "performance-agent",
      "qa-reviewer-agent",
    ],
    securityLevel: "standard",
    workflowProfile: "standard",
  },
];
