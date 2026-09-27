import { readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import type { SecurityRunResult } from "./security-types.js";
import {
  addDependencyException,
  addSecretBaseline,
  evaluateSecurityPolicy,
  loadSecurityPolicy,
  removeSecurityException,
} from "./security-policy.js";
import { securityPolicyReminders } from "./security-policy-reminders.js";
import { exportSecuritySarif } from "./security-sarif.js";
import { projectDirectory, projectIdForRoot } from "./project.js";

function value(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function required(args: string[], name: string): string {
  const found = value(args, name);
  if (!found) throw new Error(`${name} is required`);
  return found;
}

function runsRoot(root: string): string {
  return resolve(projectDirectory(projectIdForRoot(root)), "security", "runs");
}

function isInside(root: string, candidate: string): boolean {
  const rel = relative(resolve(root), resolve(candidate));
  return rel === "" || (!rel.startsWith("..") && !rel.startsWith("/") && !rel.startsWith("\\"));
}

async function loadRunResult(root: string, path: string): Promise<SecurityRunResult> {
  const target = resolve(path);
  const allowedRoot = runsRoot(root);
  if (!isInside(allowedRoot, target)) throw new Error("Security result path must be inside this project's DockyardOS security run directory.");
  let parsed: SecurityRunResult;
  try {
    parsed = JSON.parse(await readFile(target, "utf8")) as SecurityRunResult;
  } catch (error) {
    throw new Error(`Security result could not be read: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!parsed?.runId || !Array.isArray(parsed.steps) || !["clean", "findings", "incomplete", "error"].includes(parsed.status)) {
    throw new Error("Security result file is not a valid DockyardOS normalized run result.");
  }
  const expectedDirectory = resolve(allowedRoot, parsed.runId);
  if (resolve(dirname(target)) !== expectedDirectory || resolve(parsed.artifactDirectory) !== expectedDirectory || target !== resolve(expectedDirectory, "result.json")) {
    throw new Error("Security result path/run identity does not match this project's immutable run artifact layout.");
  }
  return parsed;
}

function setGateExitCode(gate: "pass" | "accepted-risk" | "fail" | "incomplete"): void {
  if (gate === "fail") process.exitCode = 1;
  else if (gate === "incomplete") process.exitCode = 2;
}

async function handlePolicy(root: string, args: string[]): Promise<void> {
  const action = args[0] ?? "show";
  const rest = args.slice(1);
  if (action === "show") {
    console.log(JSON.stringify(await loadSecurityPolicy(root), null, 2));
    return;
  }
  if (action === "reminders") {
    console.log(JSON.stringify(await securityPolicyReminders(root, {
      withinDays: value(rest, "--within-days"),
      owner: value(rest, "--owner"),
    }), null, 2));
    return;
  }
  if (action === "add-secret") {
    const policy = await addSecretBaseline(root, {
      id: required(rest, "--id"),
      fingerprint: required(rest, "--fingerprint"),
      owner: required(rest, "--owner"),
      rationale: required(rest, "--rationale"),
      expiresAt: required(rest, "--expires"),
    });
    console.log(JSON.stringify(policy, null, 2));
    return;
  }
  if (action === "add-dependency") {
    const policy = await addDependencyException(root, {
      id: required(rest, "--id"),
      advisory: required(rest, "--advisory"),
      package: required(rest, "--package"),
      owner: required(rest, "--owner"),
      rationale: required(rest, "--rationale"),
      expiresAt: required(rest, "--expires"),
    });
    console.log(JSON.stringify(policy, null, 2));
    return;
  }
  if (action === "remove") {
    console.log(JSON.stringify(await removeSecurityException(root, required(rest, "--id")), null, 2));
    return;
  }
  if (action === "evaluate") {
    const result = await loadRunResult(root, required(rest, "--result"));
    const evaluation = await evaluateSecurityPolicy(root, result);
    console.log(JSON.stringify(evaluation, null, 2));
    setGateExitCode(evaluation.gate);
    return;
  }
  throw new Error("Usage: dockyard security policy show | reminders [--within-days 1-90] [--owner OWNER] | add-secret --id ID --fingerprint FP --owner OWNER --rationale TEXT --expires ISO | add-dependency --id ID --advisory ID --package NAME --owner OWNER --rationale TEXT --expires ISO | remove --id ID | evaluate --result PATH");
}

export async function handleSecurityEvidenceCommand(root: string, args: string[]): Promise<void> {
  const subcommand = args[0];
  const rest = args.slice(1);
  if (subcommand === "policy") return handlePolicy(root, rest);
  if (subcommand === "sarif") {
    const result = await loadRunResult(root, required(rest, "--result"));
    const policy = await evaluateSecurityPolicy(root, result);
    const exported = await exportSecuritySarif(result, policy);
    console.log(JSON.stringify({ path: exported.path, policyGate: policy.gate, runStatus: result.status }, null, 2));
    return;
  }
  throw new Error("Usage: dockyard security policy ... | sarif --result PATH");
}
