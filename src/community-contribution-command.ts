import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  prepareCommunityContributionPromotion,
  validateCommunityContributionDirectory,
  validateCommunityContributionFile,
  validatePublisherKeyProposal,
} from "./community-contribution.js";
import { loadCommunityRegistry } from "./community-registry.js";

function value(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function required(args: string[], name: string): string {
  const result = value(args, name);
  if (!result) throw new Error(`${name} is required`);
  return result;
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(resolve(path), "utf8")) as unknown;
}

export async function handleCommunityContributionCommand(args: string[]): Promise<void> {
  const action = args[0] ?? "validate";
  const rest = args.slice(1);

  if (action === "validate") {
    const file = value(rest, "--file");
    if (file) {
      const report = await validateCommunityContributionFile(file);
      console.log(JSON.stringify(report, null, 2));
      if (report.status === "blocked") process.exitCode = 1;
      return;
    }
    const report = await validateCommunityContributionDirectory(
      value(rest, "--dir") ?? "registry/contributions",
      value(rest, "--publisher-proposals") ?? "registry/publisher-proposals",
    );
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exitCode = 1;
    return;
  }

  if (action === "validate-publisher") {
    const file = required(rest, "--file");
    const report = validatePublisherKeyProposal(await readJson(file), resolve(file));
    console.log(JSON.stringify(report, null, 2));
    if (report.status === "invalid") process.exitCode = 1;
    return;
  }

  if (action === "prepare") {
    const file = required(rest, "--file");
    const manifest = await readJson(file);
    const registry = await loadCommunityRegistry();
    const result = await prepareCommunityContributionPromotion(manifest, registry, resolve(file));
    console.log(JSON.stringify(result, null, 2));
    if (!result.ready) process.exitCode = 1;
    return;
  }

  throw new Error("Usage: dockyard community contribution validate [--file MANIFEST | --dir DIR --publisher-proposals DIR] | validate-publisher --file KEY.json | prepare --file MANIFEST");
}
