import { hostAdapter, hostAdapters } from "./host-adapters.js";
import { buildPortableHostContext, inspectHosts, renderPortableHostContext } from "./host-runtime.js";
import type { DockyardHostId } from "./host-types.js";

function values(args: string[], name: string): string[] {
  const result: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === name && args[index + 1]) {
      result.push(...args[index + 1]!.split(",").map((value) => value.trim()).filter(Boolean));
    }
  }
  return result;
}

function value(args: string[], name: string): string | undefined {
  return values(args, name)[0];
}

function print(data: unknown, json: boolean): void {
  if (json || typeof data !== "string") console.log(JSON.stringify(data, null, 2));
  else console.log(data);
}

export async function handleHostCommand(root: string, args: string[], json = false): Promise<void> {
  const subcommand = args[0] ?? "list";
  if (subcommand === "list") {
    print(hostAdapters.map((adapter) => ({
      id: adapter.id,
      name: adapter.displayName,
      mode: adapter.integrationMode,
      capabilities: adapter.capabilities,
      integration: adapter.integrationDirectory,
    })), true);
    return;
  }

  if (subcommand === "inspect") {
    print(await inspectHosts(values(args, "--id")), true);
    return;
  }

  if (subcommand === "context") {
    const id = value(args, "--id") as DockyardHostId | undefined;
    if (!id || !hostAdapter(id)) throw new Error("hosts context requires a valid --id (antigravity, gemini-cli, codex, claude-code, cursor, opencode, vscode)");
    const context = await buildPortableHostContext(root, id);
    print(json ? context : renderPortableHostContext(context), json);
    return;
  }

  if (subcommand === "install-info") {
    const id = value(args, "--id");
    const adapter = id ? hostAdapter(id) : undefined;
    if (!adapter) throw new Error("hosts install-info requires a valid --id");
    print({
      id: adapter.id,
      name: adapter.displayName,
      integrationMode: adapter.integrationMode,
      integrationDirectory: adapter.integrationDirectory,
      installHint: adapter.installHint,
      verifyHint: adapter.verifyHint,
      notes: adapter.notes,
    }, true);
    return;
  }

  throw new Error("Usage: dockyard hosts list | inspect [--id HOST] | context --id HOST [--json] | install-info --id HOST");
}
