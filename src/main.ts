#!/usr/bin/env node
import { findWorkspaceRoot } from "./project.js";
import { handleInitCommand } from "./init-command.js";
import { handleTeamCommand } from "./team-command.js";
import { handleHostCommand } from "./host-command.js";
import { handleCommunityCommand } from "./community-command.js";
import { handleCommunityContributionCommand } from "./community-contribution-command.js";
import { handleCommunityMaintainerCommand } from "./community-maintainer-command.js";
import { handlePackageTransparencyAnchorCommand } from "./community-package-transparency-anchor-command.js";
import { handleProviderActionCommand } from "./provider-command.js";
import { handleProviderMigrationCommand } from "./provider-migration-command.js";
import { checkPublicAdGate } from "./public-ad-gate.js";
import { handleSecurityEvidenceCommand } from "./security-command.js";
import { handleCapabilityFulfillmentCommand } from "./capability-fulfillment-command.js";
import { handleSkillCommand } from "./skill-command.js";

const [, , command, ...args] = process.argv;

function gateExempt(commandName: string | undefined): boolean {
  return !commandName || ["init", "host", "skills", "hook", "--help", "-h", "help"].includes(commandName);
}

async function publicCliGate(): Promise<boolean> {
  if (gateExempt(command)) return true;
  const root = findWorkspaceRoot();
  const gate = await checkPublicAdGate(root);
  if (!gate.required || gate.status === "active") return true;
  const json = args.includes("--json");
  if (gate.status === "sponsor-required") {
    const payload = {
      dockyardPublicEdition: true,
      status: gate.status,
      ad: gate.ad,
      remainingMs: gate.remainingMs,
      instruction: "View the clearly labeled sponsored placement, then retry the DockyardOS command after the minimum window.",
    };
    if (json) console.log(JSON.stringify(payload, null, 2));
    else {
      console.log(`[${gate.ad.disclosure}] ${gate.ad.title}`);
      console.log(gate.ad.body);
      console.log(`${gate.ad.ctaLabel}: ${gate.ad.ctaUrl}`);
      console.log(`\nOfficial DockyardOS public edition: retry this command after about ${Math.max(1, Math.ceil(gate.remainingMs / 1000))}s.`);
    }
    process.exitCode = 3;
    return false;
  }
  const payload = {
    dockyardPublicEdition: true,
    status: "unavailable",
    reason: gate.reason,
    instruction: "Retry when the official DockyardOS public-edition control plane is available.",
  };
  if (json) console.error(JSON.stringify(payload, null, 2));
  else console.error(`DockyardOS official public-edition gate unavailable: ${gate.reason}`);
  process.exitCode = 4;
  return false;
}

try {
  if (!await publicCliGate()) {
    // Sponsor/service-gate output has already been emitted; do not dispatch the requested operation.
  } else if (command === "init") {
    await handleInitCommand(findWorkspaceRoot(), args, args.includes("--json"));
  } else if (command === "team") {
    await handleTeamCommand(findWorkspaceRoot(), args, args.includes("--json"));
  } else if (command === "host") {
    await handleHostCommand(findWorkspaceRoot(), args, args.includes("--json"));
  } else if (command === "capabilities") {
    await handleCapabilityFulfillmentCommand(findWorkspaceRoot(), args);
  } else if (command === "skills") {
    await handleSkillCommand(args);
  } else if (command === "community" && args[0] === "contribution") {
    await handleCommunityContributionCommand(args.slice(1));
  } else if (command === "community" && args[0] === "maintainer") {
    await handleCommunityMaintainerCommand(findWorkspaceRoot(), args.slice(1));
  } else if (command === "community" && args[0] === "transparency" && args[1] === "anchor") {
    await handlePackageTransparencyAnchorCommand(findWorkspaceRoot(), args.slice(2));
  } else if (command === "community") {
    await handleCommunityCommand(args, args.includes("--json"));
  } else if (command === "providers" && args[0] === "migration") {
    await handleProviderMigrationCommand(findWorkspaceRoot(), args.slice(1));
  } else if (command === "providers" && (args[0] === "health" || args[0] === "pricing" || args[0] === "actions" || args[0] === "action" || args[0] === "preview")) {
    await handleProviderActionCommand(findWorkspaceRoot(), args);
  } else if (command === "security" && (args[0] === "policy" || args[0] === "sarif")) {
    await handleSecurityEvidenceCommand(findWorkspaceRoot(), args);
  } else {
    await import("./cli.js");
  }
} catch (error) {
  console.error(`DockyardOS error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
