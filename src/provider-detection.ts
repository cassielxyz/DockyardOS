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

export interface ProviderProbeOptions {
  live?: boolean;
  httpFetch?: (
    url: string,
    init: { headers: Record<string, string>; signal: AbortSignal },
  ) => Promise<{ ok: boolean; status: number }>;
}

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

function secureCredential(adapter: ProviderAdapterDefinition): { envVar: string; value: string } | undefined {
  for (const envVar of adapter.secureCredentialProbe?.envVars ?? []) {
    const value = process.env[envVar]?.trim();
    if (value) return { envVar, value };
  }
  return undefined;
}

async function verifySecureCredential(
  adapter: ProviderAdapterDefinition,
  credential: { envVar: string; value: string },
  httpFetch?: ProviderProbeOptions["httpFetch"],
): Promise<{ ok: boolean; status?: number; timedOut: boolean }> {
  const probe = adapter.secureCredentialProbe;
  if (!probe) return { ok: false, timedOut: false };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), probe.timeoutMs ?? 10_000);
  try {
    const request = httpFetch
      ? httpFetch(probe.validationUrl, {
          headers: { [probe.header]: credential.value },
          signal: controller.signal,
        })
      : fetch(probe.validationUrl, {
          method: "GET",
          headers: { [probe.header]: credential.value },
          signal: controller.signal,
        });
    const response = await request;
    return { ok: response.ok, status: response.status, timedOut: false };
  } catch (error) {
    return {
      ok: false,
      timedOut: error instanceof Error && (error.name === "AbortError" || controller.signal.aborted),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function probeProvider(
  adapter: ProviderAdapterDefinition,
  root: string,
  options: ProviderProbeOptions = {},
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
  const credential = secureCredential(adapter);
  const configured = configHits.length > 0 || Boolean(credential);
  if (configured) readiness = stronger(readiness, "configured");
  signals.push({
    type: "config",
    ok: configured,
    detail: configHits.length
      ? `Project markers: ${configHits.join(", ")}`
      : credential
        ? "Secure provider credential is available to this process; its value is never emitted or persisted by the readiness probe."
        : "No known project configuration marker or secure provider credential detected.",
  });
  if (adapter.secureCredentialProbe) {
    signals.push({
      type: "credential",
      ok: Boolean(credential),
      detail: credential
        ? `Credential source detected: ${credential.envVar} (value hidden).`
        : `No supported in-memory credential source detected (${adapter.secureCredentialProbe.envVars.join(" / ")}).`,
    });
  }

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
  if (live && adapter.secureCredentialProbe) {
    if (!credential) {
      authenticated = false;
      signals.push({
        type: "auth",
        ok: false,
        detail: "Read-only API authentication probe skipped because no supported secure credential is available.",
      });
    } else {
      const result = await verifySecureCredential(adapter, credential, options.httpFetch);
      authenticated = result.ok;
      if (result.ok) readiness = stronger(readiness, adapter.secureCredentialProbe.successReadiness);
      signals.push({
        type: "auth",
        ok: result.ok,
        detail: result.ok
          ? "Read-only API authentication probe succeeded; credential value was not logged or persisted."
          : `Read-only API authentication probe failed${result.timedOut ? " (timeout)" : result.status ? ` (HTTP ${result.status})` : ""}; credential value was not logged or persisted.`,
      });
    }
  }

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
      let result = run(probeCommand, probeArgs, {
        cwd: root,
        timeoutMs: adapter.authProbe.timeoutMs ?? 10_000,
        maxOutputBytes: 8_192,
      });
      if (!result.ok && !fallback && adapter.authProbe.fallback && commandExists(adapter.authProbe.fallback.command)) {
        probeCommand = adapter.authProbe.fallback.command;
        probeArgs = adapter.authProbe.fallback.args;
        fallback = true;
        result = run(probeCommand, probeArgs, {
          cwd: root,
          timeoutMs: adapter.authProbe.timeoutMs ?? 10_000,
          maxOutputBytes: 8_192,
        });
      }
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
