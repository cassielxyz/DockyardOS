import type { HostId, SecurityLevel, UpdateChannel } from "./types.js";
import { defaultSelectionRequest, selectCapabilities } from "./selection.js";
import { composeTeamFromSelection, teamCompositionSummary } from "./team-composer.js";
import { completeTeamPhase, failTeamRun, loadTeamRun, recordTeamFailure, teamRunSummary, unblockTeamRun } from "./team-state.js";
import { startTeamForSelection } from "./team-routing.js";
import { loadTeamMetrics, teamMetricsSummary } from "./team-metrics.js";
import { createWorktree, planWorktree, verifyWorktree } from "./worktrees.js";
import { planCapabilityFulfillmentForIds } from "./capability-fulfillment.js";
import { activateAutomaticCapabilities } from "./capability-fulfillment-activation.js";

function values(args: string[], name: string): string[] {
  const result: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === name && args[i + 1]) result.push(...args[i + 1]!.split(",").map((value) => value.trim()).filter(Boolean));
  }
  return result;
}

function value(args: string[], name: string): string | undefined {
  return values(args, name)[0];
}

function has(args: string[], name: string): boolean {
  return args.includes(name);
}

function selectionFor(args: string[]) {
  const task = value(args, "--task");
  if (!task) throw new Error("team compose/start requires --task");
  const request = defaultSelectionRequest({
    task,
    ...(value(args, "--task-type") ? { taskType: value(args, "--task-type") } : {}),
    stack: values(args, "--stack"),
    capabilities: values(args, "--capability"),
    security: (value(args, "--security") ?? "standard") as SecurityLevel,
    host: (value(args, "--host") ?? "antigravity") as HostId,
    channel: (value(args, "--channel") ?? "recommended") as UpdateChannel,
    allowCommunity: !has(args, "--no-community"),
    preferred: values(args, "--prefer"),
    excluded: values(args, "--exclude"),
  });
  return { task, selection: selectCapabilities(request) };
}

export async function handleTeamCommand(root: string, args: string[], json: boolean): Promise<void> {
  const subcommand = args[0];
  const rest = args.slice(1);

  if (subcommand === "compose") {
    const { task, selection } = selectionFor(rest);
    const composition = composeTeamFromSelection(task, selection);
    console.log(JSON.stringify(json ? composition : teamCompositionSummary(composition), null, 2));
    return;
  }

  if (subcommand === "start") {
    const { task, selection } = selectionFor(rest);
    const started = await startTeamForSelection(root, task, selection);
    const selectedIds = [...new Set([
      ...selection.skills.map((item) => item.candidate.id),
      ...selection.agents.map((item) => item.candidate.id),
      ...selection.tools.map((item) => item.candidate.id),
      ...selection.mcps.map((item) => item.candidate.id),
    ])];
    const capabilityPlan = await planCapabilityFulfillmentForIds(root, selectedIds);
    const capabilityActivation = await activateAutomaticCapabilities(root, capabilityPlan, { maxAutomaticInstalls: 8 });
    console.log(JSON.stringify(
      json
        ? { ...started, capabilityActivation }
        : { composition: teamCompositionSummary(started.composition), run: teamRunSummary(started.state), capabilityActivation },
      null,
      2,
    ));
    return;
  }

  if (subcommand === "status") {
    const state = await loadTeamRun(root, value(rest, "--run"));
    if (!state) throw new Error("No DockyardOS team run found.");
    console.log(JSON.stringify(json ? state : teamRunSummary(state), null, 2));
    return;
  }

  if (subcommand === "advance") {
    const result = await completeTeamPhase(root, {
      ...(value(rest, "--run") ? { runId: value(rest, "--run") } : {}),
      ...(value(rest, "--notes") ? { notes: value(rest, "--notes") } : {}),
      artifacts: values(rest, "--artifact"),
      decisions: values(rest, "--decision"),
      unresolved: values(rest, "--unresolved"),
    });
    console.log(JSON.stringify(json ? result : { run: teamRunSummary(result.state), handoff: result.handoff ?? null }, null, 2));
    return;
  }

  if (subcommand === "block") {
    const reason = value(rest, "--reason");
    if (!reason) throw new Error("team block requires --reason");
    const state = await recordTeamFailure(root, {
      ...(value(rest, "--run") ? { runId: value(rest, "--run") } : {}),
      ...(value(rest, "--agent") ? { agentId: value(rest, "--agent") } : {}),
      summary: reason,
    });
    console.log(JSON.stringify(json ? state : teamRunSummary(state), null, 2));
    return;
  }

  if (subcommand === "unblock") {
    const state = await unblockTeamRun(root, value(rest, "--run"));
    console.log(JSON.stringify(json ? state : teamRunSummary(state), null, 2));
    return;
  }

  if (subcommand === "fail") {
    const reason = value(rest, "--reason");
    if (!reason) throw new Error("team fail requires --reason");
    const state = await failTeamRun(root, { ...(value(rest, "--run") ? { runId: value(rest, "--run") } : {}), summary: reason });
    console.log(JSON.stringify(json ? state : teamRunSummary(state), null, 2));
    return;
  }

  if (subcommand === "metrics") {
    const metrics = await loadTeamMetrics(root);
    console.log(JSON.stringify(json ? metrics : teamMetricsSummary(metrics), null, 2));
    return;
  }

  if (subcommand === "worktree") {
    const action = rest[0];
    const workArgs = rest.slice(1);
    const runId = value(workArgs, "--run");
    const taskId = value(workArgs, "--task-id");
    const agentId = value(workArgs, "--agent");
    if (!runId || !taskId || !agentId) throw new Error("team worktree requires --run, --task-id, and --agent");
    const input = { runId, taskId, agentId, ...(value(workArgs, "--base") ? { baseRef: value(workArgs, "--base") } : {}) };
    if (action === "plan") {
      console.log(JSON.stringify(await planWorktree(root, input), null, 2));
      return;
    }
    if (action === "create") {
      const plan = await createWorktree(root, input);
      console.log(JSON.stringify({ plan, verification: verifyWorktree(root, plan) }, null, 2));
      return;
    }
    throw new Error("Usage: dockyard team worktree plan|create --run RUN --task-id TASK --agent AGENT");
  }

  throw new Error("Usage: dockyard team compose|start|status|advance|block|unblock|fail|metrics|worktree");
}
