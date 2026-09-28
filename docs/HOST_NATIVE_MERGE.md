# Safe Host-Native Configuration Merge

P24 lets DockyardOS install selected review-first native project integrations without recursively copying a bundle or clobbering an existing host configuration.

The portable DockyardOS Agent Skill remains the default integration. Use P24 only when the host-native MCP/instruction/reviewer surface is useful for the project.

## Supported P24 hosts

```text
claude-code
cursor
opencode
codex
```

Antigravity and Gemini CLI already have verified plugin/extension installation surfaces and therefore do not use this project-file merge path.

## Review first, then apply

Create a read-only plan:

```bash
dockyard host native plan --host claude-code
```

The plan reports every explicit source/destination rule, current/source/proposed SHA-256 values, action status, conflicts, and a `planSha256`.

Apply only the exact reviewed plan:

```bash
dockyard host native apply \
  --host claude-code \
  --approve \
  --expected-plan-sha256 <planSha256>
```

DockyardOS re-plans immediately before writing. If any relevant source or destination changed after review, the plan digest changes and apply aborts.

If any action is `review-required`, DockyardOS aborts the **whole** apply instead of partially installing the remaining files.

## Merge strategies

### MCP map

Used for strict-JSON MCP files such as Claude `.mcp.json` and Cursor `.cursor/mcp.json`.

DockyardOS may add only:

```text
mcpServers.dockyardos
```

All unrelated top-level keys and MCP servers are preserved. If an existing `mcpServers.dockyardos` differs, or the existing file is malformed/non-object JSON, the file becomes `review-required`.

### Marked instruction block

Used for shared files such as `CLAUDE.md` and OpenCode `AGENTS.md`.

DockyardOS appends exactly one block:

```text
<!-- dockyardos:native:start -->
...DockyardOS instructions...
<!-- dockyardos:native:end -->
```

Existing project instructions are preserved. A matching block is idempotent. A customized or malformed marked block is never replaced automatically.

### Dockyard-owned unique file

Used for paths whose name/location is owned specifically by DockyardOS, such as:

```text
.cursor/rules/dockyardos.mdc
.opencode/agents/dockyard-reviewer.md
.dockyard/plugins/openai/...
```

The file may be created when absent and is unchanged when identical. Different existing content is `review-required`; there is no force-overwrite path.

### Create-only JSONC

OpenCode's `opencode.jsonc` can contain comments and user-specific settings. DockyardOS creates the bundled config only when the file is absent. If an existing file differs, it is left untouched and marked `review-required` rather than parsed/reformatted.

## Per-host rules

### Claude Code

- `.mcp.json` — merge only `mcpServers.dockyardos`
- `CLAUDE.md` — marked additive block

### Cursor

- `.cursor/mcp.json` — merge only `mcpServers.dockyardos`
- `.cursor/rules/dockyardos.mdc` — Dockyard-owned unique file

### OpenCode

- `opencode.jsonc` — create-only JSONC
- `AGENTS.md` — marked additive block
- `.opencode/agents/dockyard-reviewer.md` — Dockyard-owned unique file

### OpenAI Codex / Agents compatibility bundle

P24 does not spray Codex compatibility files into project root. The compatibility plugin remains confined to:

```text
.dockyard/plugins/openai/
```

Its plugin manifest, local MCP registration, and DockyardOS skill are treated as uniquely owned files inside that namespace.

## Safety invariants

P24:

- never recursively copies arbitrary native bundle content;
- uses an allowlisted per-host file map;
- requires explicit approval for mutation;
- binds approval to the exact reviewed plan SHA-256;
- rechecks current configuration immediately before writing;
- aborts the whole apply when any rule needs manual review;
- refuses symbolic-link traversal for source/destination configuration paths;
- bounds source/existing configuration reads;
- preserves unrelated MCP servers/settings;
- never provides a generic `--force` overwrite path for native configuration;
- keeps DockyardOS durable project state outside the application repository.

After apply, run:

```bash
dockyard host doctor --host <host>
```

and inspect the project diff before committing any host-native project files.
