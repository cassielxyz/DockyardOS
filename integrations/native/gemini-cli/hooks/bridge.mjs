#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

function input() {
  try {
    const raw = readFileSync(0, "utf8").trim();
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function dockyard(args, cwd) {
  return execFileSync("dockyard", args, {
    cwd,
    encoding: "utf8",
    timeout: 15000,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

const payload = input();
const event = process.argv[2] ?? "context";
const cwd = payload.cwd || process.env.GEMINI_CWD || process.cwd();

try {
  if (event === "context") {
    const context = dockyard(["status", "--json"], cwd);
    const team = (() => {
      try { return dockyard(["team", "status", "--json"], cwd); } catch { return ""; }
    })();
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "BeforeAgent",
        additionalContext: `DockyardOS project state:\n${context}${team ? `\nActive team:\n${team}` : ""}\nResume this state; do not redo completed work.`,
      },
      suppressOutput: true,
    }));
  } else if (event === "after-tool") {
    dockyard(["checkpoint", "--reason", "gemini-auto"], cwd);
    console.log(JSON.stringify({ suppressOutput: true }));
  } else if (event === "pre-compress") {
    dockyard(["checkpoint", "--reason", "gemini-pre-compress"], cwd);
    console.log(JSON.stringify({ suppressOutput: true }));
  } else if (event === "stop") {
    dockyard(["checkpoint", "--reason", "gemini-stop"], cwd);
    console.log(JSON.stringify({ suppressOutput: true }));
  } else {
    console.log(JSON.stringify({}));
  }
} catch (error) {
  console.error(`DockyardOS Gemini hook warning: ${error instanceof Error ? error.message : String(error)}`);
  console.log(JSON.stringify({ suppressOutput: true }));
}
