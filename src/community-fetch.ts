import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, rm } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import type { CommunityPackageManifest, CommunityResolution, CommunityScanFinding, CommunityScanReport } from "./community-types.js";
import { dockyardHome } from "./project.js";
import { run, type RunOptions } from "./process.js";
import type { PermissionId } from "./types.js";

const SCRIPT_EXTENSIONS = new Set([".sh", ".bash", ".zsh", ".fish", ".ps1", ".bat", ".cmd", ".py", ".js", ".mjs", ".cjs", ".ts", ".tsx"]);
const BINARY_EXTENSIONS = new Set([".exe", ".dll", ".so", ".dylib", ".bin", ".msi", ".apk", ".jar", ".class", ".wasm"]);
const SENSITIVE_NAMES = [/^\.env(?:\.|$)/i, /^id_(?:rsa|ed25519|ecdsa)$/i, /(?:private|secret).*key/i, /\.p(?:em|12|fx)$/i];
const MAX_DIRECTORY_DEPTH = 64;

interface ScannedFile {
  absolute: string;
  relative: string;
  bytes: number;
  executable: boolean;
}

function safeSubdirectory(value?: string): string {
  if (!value) return ".";
  if (value.startsWith("/") || value.startsWith("~") || value.includes("\\")) throw new Error("Community package subdirectory must be a safe relative path.");
  const parts = value.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) throw new Error("Community package subdirectory contains unsafe traversal components.");
  return value;
}

function sourceUrl(repository: string): string {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error(`Unsafe GitHub repository locator: ${repository}`);
  return `https://github.com/${repository}.git`;
}

function ensureInside(root: string, candidate: string): string {
  const resolvedRoot = resolve(root);
  const resolved = resolve(candidate);
  const rel = relative(resolvedRoot, resolved);
  if (rel === "" || (rel !== ".." && !rel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) && !rel.startsWith("/"))) return resolved;
  throw new Error(`Path escaped quarantine root: ${candidate}`);
}

function isolatedGitEnvironment(): Record<string, string | undefined> {
  return {
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
    GIT_TERMINAL_PROMPT: "0",
    GCM_INTERACTIVE: "Never",
    GIT_LFS_SKIP_SMUDGE: "1",
  };
}

function runGit(args: string[], cwd: string, options: Omit<RunOptions, "cwd" | "env"> = {}) {
  return run("git", args, { cwd, env: isolatedGitEnvironment(), ...options });
}

async function walk(root: string, maxFiles: number, maxBytes: number): Promise<{ files: ScannedFile[]; findings: CommunityScanFinding[] }> {
  const files: ScannedFile[] = [];
  const findings: CommunityScanFinding[] = [];
  let totalBytes = 0;
  let entriesSeen = 0;
  const maxEntries = Math.max(maxFiles * 4, maxFiles + 256);

  async function visit(directory: string, depth: number): Promise<void> {
    if (depth > MAX_DIRECTORY_DEPTH) throw new Error(`Community package exceeds directory depth limit (${MAX_DIRECTORY_DEPTH}).`);
    const entries = await readdir(directory, { withFileTypes: true });
    entriesSeen += entries.length;
    if (entriesSeen > maxEntries) throw new Error(`Community package exceeds filesystem entry limit (${maxEntries}).`);

    for (const entry of entries) {
      if (entry.name === ".git") continue;
      const absolute = ensureInside(root, resolve(directory, entry.name));
      const rel = relative(root, absolute).replace(/\\/g, "/");
      const metadata = await lstat(absolute);
      if (metadata.isSymbolicLink()) {
        findings.push({ severity: "critical", code: "symlink", path: rel, detail: "Symbolic links are rejected in community package quarantine to prevent path escape/confused-deputy reads." });
        continue;
      }
      if (metadata.isDirectory()) {
        await visit(absolute, depth + 1);
        continue;
      }
      if (!metadata.isFile()) {
        findings.push({ severity: "critical", code: "special-file", path: rel, detail: "Non-regular files are not allowed in community packages." });
        continue;
      }
      const bytes = Number(metadata.size ?? 0);
      totalBytes += bytes;
      files.push({ absolute, relative: rel, bytes, executable: (Number(metadata.mode ?? 0) & 0o111) !== 0 });
      if (files.length > maxFiles) throw new Error(`Community package exceeds file limit (${maxFiles}).`);
      if (totalBytes > maxBytes) throw new Error(`Community package exceeds byte limit (${maxBytes}).`);
    }
  }

  await visit(root, 0);
  return { files, findings };
}

async function contentDigest(files: ScannedFile[]): Promise<string> {
  const hash = createHash("sha256");
  for (const file of [...files].sort((a, b) => a.relative.localeCompare(b.relative))) {
    hash.update(file.relative);
    hash.update("\0");
    hash.update(file.executable ? "100755" : "100644");
    hash.update("\0");
    hash.update(await readFile(file.absolute));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function uniquePermissions(values: PermissionId[]): PermissionId[] {
  return [...new Set(values)].sort();
}

function gitObjectBytes(output: string): number {
  let kib = 0;
  for (const line of output.split(/\r?\n/)) {
    const match = /^(size|size-pack):\s*(\d+)\s*$/.exec(line.trim());
    if (match) kib += Number(match[2]);
  }
  return kib * 1024;
}

export async function scanCommunityPackageTree(root: string, pkg: CommunityPackageManifest, revision: string): Promise<CommunityScanReport> {
  const maxFiles = pkg.maxFiles ?? 1000;
  const maxBytes = pkg.maxBytes ?? 20 * 1024 * 1024;
  const walked = await walk(root, maxFiles, maxBytes);
  const findings = [...walked.findings];
  const executableFiles: string[] = [];
  const scriptFiles: string[] = [];
  const inferred: PermissionId[] = ["filesystem-read"];
  let bytes = 0;

  for (const file of walked.files) {
    bytes += file.bytes;
    const extension = extname(file.relative).toLowerCase();
    const basename = file.relative.split("/").pop() ?? file.relative;
    if (file.executable) {
      executableFiles.push(file.relative);
      inferred.push("shell");
      findings.push({ severity: "medium", code: "executable-bit", path: file.relative, detail: "File is executable; activation may run code rather than only load declarative instructions." });
    }
    if (SCRIPT_EXTENSIONS.has(extension)) {
      scriptFiles.push(file.relative);
      inferred.push("shell");
      findings.push({ severity: "medium", code: "script-file", path: file.relative, detail: `Executable/script-like source (${extension}) requires additional review before automatic activation.` });
    }
    if (BINARY_EXTENSIONS.has(extension)) {
      inferred.push("shell");
      findings.push({ severity: "high", code: "binary-file", path: file.relative, detail: `Binary/executable artifact (${extension}) is not eligible for silent community activation.` });
    }
    if (SENSITIVE_NAMES.some((pattern) => pattern.test(basename))) {
      findings.push({ severity: "high", code: "sensitive-file-name", path: file.relative, detail: "Package contains a file name commonly associated with secrets or private keys." });
    }
    if (basename === "package.json" && file.bytes <= 1024 * 1024) {
      try {
        const parsed = JSON.parse(await readFile(file.absolute, "utf8")) as { scripts?: Record<string, string> };
        const scripts = parsed.scripts ?? {};
        if (Object.keys(scripts).length) {
          inferred.push("shell");
          findings.push({ severity: "medium", code: "package-scripts", path: file.relative, detail: `package.json declares scripts: ${Object.keys(scripts).join(", ")}` });
          const lifecycle = ["preinstall", "install", "postinstall", "prepare"].filter((name) => scripts[name]);
          if (lifecycle.length) findings.push({ severity: "high", code: "install-lifecycle-script", path: file.relative, detail: `Install lifecycle scripts require explicit approval: ${lifecycle.join(", ")}` });
        }
      } catch {
        findings.push({ severity: "medium", code: "invalid-package-json", path: file.relative, detail: "package.json could not be parsed during quarantine scanning." });
      }
    }
  }

  const present = new Set(walked.files.map((file) => file.relative));
  const entrypointsPresent = pkg.entrypoints.filter((entrypoint) => present.has(entrypoint.path)).map((entrypoint) => entrypoint.path);
  const entrypointsMissing = pkg.entrypoints.filter((entrypoint) => !present.has(entrypoint.path)).map((entrypoint) => entrypoint.path);
  if (entrypointsMissing.length) findings.push({ severity: "critical", code: "missing-entrypoint", detail: `Declared entrypoints are missing: ${entrypointsMissing.join(", ")}` });

  const checks: CommunityScanReport["canary"]["checks"] = [];
  checks.push({ name: "entrypoints", status: entrypointsMissing.length ? "fail" : "pass", detail: entrypointsMissing.length ? `${entrypointsMissing.length} declared entrypoint(s) missing.` : "All declared entrypoints exist." });
  checks.push({ name: "symlink-special-files", status: findings.some((finding) => finding.code === "symlink" || finding.code === "special-file") ? "fail" : "pass", detail: "Quarantine rejects symlinks and special files before reading package content." });

  for (const entrypoint of pkg.entrypoints.filter((item) => item.type === "skill" && present.has(item.path))) {
    const file = walked.files.find((candidate) => candidate.relative === entrypoint.path)!;
    const text = file.bytes <= 2 * 1024 * 1024 ? await readFile(file.absolute, "utf8") : "";
    const skillValid = text.startsWith("---") && /\nname\s*:/i.test(text) && /\ndescription\s*:/i.test(text);
    checks.push({ name: `skill:${entrypoint.path}`, status: skillValid ? "pass" : "fail", detail: skillValid ? "SKILL.md has frontmatter with name and description." : "SKILL.md frontmatter is missing required name/description metadata." });
    if (!skillValid) findings.push({ severity: "high", code: "invalid-skill", path: entrypoint.path, detail: "Declared Agent Skill entrypoint is structurally invalid." });
  }

  const canaryStatus = checks.some((check) => check.status === "fail") || findings.some((finding) => finding.severity === "critical")
    ? "fail"
    : findings.some((finding) => ["medium", "high"].includes(finding.severity))
      ? "warn"
      : "pass";

  return {
    packageId: pkg.id,
    revision,
    files: walked.files.length,
    bytes,
    executableFiles,
    scriptFiles,
    entrypointsPresent,
    entrypointsMissing,
    findings,
    inferredPermissions: uniquePermissions(inferred),
    canary: { status: canaryStatus, checks },
  };
}

export async function resolveAndQuarantine(pkg: CommunityPackageManifest): Promise<{ resolution: CommunityResolution; scan: CommunityScanReport }> {
  const source = sourceUrl(pkg.source.repository);
  const runId = `${new Date().toISOString().replace(/[-:.]/g, "")}-${Math.random().toString(16).slice(2, 10)}`;
  const quarantinePath = resolve(dockyardHome(), "community", "quarantine", pkg.id, runId);
  await mkdir(quarantinePath, { recursive: true });

  try {
    const init = runGit(["init", "--quiet"], quarantinePath, { timeoutMs: 10_000, maxOutputBytes: 8_192 });
    if (!init.ok) throw new Error(`git init failed: ${init.stderr || init.stdout}`);
    await mkdir(resolve(quarantinePath, ".git", "dockyard-empty-hooks"), { recursive: true });
    const hooks = runGit(["config", "core.hooksPath", ".git/dockyard-empty-hooks"], quarantinePath, { timeoutMs: 5_000, maxOutputBytes: 4_096 });
    if (!hooks.ok) throw new Error(`git hook isolation failed: ${hooks.stderr || hooks.stdout}`);
    const remote = runGit(["remote", "add", "origin", source], quarantinePath, { timeoutMs: 10_000, maxOutputBytes: 8_192 });
    if (!remote.ok) throw new Error(`git remote failed: ${remote.stderr || remote.stdout}`);
    const fetched = runGit(["fetch", "--depth=1", "--no-tags", "origin", pkg.source.ref], quarantinePath, { timeoutMs: 120_000, maxOutputBytes: 32_768 });
    if (!fetched.ok) throw new Error(`git fetch failed for ${pkg.source.repository}@${pkg.source.ref}: ${fetched.stderr || fetched.stdout}`);

    const objectStats = runGit(["count-objects", "-v"], quarantinePath, { timeoutMs: 5_000, maxOutputBytes: 8_192 });
    if (!objectStats.ok) throw new Error(`Unable to inspect fetched Git object size: ${objectStats.stderr || objectStats.stdout}`);
    const maxPackageBytes = pkg.maxBytes ?? 20 * 1024 * 1024;
    const maxGitObjectBytes = Math.min(Math.max(maxPackageBytes * 8, 32 * 1024 * 1024), 256 * 1024 * 1024);
    const fetchedBytes = gitObjectBytes(objectStats.stdout);
    if (fetchedBytes > maxGitObjectBytes) throw new Error(`Fetched Git objects exceed quarantine limit (${fetchedBytes} > ${maxGitObjectBytes} bytes).`);

    const checkedOut = runGit(["checkout", "--quiet", "--detach", "FETCH_HEAD"], quarantinePath, { timeoutMs: 30_000, maxOutputBytes: 16_384 });
    if (!checkedOut.ok) throw new Error(`git checkout failed: ${checkedOut.stderr || checkedOut.stdout}`);
    const head = runGit(["rev-parse", "HEAD"], quarantinePath, { timeoutMs: 5_000, maxOutputBytes: 4_096 });
    if (!head.ok || !/^[a-f0-9]{40}$/i.test(head.stdout.trim())) throw new Error("Unable to resolve fetched community package to an immutable Git commit.");
    const revision = head.stdout.trim().toLowerCase();
    const packageRoot = ensureInside(quarantinePath, resolve(quarantinePath, safeSubdirectory(pkg.source.subdirectory)));
    const rootMetadata = await lstat(packageRoot).catch(() => undefined);
    if (!rootMetadata?.isDirectory()) throw new Error(`Community package subdirectory does not exist: ${pkg.source.subdirectory ?? "."}`);
    const scan = await scanCommunityPackageTree(packageRoot, pkg, revision);
    const walked = await walk(packageRoot, pkg.maxFiles ?? 1000, pkg.maxBytes ?? 20 * 1024 * 1024);
    const resolution: CommunityResolution = {
      packageId: pkg.id,
      repository: pkg.source.repository,
      requestedRef: pkg.source.ref,
      revision,
      resolvedAt: new Date().toISOString(),
      quarantinePath,
      contentSha256: await contentDigest(walked.files),
      files: walked.files.length,
      bytes: walked.files.reduce((sum, file) => sum + file.bytes, 0),
    };
    return { resolution, scan };
  } catch (error) {
    await rm(quarantinePath, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}
