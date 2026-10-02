import { access } from "node:fs/promises";
import { resolve } from "node:path";
import type { ProviderAdapterDefinition, ProviderProbeResult, ProviderProbeSignal, ProviderReadiness } from "./types.js";
import { commandExists, run } from "./process.js";
import { providerAdapters } from "./provider-adapters.js";

const READINESS_RANK: Record<ProviderReadiness, number> = {
  unavailable: 0,
  unknown: 1,
  installed: 2,
  configured: 3,
  authenticated: 4,
  linked: 5,
  degraded: 1,
};

async function pathExists(root: string, marker: string): Promise<boolean> {
  try {
    await access(resolve(root, marker));
    return true;
  } catch {
    return false;
  }
}

function stronger(current: ProviderReadiness, next: ProviderReadiness): ProviderReadiness {
  return READINESS_RANK[next] > READINESS_RANK[current] ? next : current;
}

function installedCommand(adapter: ProviderAdapterDefinition): string | undefined {
  return adapter.cliCommands.find((command) => commandExists(command));
}

function safeCommandLabel(command: string, args: string[]): string {
  return `${command} ${args.join(" ")}`.trim();
}

export async function probeProvider(
  adapter: ProviderAdapterDefinition,
  root: string,
  options: { live?: boolean } = {},
): Promise<ProviderProbeResult> {
  const live = options.live ?? false;
  const signals: ProviderProbeSignal[] = [];
  const command = installedCommand(adapter);
  const installed = adapter.cliCommands.length === 0 ? false : Boolean(command);
  let readiness: ProviderReadiness = installed ? "installed" : "unavailable";

  if (adapter.cliCommands.length) {
    signals.push({
      type: "cli",
      ok: installed,
      detail: installed ? `CLI detected: ${command}` : `CLI not detected (${adapter.cliCommands.join(" / ")})`,
    });
  }

  const configHits: string[] = [];
  for (const marker of adapter.configMarkers) {
    if (await pathExists(root, marker)) configHits.push(marker);
  }
  const configured = configHits.length > 0;
  if (configured) readiness = stronger(readiness, "configured");
  signals.push({
    type: "config",
    ok: configured,
    detail: configured ? `Project markers: ${configHits.join(", ")}` : "No known project configuration marker detected.",
  });

  const linkedHits: string[] = [];
  for (const marker of adapter.linkedMarkers ?? []) {
    if (await pathExists(root, marker)) linkedHits.push(marker);
  }
  let linked = linkedHits.length > 0;
  if (linked) readiness = stronger(readiness, "linked");
  if ((adapter.linkedMarkers?.length ?? 0) > 0) {
    signals.push({
      type: "linked",
      ok: linked,
      detail: linked ? `Link marker detected: ${linkedHits.join(", ")}` : "No known link marker detected.",
    });
  }

  let authenticated: boolean | undefined;
  if (live && adapter.authProbe) {
    let probeCommand = command && adapter.cliCommands.includes(adapter.authProbe.command) ? command : adapter.authProbe.command;
    let probeArgs = adapter.authProbe.args;
    let fallback = false;
    if (!commandExists(probeCommand) && adapter.authProbe.fallback && commandExists(adapter.authProbe.fallback.command)) {
      probeCommand = adapter.authProbe.fallback.command;
      probeArgs = adapter.authProbe.fallback.args;
      fallback = true;
    }
    if (commandExists(probeCommand)) {
      const result = run(probeCommand, probeArgs, {
        cwd: root,
        timeoutMs: adapter.authProbe.timeoutMs ?? 10_000,
        maxOutputBytes: 8_192,
      });
      authenticated = result.ok;
      if (result.ok) readiness = stronger(readiness, adapter.authProbe.successReadiness);
      signals.push({
        type: "auth",
        ok: result.ok,
        detail: result.ok
          ? `Authentication probe succeeded: ${safeCommandLabel(probeCommand, probeArgs)}${fallback ? " (fallback launcher)" : ""}`
          : `Authentication probe failed${result.timedOut ? " (timeout)" : ""}: ${safeCommandLabel(probeCommand, probeArgs)}`,
      });
    } else {
      authenticated = false;
      const expected = adapter.authProbe.fallback
        ? `${adapter.authProbe.command} or ${adapter.authProbe.fallback.command}`
        : adapter.authProbe.command;
      signals.push({ type: "auth", ok: false, detail: `Authentication probe skipped; ${expected} is not installed.` });
    }
  }

  if (live && adapter.statusProbe) {
    const probeCommand = command && adapter.cliCommands.includes(adapter.statusProbe.command) ? command : adapter.statusProbe.command;
    if (commandExists(probeCommand)) {
      const result = run(probeCommand, adapter.statusProbe.args, {
        cwd: root,
        timeoutMs: adapter.statusProbe.timeoutMs ?? 10_000,
        maxOutputBytes: 8_192,
      });
      if (result.ok) {
        readiness = stronger(readiness, adapter.statusProbe.successReadiness);
        if (adapter.statusProbe.successReadiness === "linked") linked = true;
      }
      signals.push({
        type: "status",
        ok: result.ok,
        detail: result.ok
          ? `Status probe succeeded: ${safeCommandLabel(probeCommand, adapter.statusProbe.args)}`
          : `Status probe failed${result.timedOut ? " (timeout)" : ""}: ${safeCommandLabel(probeCommand, adapter.statusProbe.args)}`,
      });
    }
  }

  if (!installed && !configured && !linked && authenticated !== true) readiness = "unavailable";

  return {
    providerId: adapter.id,
    displayName: adapter.displayName,
    readiness,
    installed,
    configured,
    ...(authenticated !== undefined ? { authenticated } : {}),
    ...(adapter.linkedMarkers?.length || adapter.statusProbe ? { linked } : {}),
    liveChecked: live,
    signals,
    safeSummary: `${adapter.displayName}: ${readiness}${live ? " (live checked)" : " (local detection only)"}`,
  };
}

export async function probeProviders(
  root: string,
  options: { live?: boolean; ids?: string[] } = {},
): Promise<ProviderProbeResult[]> {
  const selected = options.ids?.length
    ? providerAdapters.filter((adapter) => options.ids!.includes(adapter.id))
    : providerAdapters;
  return Promise.all(selected.map((adapter) => probeProvider(adapter, root, { live: options.live })));
}
