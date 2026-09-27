import type { HostAdapterDefinition } from "./host-types.js";

const VERIFIED = "2026-09-27";

export const hostAdapters: HostAdapterDefinition[] = [
  {
    id: "antigravity",
    displayName: "Google Antigravity",
    executable: "agy",
    features: ["skills", "plugins", "mcp", "hooks", "subagents", "rules", "commands", "resume"],
    preferredSkillLocations: [
      { scope: "project", path: ".agents/plugins/dockyardos", strategy: "copy-plugin", note: "Workspace plugin keeps project-visible host integration while DockyardOS runtime state stays external." },
      { scope: "user", strategy: "copy-plugin", note: "Global plugin installation can be performed with the Antigravity plugin CLI where available." },
    ],
    projectInstructionFiles: [],
    supportsNativeResume: false,
    supportsDockyardHooks: true,
    notes: ["DockyardOS uses the native Antigravity plugin/hook lifecycle for checkpoint injection and approval gating."],
    verifiedAgainst: [{ date: VERIFIED, source: "https://antigravity.google/docs/plugins" }, { date: VERIFIED, source: "https://antigravity.google/docs/hooks" }],
  },
  {
    id: "gemini-cli",
    displayName: "Gemini CLI",
    executable: "gemini",
    features: ["skills", "extensions", "mcp", "hooks", "subagents", "commands", "resume"],
    preferredSkillLocations: [
      { scope: "user", strategy: "cli-extension", commandTemplate: ["gemini", "extensions", "install", "<dockyard-extension-source>"], note: "Preferred distribution path because Gemini CLI extensions can bundle skills, MCPs, hooks, commands, and subagents." },
      { scope: "project", strategy: "copy-skill", note: "Workspace-scoped Agent Skill can be installed through Gemini skill management." },
    ],
    projectInstructionFiles: ["GEMINI.md"],
    supportsNativeResume: true,
    supportsDockyardHooks: true,
    notes: ["Use extension installation for the full Dockyard adapter; use a skill-only install when hooks/MCP/subagents are not required."],
    verifiedAgainst: [{ date: VERIFIED, source: "https://github.com/google-gemini/gemini-cli/blob/main/docs/extensions/index.md" }, { date: VERIFIED, source: "https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/skills.md" }],
  },
  {
    id: "codex",
    displayName: "OpenAI Codex / Agents",
    executable: "codex",
    features: ["skills", "plugins", "mcp", "hooks", "project-instructions"],
    preferredSkillLocations: [
      { scope: "runtime", strategy: "runtime-capability-directory", note: "OpenAI Agents API discovers open Agent Skills from registered sandbox capability directories." },
      { scope: "project", path: ".agents/skills/dockyardos", strategy: "copy-skill", note: "Portable Agent Skills directory used by OpenAI OSS workflows; verify local Codex-client discovery before relying on automatic loading." },
      { scope: "project", path: ".dockyard/plugins/openai", strategy: "copy-plugin", note: "OpenAI plugin packaging can bundle skills plus MCP configuration using .codex-plugin/plugin.json." },
    ],
    projectInstructionFiles: ["AGENTS.md"],
    supportsNativeResume: false,
    supportsDockyardHooks: true,
    notes: ["Do not assume a local Codex skill search path solely from compatibility claims; use Agent Skills/plugin/runtime capability directories supported by the active OpenAI host."],
    verifiedAgainst: [{ date: VERIFIED, source: "https://developers.openai.com/api/docs/guides/tools-skills" }, { date: VERIFIED, source: "https://developers.openai.com/api/docs/guides/agents-api/tools/plugins" }],
  },
  {
    id: "claude-code",
    displayName: "Claude Code",
    executable: "claude",
    features: ["skills", "mcp", "hooks", "subagents", "commands", "project-instructions", "resume"],
    preferredSkillLocations: [
      { scope: "project", path: ".claude/skills/dockyardos", strategy: "copy-skill", note: "Claude-compatible Agent Skill location used by current cross-agent migration guidance and Claude skill tooling." },
      { scope: "user", path: "~/.claude/skills/dockyardos", strategy: "copy-skill", note: "User-scoped skill location when supported by the current Claude Code install." },
    ],
    projectInstructionFiles: ["CLAUDE.md"],
    supportsNativeResume: true,
    supportsDockyardHooks: true,
    notes: ["Claude Code supports native conversation continue/resume, but DockyardOS remains the source of project/team state so switching hosts does not lose progress."],
    verifiedAgainst: [{ date: VERIFIED, source: "https://docs.anthropic.com/en/docs/claude-code/cli-usage" }, { date: VERIFIED, source: "https://platform.claude.com/docs/agents-and-tools/agent-skills/overview" }],
  },
  {
    id: "cursor",
    displayName: "Cursor",
    features: ["skills", "hooks", "subagents", "commands", "project-instructions"],
    preferredSkillLocations: [
      { scope: "project", path: ".agents/skills/dockyardos", strategy: "copy-skill", note: "Cursor discovers Agent Skills from .agents/skills and Cursor-specific skill folders." },
      { scope: "user", path: "~/.agents/skills/dockyardos", strategy: "copy-skill" },
    ],
    projectInstructionFiles: ["AGENTS.md", ".cursor/rules"],
    supportsNativeResume: false,
    supportsDockyardHooks: true,
    notes: ["Use portable .agents/skills as the preferred DockyardOS surface rather than duplicating one copy per compatible directory."],
    verifiedAgainst: [{ date: VERIFIED, source: "https://docs.cursor.com/context/skills" }],
  },
  {
    id: "opencode",
    displayName: "OpenCode",
    executable: "opencode",
    features: ["skills", "mcp", "commands", "project-instructions"],
    preferredSkillLocations: [
      { scope: "project", path: ".agents/skills/dockyardos", strategy: "copy-skill", note: "OpenCode recognizes open Agent Skills directories including .agents/skills." },
      { scope: "project", path: ".opencode/skills/dockyardos", strategy: "copy-skill" },
      { scope: "user", path: "~/.config/opencode/skills/dockyardos", strategy: "copy-skill" },
    ],
    projectInstructionFiles: ["AGENTS.md", "opencode.json", "opencode.jsonc"],
    supportsNativeResume: false,
    supportsDockyardHooks: false,
    notes: ["Prefer .agents/skills for portability. OpenCode can also consume configured remote skill catalogues."],
    verifiedAgainst: [{ date: VERIFIED, source: "https://opencode.ai/docs/skills/" }],
  },
];

export function hostAdapter(id: HostAdapterDefinition["id"]): HostAdapterDefinition {
  const adapter = hostAdapters.find((item) => item.id === id);
  if (!adapter) throw new Error(`Unknown DockyardOS host: ${id}`);
  return adapter;
}
