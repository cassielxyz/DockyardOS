import { bootstrapInstallableSkills } from "./skill-bootstrap.js";

function values(args: string[], name: string): string[] {
  const output: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== name || !args[index + 1]) continue;
    output.push(...args[index + 1]!.split(",").map((item) => item.trim()).filter(Boolean));
  }
  return output;
}

export async function handleSkillCommand(args: string[]): Promise<void> {
  const action = args[0] ?? "bootstrap";
  const rest = args.slice(1);
  if (action !== "bootstrap") throw new Error("Usage: dockyard skills bootstrap [--ids ID[,ID]] [--no-activate] [--json]");
  const result = await bootstrapInstallableSkills({
    ...(values(rest, "--ids").length ? { ids: values(rest, "--ids") } : {}),
    activateAutomatic: !rest.includes("--no-activate"),
  });
  console.log(JSON.stringify(result, null, 2));
  if (result.failed) process.exitCode = 2;
}
