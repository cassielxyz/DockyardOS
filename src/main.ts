#!/usr/bin/env node
import { findWorkspaceRoot } from "./project.js";
import { handleTeamCommand } from "./team-command.js";

const [, , command, ...args] = process.argv;

if (command === "team") {
  try {
    await handleTeamCommand(findWorkspaceRoot(), args, args.includes("--json"));
  } catch (error) {
    console.error(`DockyardOS error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
} else {
  await import("./cli.js");
}
