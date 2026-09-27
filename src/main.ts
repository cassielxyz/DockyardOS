#!/usr/bin/env node
import { findWorkspaceRoot } from "./project.js";
import { handleTeamCommand } from "./team-command.js";
import { handleHostCommand } from "./host-command.js";
import { handleCommunityCommand } from "./community-command.js";
import { handleProviderActionCommand } from "./provider-command.js";
import { handleSecurityEvidenceCommand } from "./security-command.js";

const [, , command, ...args] = process.argv;

try {
  if (command === "team") {
    await handleTeamCommand(findWorkspaceRoot(), args, args.includes("--json"));
  } else if (command === "host") {
    await handleHostCommand(findWorkspaceRoot(), args, args.includes("--json"));
  } else if (command === "community") {
    await handleCommunityCommand(args, args.includes("--json"));
  } else if (command === "providers" && (args[0] === "actions" || args[0] === "action" || args[0] === "preview")) {
    await handleProviderActionCommand(findWorkspaceRoot(), args);
  } else if (command === "security" && (args[0] === "policy" || args[0] === "sarif")) {
    await handleSecurityEvidenceCommand(findWorkspaceRoot(), args);
  } else {
    await import("./cli.js");
  }
} catch (error) {
  console.error(`DockyardOS error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
