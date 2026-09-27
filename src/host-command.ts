import { createCheckpoint, loadLatestCheckpoint, maybeCheckpoint } from "./checkpoints.js";
import { hostAdapter, hostAdapters } from "./host-adapters.js";
import { buildPortableHostContext, inspectHosts, renderPortableHostContext } from "./host-runtime.js";
import type { DockyardHostId } from "./host-types.js";
import { evaluateCommand } from "./policy.js";
import { requireProject } from "./project.js";

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

function has(args: string[], name: string): boolean {
  return args.includes(name);
}

function print(data: unknown, json: boolean): void {
  if (json || typeof data !== "string") console.log(JSON.stringify(data, null, 2));
  else console.log(data);
}

function requiredHost(args: string[]): DockyardHostId {
  const id = value(args, "--id") as DockyardHostId | undefined;
  if (!id || !hostAdapter(id)) throw new Error("A valid --id is required (antigravity, gemini-cli, codex, claude-code, cursor, opencode, vscode)");
  return id;
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
    const context = await buildPortableHostContext(root, requiredHost(args));
    print(json ? context : renderPortableHostContext(context), json);
    return;
  }

  if (subcommand === "event") {
    const id = requiredHost(args);
    const event = value(args, "--event");
    if (!event || !["after-tool", "pre-compress", "stop"].includes(event)) throw new Error("hosts event requires --event after-tool|pre-compress|stop");
    if (event === "after-tool") {
      const checkpoint = has(args, "--mutating") ? await maybeCheckpoint(root, `${id}-auto`) : undefined;
      print({ ok: true, event, host: id, checkpoint: checkpoint?.id ?? null, skipped: !checkpoint }, true);
      return;
    }
    if (event === "pre-compress") {
      const latest = await loadLatestCheckpoint(root).catch(() => undefined);
      const checkpoint = await createCheckpoint(root, `${id}-pre-compress`, latest?.state);
      print({ ok: true, event, host: id, checkpoint: checkpoint.id }, true);
      return;
    }
    const latest = await loadLatestCheckpoint(root).catch(() => undefined);
    const checkpoint = await createCheckpoint(root, `${id}-stop`, latest?.state);
    print({ ok: true, event, host: id, checkpoint: checkpoint.id }, true);
    return;
  }

  if (subcommand === "gate") {
    const id = requiredHost(args);
    const command = value(args, "--command");
    if (!command) throw new Error("hosts gate requires --command");
    const project = await requireProject(root);
    print({ host: id, ...evaluateCommand(command, project.mode) }, true);
    return;
  }

  if (subcommand === "install-info") {
    const adapter = hostAdapter(requiredHost(args))!;
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

  throw new Error("Usage: dockyard hosts list | inspect [--id HOST] | context --id HOST [--json] | event --id HOST --event after-tool|pre-compress|stop [--mutating] | gate --id HOST --command CMD | install-info --id HOST");
}
