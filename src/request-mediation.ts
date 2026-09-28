import { createHash } from "node:crypto";
import { access, open, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { readJson, writeJsonAtomic } from "./fs-utils.js";
import { projectDirectory, projectIdForRoot } from "./project.js";
import { defaultSelectionRequest, selectCapabilities } from "./selection.js";
import { startTeamForSelection } from "./team-routing.js";
import { loadTeamRun, teamRunSummary } from "./team-state.js";
import type { HostId, SecurityLevel, SelectionResult } from "./types.js";

const MAX_TRANSCRIPT_TAIL_BYTES = 1024 * 1024;
const MAX_TASK_CHARS = 8_000;
const DEVELOPMENT_NOUN = /\b(app|application|website|web|feature|code|project|repo|repository|api|backend|frontend|ui|ux|component|page|screen|function|service|database|auth|login|security|test|workflow|extension|plugin|mcp|agent|deploy|deployment|provider|integration|bug|error|crash|refactor|migration|mobile|android|ios|flutter|next(?:\.js)?|react|typescript|javascript|python)\b/i;
const MUTATION_VERB = /\b(build|implement|create|add|change|update|fix|debug|refactor|remove|delete|migrate|integrate|deploy|redesign|rewrite|secure|test|optimi[sz]e|continue building|continue implementing)\b/i;
const QUICK_HINT = /\b(typo|rename|copy change|text change|small change|minor change|one line|single line|color|colour|spacing|padding|margin|label|title|readme wording)\b/i;
const HIGH_SECURITY_HINT = /\b(auth|authentication|authorization|oauth|password|token|secret|credential|payment|billing|database|sql|rls|permission|admin|user data|personal data|upload|encryption|crypto|security|vulnerab|owasp|production|dns|domain|webhook|api key|session|cookie)\b/i;
const CONTINUATION = /^\s*(continue|continue from where (?:you )?(?:left|stopped)|resume|carry on|go on|keep going|proceed)\b/i;

export type RequestRoute = "continuation" | "advisory" | "quick" | "team";

export interface TranscriptUserRequest {
  text: string;
  recordHash: string;
}

export interface RequestMediationState {
  schemaVersion: 1;
  projectId: string;
  conversationKey: string;
  requestHash: string;
  routedAt: string;
  route: RequestRoute;
  stack: string[];
  security: SecurityLevel;
  taskType?: string;
  recipe?: string;
  workflowProfile?: string;
  skills: string[];
  agents: string[];
  tools: string[];
  mcps: string[];
  providers: string[];
  securityGates: string[];
  team?: Record<string, unknown>;
}

export interface RequestMediationResult extends RequestMediationState {
  newRequest: boolean;
  requestAvailable: boolean;
  visibleReplyHint: string;
}

function normalizeRole(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase().replace(/[-_ ]+/g, "") : "";
}

function contentText(value: unknown, depth = 0): string[] {
  if (depth > 5 || value == null) return [];
  if (typeof value === "string") return value.trim() ? [value.trim()] : [];
  if (Array.isArray(value)) return value.flatMap((item) => contentText(item, depth + 1));
  if (typeof value !== "object") return [];
  const object = value as Record<string, unknown>;
  const direct: string[] = [];
  if (typeof object.text === "string" && object.text.trim()) direct.push(object.text.trim());
  if (typeof object.content === "string" && object.content.trim()) direct.push(object.content.trim());
  for (const key of ["content", "parts", "blocks"] as const) {
    if (object[key] && typeof object[key] !== "string") direct.push(...contentText(object[key], depth + 1));
  }
  return direct;
}

function userTextCandidates(value: unknown, depth = 0): string[] {
  if (depth > 7 || value == null) return [];
  if (Array.isArray(value)) return value.flatMap((item) => userTextCandidates(item, depth + 1));
  if (typeof value !== "object") return [];
  const object = value as Record<string, unknown>;
  const roles = [
    object.role,
    object.author,
    object.event,
    object.type,
    object.kind,
    (object.message as Record<string, unknown> | undefined)?.role,
    (object.message as Record<string, unknown> | undefined)?.author,
  ].map(normalizeRole);
  const userMarked = roles.some((role) => role === "user" || role === "human" || role === "usermessage");
  const found: string[] = [];
  if (userMarked) {
    for (const candidate of [
      object.content,
      object.text,
      object.userMessage,
      (object.message as Record<string, unknown> | undefined)?.content,
      object.message,
      (object.payload as Record<string, unknown> | undefined)?.content,
      (object.payload as Record<string, unknown> | undefined)?.message,
    ]) found.push(...contentText(candidate));
  }
  for (const [key, child] of Object.entries(object)) {
    if (["content", "text", "userMessage"].includes(key) && userMarked) continue;
    if (child && typeof child === "object") found.push(...userTextCandidates(child, depth + 1));
  }
  return found;
}

async function transcriptTail(path: string): Promise<string> {
  const file = await open(path, "r");
  try {
    const stat = await file.stat();
    const bytes = Math.min(stat.size, MAX_TRANSCRIPT_TAIL_BYTES);
    if (!bytes) return "";
    const buffer = Buffer.alloc(bytes);
    const start = Math.max(0, stat.size - bytes);
    await file.read(buffer, 0, bytes, start);
    let text = buffer.toString("utf8");
    if (start > 0) {
      const newline = text.indexOf("\n");
      text = newline >= 0 ? text.slice(newline + 1) : "";
    }
    return text;
  } finally {
    await file.close();
  }
}

export async function latestUserRequestFromTranscript(path: string): Promise<TranscriptUserRequest | undefined> {
  let tail: string;
  try {
    tail = await transcriptTail(resolve(path));
  } catch {
    return undefined;
  }
  const lines = tail.split(/\r?\n/).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]!;
    let parsed: unknown;
    try { parsed = JSON.parse(line); } catch { continue; }
    const texts = userTextCandidates(parsed).map((text) => text.replace(/\s+/g, " ").trim()).filter(Boolean);
    if (!texts.length) continue;
    const text = texts[texts.length - 1]!.slice(0, MAX_TASK_CHARS);
    return {
      text,
      recordHash: createHash("sha256").update(line).digest("hex"),
    };
  }
  return undefined;
}

export function classifyRequest(text: string): RequestRoute {
  const value = text.trim();
  if (!value) return "advisory";
  if (CONTINUATION.test(value)) return "continuation";
  const development = DEVELOPMENT_NOUN.test(value);
  const mutation = MUTATION_VERB.test(value);
  if (!development || !mutation) return "advisory";
  if (value.length <= 220 && QUICK_HINT.test(value)) return "quick";
  return "team";
}

export function inferRequestSecurity(text: string): SecurityLevel {
  return HIGH_SECURITY_HINT.test(text) ? "high" : "standard";
}

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

function addStack(target: Set<string>, value: string): void {
  if (value) target.add(value.toLowerCase());
}

export async function detectProjectStack(root: string): Promise<string[]> {
  const stack = new Set<string>();
  const packagePath = resolve(root, "package.json");
  if (await exists(packagePath)) {
    addStack(stack, "node");
    try {
      const pkg = JSON.parse(await readFile(packagePath, "utf8")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
      const dependencies = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
      if (dependencies.typescript) addStack(stack, "typescript");
      if (dependencies.next) { addStack(stack, "web"); addStack(stack, "nextjs"); }
      if (dependencies.react) { addStack(stack, "web"); addStack(stack, "react"); }
      if (dependencies.vue) { addStack(stack, "web"); addStack(stack, "vue"); }
      if (dependencies.svelte || dependencies["@sveltejs/kit"]) { addStack(stack, "web"); addStack(stack, "svelte"); }
      if (dependencies["@supabase/supabase-js"] || dependencies["@supabase/ssr"]) { addStack(stack, "supabase"); addStack(stack, "postgres"); }
      if (dependencies.firebase) addStack(stack, "firebase");
      if (dependencies.three || dependencies["@react-three/fiber"]) addStack(stack, "threejs");
      if (dependencies.tailwindcss) addStack(stack, "tailwind");
    } catch {}
  }
  const markers: Array<[string, string[]]> = [
    ["next.config.js", ["web", "nextjs"]],
    ["next.config.mjs", ["web", "nextjs"]],
    ["next.config.ts", ["web", "nextjs", "typescript"]],
    ["vercel.json", ["vercel"]],
    ["wrangler.toml", ["cloudflare"]],
    ["wrangler.jsonc", ["cloudflare"]],
    ["supabase/config.toml", ["supabase", "postgres"]],
    ["pubspec.yaml", ["mobile", "flutter"]],
    ["build.gradle", ["mobile", "android"]],
    ["build.gradle.kts", ["mobile", "android", "kotlin"]],
    ["pyproject.toml", ["python"]],
    ["requirements.txt", ["python"]],
  ];
  for (const [marker, values] of markers) if (await exists(resolve(root, marker))) values.forEach((value) => addStack(stack, value));
  return [...stack].sort();
}

function conversationKey(value?: string): string {
  return createHash("sha256").update(value?.trim() || "local").digest("hex").slice(0, 20);
}

function mediationPath(root: string, conversationId?: string): string {
  return resolve(projectDirectory(projectIdForRoot(root)), "request-mediation", `${conversationKey(conversationId)}.json`);
}

function selectedIds(selection: SelectionResult | undefined, key: "skills" | "agents" | "tools" | "mcps"): string[] {
  return selection ? selection[key].map((item) => item.candidate.id) : [];
}

function visibleReplyHint(state: RequestMediationState): string {
  if (state.route === "advisory") return "Answer directly using recovered project context; do not ask the user to open or operate the DockyardOS extension.";
  if (state.route === "continuation") return "Continue the recovered DockyardOS phase directly. Do not ask the user to restate context or operate the extension.";
  const capabilities = [...state.skills.slice(0, 3), ...state.agents.slice(0, 2)].slice(0, 5);
  const detail = [state.workflowProfile ?? state.route, capabilities.length ? capabilities.join(", ") : "project routing", `security ${state.security}`].join(" · ");
  return `In the first user-visible progress reply for this request, include one concise line beginning \"DockyardOS active — ${detail}\". Then execute normally. Do not tell the user to open the extension or manually invoke DockyardOS.`;
}

export async function mediateAgentRequest(root: string, input: {
  transcriptPath?: string;
  conversationId?: string;
  host?: HostId;
}): Promise<RequestMediationResult> {
  const transcriptRequest = input.transcriptPath ? await latestUserRequestFromTranscript(input.transcriptPath) : undefined;
  const key = conversationKey(input.conversationId);
  if (!transcriptRequest) {
    const fallback: RequestMediationState = {
      schemaVersion: 1,
      projectId: projectIdForRoot(root),
      conversationKey: key,
      requestHash: "unavailable",
      routedAt: new Date().toISOString(),
      route: "advisory",
      stack: await detectProjectStack(root),
      security: "standard",
      skills: [], agents: [], tools: [], mcps: [], providers: [], securityGates: [],
    };
    return { ...fallback, newRequest: false, requestAvailable: false, visibleReplyHint: "DockyardOS could not parse the newest transcript request. Preserve recovered project context and use DockyardOS routing before substantial implementation; do not ask the user to operate the extension." };
  }

  const requestHash = createHash("sha256").update(`${transcriptRequest.recordHash}\n${transcriptRequest.text}`).digest("hex");
  const previous = await readJson<RequestMediationState>(mediationPath(root, input.conversationId));
  if (previous && previous.requestHash === requestHash) {
    return { ...previous, newRequest: false, requestAvailable: true, visibleReplyHint: visibleReplyHint(previous) };
  }

  const route = classifyRequest(transcriptRequest.text);
  const stack = await detectProjectStack(root);
  const security = inferRequestSecurity(transcriptRequest.text);
  let selection: SelectionResult | undefined;
  let team: Record<string, unknown> | undefined;
  const activeTeam = await loadTeamRun(root).catch(() => undefined);
  const hasActiveTeam = Boolean(activeTeam && activeTeam.status !== "completed" && activeTeam.status !== "cancelled");

  if (route === "team" || route === "quick") {
    const request = defaultSelectionRequest({ task: transcriptRequest.text, stack, security, host: input.host ?? "antigravity" });
    if (route === "quick") {
      request.maxSkills = Math.min(request.maxSkills, 4);
      request.maxAgents = Math.min(request.maxAgents, 2);
      request.maxTools = Math.min(request.maxTools, 3);
      request.maxMcps = Math.min(request.maxMcps, 2);
    }
    selection = selectCapabilities(request);
    if (route === "team") {
      if (hasActiveTeam && activeTeam) team = teamRunSummary(activeTeam);
      else team = teamRunSummary((await startTeamForSelection(root, transcriptRequest.text, selection)).state);
    }
  } else if (route === "continuation" && hasActiveTeam && activeTeam) {
    team = teamRunSummary(activeTeam);
  }

  const state: RequestMediationState = {
    schemaVersion: 1,
    projectId: projectIdForRoot(root),
    conversationKey: key,
    requestHash,
    routedAt: new Date().toISOString(),
    route,
    stack,
    security: selection?.request.security ?? security,
    ...(selection ? { taskType: selection.request.taskType } : {}),
    ...(route === "quick"
      ? { workflowProfile: "fast" }
      : selection?.recipe
        ? { recipe: selection.recipe.id, workflowProfile: selection.recipe.workflowProfile }
        : {}),
    skills: selectedIds(selection, "skills"),
    agents: selectedIds(selection, "agents"),
    tools: selectedIds(selection, "tools"),
    mcps: selectedIds(selection, "mcps"),
    providers: selection?.providers.map((provider) => provider.id) ?? [],
    securityGates: selection?.securityGates ?? [],
    ...(team ? { team } : {}),
  };
  const { team: _team, ...persistentState } = state;
  await writeJsonAtomic(mediationPath(root, input.conversationId), persistentState);
  return { ...state, newRequest: true, requestAvailable: true, visibleReplyHint: visibleReplyHint(state) };
}

export function requestMediationAgentText(state: RequestMediationResult): string[] {
  const lines = [
    "DOCKYARDOS REQUEST MEDIATION: ACTIVE",
    `Route: ${state.route}${state.workflowProfile ? ` / ${state.workflowProfile}` : ""}`,
    state.stack.length ? `Detected stack: ${state.stack.join(", ")}` : "Detected stack: not yet identified",
    `Security: ${state.security}`,
    state.skills.length ? `Selected skills: ${state.skills.join(", ")}` : "",
    state.agents.length ? `Selected agents: ${state.agents.join(", ")}` : "",
    state.tools.length ? `Selected tools: ${state.tools.join(", ")}` : "",
    state.mcps.length ? `Selected MCPs: ${state.mcps.join(", ")}` : "",
    state.providers.length ? `Provider candidates: ${state.providers.join(", ")}` : "",
    state.securityGates.length ? `Security gates: ${state.securityGates.join(", ")}` : "",
    state.team ? `Team: ${JSON.stringify(state.team)}` : "",
    state.visibleReplyHint,
    state.newRequest && state.route === "team"
      ? "This team/routing was created by DockyardOS before model execution. Use it; do not replace it with an unrelated generic plan."
      : "",
    "DockyardOS decisions are orchestration guidance; the user's explicit requirement remains authoritative. Approval hooks remain authoritative for risky mutations.",
  ];
  return lines.filter(Boolean);
}
