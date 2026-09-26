import { access, mkdir } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";
import type { DoctorCheck } from "./types.js";
import { commandExists, run } from "./process.js";
import { dockyardHome, findWorkspaceRoot, loadProject } from "./project.js";
import { loadLatestCheckpoint } from "./checkpoints.js";

export async function runDoctor(start = process.cwd()): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];
  const major = Number(process.versions.node.split(".")[0]);
  checks.push({ name: "Node.js", status: major >= 20 ? "pass" : "fail", detail: `v${process.versions.node} (requires >=20)` });

  const gitAvailable = commandExists("git");
  checks.push({ name: "Git", status: gitAvailable ? "pass" : "fail", detail: gitAvailable ? run("git", ["--version"]).stdout : "git not found" });

  try {
    await mkdir(dockyardHome(), { recursive: true });
    await access(dockyardHome(), constants.R_OK | constants.W_OK);
    checks.push({ name: "Dockyard home", status: "pass", detail: dockyardHome() });
  } catch (error) {
    checks.push({ name: "Dockyard home", status: "fail", detail: String(error) });
  }

  const root = findWorkspaceRoot(start);
  const project = await loadProject(root);
  checks.push({ name: "Project", status: project ? "pass" : "warn", detail: project ? `${project.name} (${project.mode})` : "not initialized; run dockyard init" });

  if (project) {
    const latest = await loadLatestCheckpoint(root).catch(() => undefined);
    checks.push({ name: "Checkpoint", status: latest ? "pass" : "warn", detail: latest ? `${latest.id} @ ${latest.createdAt}` : "no checkpoint yet" });
  }

  const agy = commandExists("agy");
  checks.push({ name: "Antigravity CLI", status: agy ? "pass" : "warn", detail: agy ? run("agy", ["--version"]).stdout || "agy detected" : "optional; not detected on PATH" });

  const integrationPath = resolve(root, "integrations", "antigravity", "plugin", "plugin.json");
  try {
    await access(integrationPath, constants.R_OK);
    checks.push({ name: "Antigravity plugin bundle", status: "pass", detail: integrationPath });
  } catch {
    checks.push({ name: "Antigravity plugin bundle", status: "warn", detail: "not present in this workspace" });
  }

  return checks;
}
