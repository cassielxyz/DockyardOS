import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { HostId } from "./types.js";

export type NativeMergeStrategy = "mcp-map" | "owned-file" | "instruction-block" | "create-only-jsonc";
export type NativeMergeStatus = "create" | "merge" | "append" | "unchanged" | "review-required";

export interface NativeMergeRule {
  source: string;
  destination: string;
  strategy: NativeMergeStrategy;
  note: string;
}

export interface NativeMergeAction {
  source: string;
  destination: string;
  strategy: NativeMergeStrategy;
  status: NativeMergeStatus;
  reason: string;
  sourceSha256: string;
  currentSha256?: string;
  proposedSha256?: string;
}

export interface NativeMergePlan {
  schemaVersion: 1;
  host: HostId;
  workspaceRoot: string;
  createdAt: string;
  planSha256: string;
  approvalRequired: true;
  reviewRequired: boolean;
  actions: NativeMergeAction[];
  notes: string[];
}

export interface NativeMergeApplyResult {
  schemaVersion: 1;
  host: HostId;
  workspaceRoot: string;
  planSha256: string;
  appliedAt: string;
  status: "applied" | "unchanged";
  results: Array<{ destination: string; status: "created" | "updated" | "unchanged" }>;
}

interface AnalysisResult {
  plan: NativeMergePlan;
  proposed: Map<string, string>;
}

const BEGIN = "<!-- dockyardos:native:start -->";
const END = "<!-- dockyardos:native:end -->";
const MAX_CONFIG_BYTES = 512 * 1024;
const PLAN_SHA = /^[a-f0-9]{64}$/i;

const rulesByHost: Partial<Record<HostId, NativeMergeRule[]>> = {
  "claude-code": [
    { source: ".mcp.json", destination: ".mcp.json", strategy: "mcp-map", note: "Merge only the dockyardos MCP server entry and preserve every unrelated MCP server/config key." },
    { source: "CLAUDE.md", destination: "CLAUDE.md", strategy: "instruction-block", note: "Append one marked DockyardOS block to the shared Claude instruction file." },
  ],
  cursor: [
    { source: ".cursor/mcp.json", destination: ".cursor/mcp.json", strategy: "mcp-map", note: "Merge only the dockyardos MCP server entry and preserve unrelated Cursor MCP servers." },
    { source: ".cursor/rules/dockyardos.mdc", destination: ".cursor/rules/dockyardos.mdc", strategy: "owned-file", note: "DockyardOS owns this uniquely named Cursor rule; a different existing file requires review." },
  ],
  opencode: [
    { source: "opencode.jsonc", destination: "opencode.jsonc", strategy: "create-only-jsonc", note: "OpenCode JSONC is created when absent; an existing non-identical JSONC file is never rewritten automatically." },
    { source: "AGENTS.md", destination: "AGENTS.md", strategy: "instruction-block", note: "Append one marked DockyardOS block to shared project instructions." },
    { source: ".opencode/agents/dockyard-reviewer.md", destination: ".opencode/agents/dockyard-reviewer.md", strategy: "owned-file", note: "DockyardOS owns this uniquely named read-only reviewer definition." },
  ],
  codex: [
    { source: ".codex-plugin/plugin.json", destination: ".dockyard/plugins/openai/.codex-plugin/plugin.json", strategy: "owned-file", note: "Install the compatibility plugin only inside DockyardOS's dedicated project namespace." },
    { source: ".mcp.json", destination: ".dockyard/plugins/openai/.mcp.json", strategy: "owned-file", note: "Keep plugin-local MCP registration inside DockyardOS's dedicated project namespace." },
    { source: "skills/dockyardos/SKILL.md", destination: ".dockyard/plugins/openai/skills/dockyardos/SKILL.md", strategy: "owned-file", note: "Install the plugin skill only inside DockyardOS's dedicated project namespace." },
  ],
};

function bundleRoot(host: HostId): string {
  return fileURLToPath(new URL(`../integrations/native/${host}`, import.meta.url));
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stable(object[key])}`).join(",")}}`;
}

function planDigest(host: HostId, actions: NativeMergeAction[]): string {
  return sha256(stable({
    schemaVersion: 1,
    host,
    actions: actions.map((action) => ({
      source: action.source,
      destination: action.destination,
      strategy: action.strategy,
      status: action.status,
      sourceSha256: action.sourceSha256,
      currentSha256: action.currentSha256 ?? null,
      proposedSha256: action.proposedSha256 ?? null,
    })),
  }));
}

function safeRelativePath(path: string, label: string): string {
  const normalized = path.replace(/\\/g, "/");
  if (!normalized || normalized.startsWith("/") || normalized.includes("\0") || normalized.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error(`${label} is not a safe relative path: ${path}`);
  }
  return normalized;
}

function inside(root: string, candidate: string): boolean {
  const rel = relative(resolve(root), resolve(candidate));
  return rel === "" || (!rel.startsWith("..") && !rel.startsWith("/") && !rel.startsWith("\\"));
}

async function assertNoSymlinkParents(root: string, destination: string): Promise<void> {
  const absoluteRoot = resolve(root);
  const absolute = resolve(root, destination);
  if (!inside(absoluteRoot, absolute)) throw new Error(`Native bundle destination escapes the workspace: ${destination}`);
  const rel = relative(absoluteRoot, absolute).split(/[\\/]/).filter(Boolean);
  let current = absoluteRoot;
  for (const part of rel) {
    current = resolve(current, part);
    try {
      const stat = await lstat(current);
      if (stat.isSymbolicLink()) throw new Error(`Native bundle destination traverses a symbolic link: ${relative(absoluteRoot, current)}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
  }
}

async function readOptional(path: string): Promise<string | undefined> {
  try {
    const stat = await lstat(path);
    if (stat.isSymbolicLink()) throw new Error(`Refusing to merge a symbolic-link configuration file: ${path}`);
    if (!stat.isFile()) throw new Error(`Refusing to merge a non-file configuration path: ${path}`);
    if (stat.size > MAX_CONFIG_BYTES) throw new Error(`Existing host configuration exceeds the ${MAX_CONFIG_BYTES}-byte merge bound: ${path}`);
    const value = await readFile(path, "utf8");
    if (value.includes("\0")) throw new Error(`Existing host configuration contains NUL bytes: ${path}`);
    return value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function mergeMcpMap(source: string, current: string | undefined): { status: NativeMergeStatus; reason: string; proposed?: string } {
  let template: Record<string, unknown>;
  try {
    template = asObject(JSON.parse(source)) ?? (() => { throw new Error(); })();
  } catch {
    throw new Error("Bundled MCP template is not a JSON object.");
  }
  const templateServers = asObject(template.mcpServers);
  const dockyard = templateServers?.dockyardos;
  if (!templateServers || dockyard === undefined || Object.keys(templateServers).length !== 1) {
    throw new Error("Bundled MCP template must contain exactly one mcpServers.dockyardos entry.");
  }
  if (current === undefined) return { status: "create", reason: "Target MCP configuration does not exist.", proposed: `${JSON.stringify(template, null, 2)}\n` };

  let existing: Record<string, unknown>;
  try {
    existing = asObject(JSON.parse(current)) ?? (() => { throw new Error(); })();
  } catch {
    return { status: "review-required", reason: "Existing MCP configuration is not strict JSON; DockyardOS will not rewrite it automatically." };
  }
  const currentServersValue = existing.mcpServers;
  if (currentServersValue !== undefined && !asObject(currentServersValue)) {
    return { status: "review-required", reason: "Existing mcpServers value is not a JSON object." };
  }
  const currentServers = asObject(currentServersValue) ?? {};
  if (currentServers.dockyardos !== undefined) {
    if (stable(currentServers.dockyardos) === stable(dockyard)) return { status: "unchanged", reason: "Existing dockyardos MCP entry already matches the bundled definition." };
    return { status: "review-required", reason: "Existing mcpServers.dockyardos differs from the bundled definition; explicit manual reconciliation is required." };
  }
  const proposedObject = { ...existing, mcpServers: { ...currentServers, dockyardos: dockyard } };
  return { status: "merge", reason: "Add only mcpServers.dockyardos while preserving unrelated configuration.", proposed: `${JSON.stringify(proposedObject, null, 2)}\n` };
}

function instructionBlock(source: string): string {
  const body = source.trim();
  return `${BEGIN}\n${body}\n${END}`;
}

function mergeInstruction(source: string, current: string | undefined): { status: NativeMergeStatus; reason: string; proposed?: string } {
  const block = instructionBlock(source);
  if (current === undefined) return { status: "create", reason: "Shared instruction file does not exist; create it with a marked DockyardOS block.", proposed: `${block}\n` };
  const begin = current.indexOf(BEGIN);
  const end = current.indexOf(END);
  if ((begin >= 0) !== (end >= 0) || (begin >= 0 && end < begin)) {
    return { status: "review-required", reason: "Existing DockyardOS instruction markers are malformed; automatic editing is disabled." };
  }
  if (begin >= 0) {
    const existingBlock = current.slice(begin, end + END.length);
    if (existingBlock === block) return { status: "unchanged", reason: "Existing marked DockyardOS instruction block already matches the bundled definition." };
    return { status: "review-required", reason: "Existing marked DockyardOS instruction block was customized; automatic replacement is disabled." };
  }
  const separator = current.length === 0 || current.endsWith("\n\n") ? "" : current.endsWith("\n") ? "\n" : "\n\n";
  return { status: "append", reason: "Append one marked DockyardOS block without changing existing instructions.", proposed: `${current}${separator}${block}\n` };
}

function mergeOwned(source: string, current: string | undefined): { status: NativeMergeStatus; reason: string; proposed?: string } {
  if (current === undefined) return { status: "create", reason: "DockyardOS-owned unique file is absent.", proposed: source };
  if (current === source) return { status: "unchanged", reason: "DockyardOS-owned file already matches the bundled definition." };
  return { status: "review-required", reason: "DockyardOS-owned path already contains different content; automatic overwrite is disabled." };
}

function mergeCreateOnlyJsonc(source: string, current: string | undefined): { status: NativeMergeStatus; reason: string; proposed?: string } {
  if (current === undefined) return { status: "create", reason: "OpenCode config is absent, so the reviewed bundled JSONC can be created safely.", proposed: source };
  if (current === source) return { status: "unchanged", reason: "Existing OpenCode JSONC already matches the bundled definition." };
  return { status: "review-required", reason: "Existing JSONC may contain comments or user settings; DockyardOS will not parse/reformat/overwrite it automatically." };
}

function rulesFor(host: HostId): NativeMergeRule[] {
  const rules = rulesByHost[host];
  if (!rules?.length) throw new Error(`Host ${host} does not use the P24 review-first project-file merge path.`);
  return rules;
}

async function analyzeNativeHostMerge(workspaceRoot: string, host: HostId): Promise<AnalysisResult> {
  const root = resolve(workspaceRoot);
  const sourceRoot = bundleRoot(host);
  const proposed = new Map<string, string>();
  const actions: NativeMergeAction[] = [];

  for (const rule of rulesFor(host)) {
    const sourceRel = safeRelativePath(rule.source, "Native bundle source");
    const destinationRel = safeRelativePath(rule.destination, "Native bundle destination");
    const sourcePath = resolve(sourceRoot, sourceRel);
    if (!inside(sourceRoot, sourcePath)) throw new Error(`Native bundle source escapes bundle root: ${sourceRel}`);
    const source = await readOptional(sourcePath);
    if (source === undefined) throw new Error(`Native bundle source is missing: ${host}/${sourceRel}`);
    if (Buffer.byteLength(source, "utf8") > MAX_CONFIG_BYTES) throw new Error(`Native bundle source exceeds merge bound: ${host}/${sourceRel}`);

    await assertNoSymlinkParents(root, destinationRel);
    const target = resolve(root, destinationRel);
    const current = await readOptional(target);
    let result: { status: NativeMergeStatus; reason: string; proposed?: string };
    if (rule.strategy === "mcp-map") result = mergeMcpMap(source, current);
    else if (rule.strategy === "instruction-block") result = mergeInstruction(source, current);
    else if (rule.strategy === "create-only-jsonc") result = mergeCreateOnlyJsonc(source, current);
    else result = mergeOwned(source, current);

    if (result.proposed !== undefined) proposed.set(destinationRel, result.proposed);
    actions.push({
      source: sourceRel,
      destination: destinationRel,
      strategy: rule.strategy,
      status: result.status,
      reason: `${result.reason} ${rule.note}`,
      sourceSha256: sha256(source),
      ...(current !== undefined ? { currentSha256: sha256(current) } : {}),
      ...(result.proposed !== undefined ? { proposedSha256: sha256(result.proposed) } : {}),
    });
  }

  const digest = planDigest(host, actions);
  return {
    proposed,
    plan: {
      schemaVersion: 1,
      host,
      workspaceRoot: root,
      createdAt: new Date().toISOString(),
      planSha256: digest,
      approvalRequired: true,
      reviewRequired: actions.some((action) => action.status === "review-required"),
      actions,
      notes: [
        "P24 never recursively copies a native bundle into a project.",
        "Only explicit per-host rules are eligible for automatic create/merge/append actions.",
        "Unknown, malformed, symlinked, customized, or conflicting configuration remains untouched and review-required.",
        "Apply is bound to this exact plan SHA-256 and re-plans immediately before writing.",
      ],
    },
  };
}

export async function planNativeHostMerge(workspaceRoot: string, host: HostId): Promise<NativeMergePlan> {
  return (await analyzeNativeHostMerge(workspaceRoot, host)).plan;
}

export async function applyNativeHostMerge(
  workspaceRoot: string,
  host: HostId,
  options: { approve?: boolean; expectedPlanSha256: string },
): Promise<NativeMergeApplyResult> {
  if (options.approve !== true) throw new Error("Native host configuration merge requires explicit --approve.");
  const expected = options.expectedPlanSha256.trim().toLowerCase();
  if (!PLAN_SHA.test(expected)) throw new Error("--expected-plan-sha256 must be the 64-character digest from `dockyard host native plan`.");
  const analyzed = await analyzeNativeHostMerge(workspaceRoot, host);
  if (analyzed.plan.planSha256 !== expected) throw new Error("Native host configuration changed after review; generate a fresh plan and approve its new SHA-256.");
  if (analyzed.plan.reviewRequired) {
    const blocked = analyzed.plan.actions.filter((action) => action.status === "review-required").map((action) => action.destination);
    throw new Error(`Native host merge has review-required conflicts and will not partially apply: ${blocked.join(", ")}`);
  }

  const results: NativeMergeApplyResult["results"] = [];
  for (const action of analyzed.plan.actions) {
    if (action.status === "unchanged") {
      results.push({ destination: action.destination, status: "unchanged" });
      continue;
    }
    const content = analyzed.proposed.get(action.destination);
    if (content === undefined) throw new Error(`Internal P24 error: missing proposed content for ${action.destination}`);
    await assertNoSymlinkParents(workspaceRoot, action.destination);
    const target = resolve(workspaceRoot, action.destination);
    await mkdir(dirname(target), { recursive: true });
    const temp = `${target}.dockyard-${process.pid}.tmp`;
    await writeFile(temp, content, { encoding: "utf8", mode: 0o644, flag: "wx" });
    await rename(temp, target);
    results.push({ destination: action.destination, status: action.status === "create" ? "created" : "updated" });
  }

  return {
    schemaVersion: 1,
    host,
    workspaceRoot: resolve(workspaceRoot),
    planSha256: analyzed.plan.planSha256,
    appliedAt: new Date().toISOString(),
    status: results.every((item) => item.status === "unchanged") ? "unchanged" : "applied",
    results,
  };
}

export function nativeMergeHosts(): HostId[] {
  return Object.keys(rulesByHost) as HostId[];
}
