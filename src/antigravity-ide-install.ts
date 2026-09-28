import { cp, lstat, mkdir, readFile, readdir, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function bundledPluginPath(): string {
  return fileURLToPath(new URL("../integrations/antigravity/plugin", import.meta.url));
}

export function antigravityIdeGlobalPluginPath(configRoot = resolve(homedir(), ".gemini", "config")): string {
  return resolve(configRoot, "plugins", "dockyardos");
}

async function treeFiles(root: string, relativePath = ""): Promise<string[]> {
  const directory = relativePath ? resolve(root, relativePath) : root;
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of [...entries].sort((left, right) => left.name.localeCompare(right.name))) {
    const child = relativePath ? `${relativePath}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error(`Antigravity plugin tree contains a symbolic link: ${child}`);
    if (entry.isDirectory()) files.push(...await treeFiles(root, child));
    else if (entry.isFile()) files.push(child);
    else throw new Error(`Antigravity plugin tree contains an unsupported filesystem entry: ${child}`);
  }
  return files;
}

async function exists(path: string): Promise<boolean> {
  try { await lstat(path); return true; } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function sameTree(source: string, destination: string): Promise<boolean> {
  const stat = await lstat(destination);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`Antigravity global plugin destination must be a real directory: ${destination}`);
  const sourceFiles = await treeFiles(source);
  const targetFiles = await treeFiles(destination);
  if (sourceFiles.length !== targetFiles.length) return false;
  for (let index = 0; index < sourceFiles.length; index += 1) {
    if (sourceFiles[index] !== targetFiles[index]) return false;
    const [left, right] = await Promise.all([
      readFile(resolve(source, sourceFiles[index]!)),
      readFile(resolve(destination, targetFiles[index]!)),
    ]);
    if (!left.equals(right)) return false;
  }
  return true;
}

export async function installAntigravityIdeGlobalPlugin(options: { configRoot?: string; force?: boolean } = {}): Promise<{
  status: "installed" | "unchanged";
  destination: string;
  method: "antigravity-ide-global-plugin-directory";
}> {
  const source = bundledPluginPath();
  await treeFiles(source);
  const destination = antigravityIdeGlobalPluginPath(options.configRoot);
  if (await exists(destination)) {
    if (await sameTree(source, destination)) return { status: "unchanged", destination, method: "antigravity-ide-global-plugin-directory" };
    if (!options.force) {
      throw new Error(`A different DockyardOS Antigravity plugin already exists at ${destination}. DockyardOS will not overwrite it automatically; review it or use the explicit host-install/update flow.`);
    }
    await rm(destination, { recursive: true, force: true });
  }
  await mkdir(dirname(destination), { recursive: true });
  const parent = await lstat(dirname(destination));
  if (parent.isSymbolicLink() || !parent.isDirectory()) throw new Error("Antigravity global plugin parent must be a real directory.");
  await cp(source, destination, { recursive: true, errorOnExist: true, force: false });
  return { status: "installed", destination, method: "antigravity-ide-global-plugin-directory" };
}
