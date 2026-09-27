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
    nativeBundle: { path: "integrations/antigravity/plugin", mode: "plugin", install: "cli", note: "Full native plugin with lifecycle hooks, skills, rules, and specialist subagents." },
    notes: ["DockyardOS uses the native Antigravity plugin/hook lifecycle for checkpoint injection and approval gating."],
    verifiedAgainst: [{ date: VERIFIED, source: "https://antigravity.google/docs/plugins" }, { date: VERIFIED, source: "https://antigravity.google/docs/hooks" }],
  },
  {
    id: "gemini-cli",
    displayName: "Gemini CLI",
    executable: "gemini",
    features: ["skills", "extensions", "mcp", "hooks", "subagents", "commands", "resume"],
    preferredSkillLocations: [
      { scope: "user", path: "~/.agents/skills/dockyardos", strategy: "copy-skill", note: "Gemini CLI officially recognizes ~/.agents/skills as a user-scope Agent Skills alias." },
      { scope: "project", path: ".agents/skills/dockyardos", strategy: "copy-skill", note: "Workspace Agent Skills alias has higher precedence than user skills." },
      { scope: "user", strategy: "cli-extension", commandTemplate: ["gemini", "extensions", "install", "<dockyard-extension-source>"], note: "Use the full extension distribution when DockyardOS needs Gemini-native hooks/MCP/subagents in addition to the portable skill." },
    ],
    projectInstructionFiles: ["GEMINI.md"],
    supportsNativeResume: true,
    supportsDockyardHooks: true,
    nativeBundle: { path: "integrations/native/gemini-cli", mode: "extension", install: "cli", note: "Native extension adds local MCP plus lifecycle context/checkpoint hooks while the portable skill stays host-neutral." },
    notes: ["Gemini CLI discovers .agents/skills as an interoperable alias and supports user/workspace skill scopes plus richer extensions."],
    verifiedAgainst: [{ date: VERIFIED, source: "https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/using-agent-skills.md" }, { date: VERIFIED, source: "https://github.com/google-gemini/gemini-cli/blob/main/docs/extensions/index.md" }],
  },
  {
    id: "codex",
    displayName: "OpenAI Codex / Agents",
    executable: "codex",
    features: ["skills", "plugins", "mcp", "hooks", "project-instructions"],
    preferredSkillLocations: [
      { scope: "runtime", strategy: "runtime-capability-directory", note: "OpenAI Agents API discovers open Agent Skills from registered sandbox capability directories." },
      { scope: "project", path: ".agents/skills/dockyardos", strategy: "copy-skill", note: "Portable Agent Skills directory used by OpenAI OSS workflows; verify the active local Codex client's discovery behavior before relying on implicit loading." },
      { scope: "project", path: ".dockyard/plugins/openai", strategy: "copy-plugin", note: "OpenAI plugin packaging can bundle skills plus MCP configuration using .codex-plugin/plugin.json." },
    ],
    projectInstructionFiles: ["AGENTS.md"],
    supportsNativeResume: false,
    supportsDockyardHooks: true,
    nativeBundle: { path: "integrations/native/codex", mode: "plugin", install: "manual-review", note: "Compatibility plugin bundle adds Dockyard skill plus local MCP. Installation remains review-first because Codex deployment surfaces vary." },
    notes: ["Do not invent a local Codex skill search path. Use the active OpenAI host's documented Agent Skills/plugin/capability-directory mechanism."],
    verifiedAgainst: [{ date: VERIFIED, source: "https://developers.openai.com/api/docs/guides/tools-skills" }, { date: VERIFIED, source: "https://developers.openai.com/api/docs/guides/agents-api/tools/plugins" }],
  },
  {
    id: "claude-code",
    displayName: "Claude Code",
    executable: "claude",
    features: ["skills", "plugins", "mcp", "hooks", "subagents", "commands", "project-instructions", "resume"],
    preferredSkillLocations: [
      { scope: "user", path: "~/.claude/skills/dockyardos", strategy: "copy-skill", note: "Official personal-skill location, loaded in local Claude Code sessions across projects." },
      { scope: "project", path: ".claude/skills/dockyardos", strategy: "copy-skill", note: "Official repository-scoped skill location." },
    ],
    projectInstructionFiles: ["CLAUDE.md"],
    supportsNativeResume: true,
    supportsDockyardHooks: true,
    nativeBundle: { path: "integrations/native/claude-code", mode: "project-files", install: "manual-review", note: "Optional project instructions and MCP config are provided as review-first templates so existing Claude configuration is never overwritten silently." },
    notes: ["Claude Code also supports plugin skills, subagent execution, dynamic context, and native continue/resume. DockyardOS remains the cross-host durable state source."],
    verifiedAgainst: [{ date: VERIFIED, source: "https://code.claude.com/docs/en/skills" }, { date: VERIFIED, source: "https://docs.anthropic.com/en/docs/claude-code/cli-usage" }],
  },
  {
    id: "cursor",
    displayName: "Cursor",
    executable: "agent",
    features: ["skills", "hooks", "subagents", "commands", "project-instructions", "resume"],
    preferredSkillLocations: [
      { scope: "project", path: ".agents/skills/dockyardos", strategy: "copy-skill", note: "Cursor discovers Agent Skills from .agents/skills and Cursor-specific skill folders." },
      { scope: "user", path: "~/.agents/skills/dockyardos", strategy: "copy-skill" },
    ],
    projectInstructionFiles: ["AGENTS.md", ".cursor/rules"],
    supportsNativeResume: true,
    supportsDockyardHooks: true,
    nativeBundle: { path: "integrations/native/cursor", mode: "project-files", install: "manual-review", note: "Optional MCP config and compact always-on rule are templates only; existing project rules/config are never overwritten automatically." },
    notes: ["Use portable .agents/skills as the preferred DockyardOS surface rather than duplicating one copy per compatible directory.", "Cursor CLI uses the `agent` executable and supports native resume/continue; DockyardOS remains the cross-host durable state source."],
    verifiedAgainst: [
      { date: VERIFIED, source: "https://cursor.com/docs/context/skills" },
      { date: VERIFIED, source: "https://cursor.com/docs/cli/installation" },
      { date: VERIFIED, source: "https://cursor.com/docs/cli/using" },
    ],
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
    nativeBundle: { path: "integrations/native/opencode", mode: "project-files", install: "manual-review", note: "Optional local MCP config, AGENTS instructions, and read-only reviewer are review-first templates." },
    notes: ["Prefer .agents/skills for portability. OpenCode can also consume configured remote skill catalogues."],
    verifiedAgainst: [{ date: VERIFIED, source: "https://opencode.ai/docs/skills/" }],
  },
];

export function hostAdapter(id: HostAdapterDefinition["id"]): HostAdapterDefinition {
  const adapter = hostAdapters.find((item) => item.id === id);
  if (!adapter) throw new Error(`Unknown DockyardOS host: ${id}`);
  return adapter;
}
