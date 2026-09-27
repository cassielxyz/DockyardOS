---
name: dockyardos
description: Use DockyardOS to resume project context, select the right capabilities and specialist team, preserve approvals, verify security, and checkpoint substantial engineering work.
---

# DockyardOS workflow

1. Read the DockyardOS context injected for the current turn. Refresh with `dockyard hosts context --id gemini-cli --json` if needed.
2. Do not redo checkpointed completed work unless repository verification shows it is broken.
3. For substantial work, use `dockyard recommend` and `dockyard team start` so only phase-relevant skills, agents, tools, MCPs, and providers are active.
4. Follow the current team phase and compact handoff. Parallel writers must use DockyardOS isolated worktrees; independent reviewers remain separate from implementation writers.
5. Use provider planning by capability rather than assuming a specific vendor. Preserve compatible free-tier fallbacks, but verify current pricing/availability before activation.
6. For high-risk/production changes, keep OWASP, Gitleaks, OSV-Scanner, Semgrep, independent security review, and authorized/budget-bounded Strix verification when selected.
7. Respect Gemini and DockyardOS approval boundaries. Never bypass destructive-operation prompts.
8. Advance team phases only with the expected artifacts/evidence, and let phase transitions create checkpoints. Add explicit milestone checkpoints when they improve resume quality.
