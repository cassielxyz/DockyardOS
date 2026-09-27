#!/usr/bin/env node
import { findWorkspaceRoot } from "./project.js";
import { handleTeamCommand } from "./team-command.js";
import { handleHostCommand } from "./host-command.js";
import { handleCommunityCommand } from "./community-command.js";

const [, , command, ...args] = process.argv;

try {
  if (command === "team") {
    await handleTeamCommand(findWorkspaceRoot(), args, args.includes("--json"));
  } else if (command === "host") {
    await handleHostCommand(findWorkspaceRoot(), args, args.includes("--json"));
  } else if (command === "community") {
    await handleCommunityCommand(args, args.includes("--json"));
  } else {
    await import("./cli.js");
  }
} catch (error) {
  console.error(`DockyardOS error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
