import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as vscode from "vscode";

const execFileAsync = promisify(execFile);
let output: vscode.OutputChannel;
let status: vscode.StatusBarItem;

function workspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function executable(): string {
  return vscode.workspace.getConfiguration("dockyard").get<string>("executablePath", "dockyard");
}

async function runDockyard(args: string[], options: { json?: boolean; allowFailure?: boolean } = {}): Promise<any> {
  const cwd = workspaceRoot();
  if (!cwd) throw new Error("Open a workspace folder before using DockyardOS.");
  const finalArgs = options.json && !args.includes("--json") ? [...args, "--json"] : args;
  try {
    const { stdout, stderr } = await execFileAsync(executable(), finalArgs, {
      cwd,
      timeout: 60_000,
      maxBuffer: 2 * 1024 * 1024,
      windowsHide: true,
    });
    if (stderr.trim()) output.appendLine(stderr.trim());
    const text = stdout.trim();
    if (!text) return undefined;
    if (options.json) return JSON.parse(text);
    return text;
  } catch (error: any) {
    const detail = String(error?.stderr || error?.stdout || error?.message || error).trim();
    if (options.allowFailure) return { error: detail };
    throw new Error(detail || "DockyardOS command failed.");
  }
}

function show(title: string, value: unknown): void {
  output.clear();
  output.appendLine(`# ${title}`);
  output.appendLine("");
  output.appendLine(typeof value === "string" ? value : JSON.stringify(value, null, 2));
  output.show(true);
}

async function refreshStatus(): Promise<void> {
  if (!workspaceRoot()) {
    status.text = "$(package) DockyardOS: no workspace";
    status.tooltip = "Open a workspace folder to use DockyardOS";
    return;
  }
  const project = await runDockyard(["status"], { json: true, allowFailure: true });
  if (project?.error || !project?.project) {
    status.text = "$(package) DockyardOS: not initialized";
    status.tooltip = "Run DockyardOS: Initialize Project";
    status.command = "dockyard.init";
    return;
  }
  const team = await runDockyard(["team", "status"], { json: true, allowFailure: true });
  const phase = !team?.error && team?.currentPhase ? String(team.currentPhase) : undefined;
  status.text = phase ? `$(hubot) DockyardOS: ${phase}` : "$(check) DockyardOS: ready";
  status.tooltip = phase
    ? `Active team phase: ${phase}\nProject: ${project.project.name}`
    : `Project: ${project.project.name}\nLatest checkpoint: ${project.latest?.id ?? "none"}`;
  status.command = phase ? "dockyard.teamStatus" : "dockyard.resume";
}

async function withErrorUi(action: () => Promise<void>): Promise<void> {
  try {
    await action();
    await refreshStatus();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    output.appendLine(`[error] ${message}`);
    void vscode.window.showErrorMessage(`DockyardOS: ${message}`);
  }
}

export function activate(context: vscode.ExtensionContext): void {
  output = vscode.window.createOutputChannel("DockyardOS");
  status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 90);
  status.name = "DockyardOS";
  status.command = "dockyard.resume";
  status.show();
  context.subscriptions.push(output, status);

  context.subscriptions.push(vscode.commands.registerCommand("dockyard.init", () => withErrorUi(async () => {
    const result = await runDockyard(["init"], { json: true });
    show("Initialized", result);
    void vscode.window.showInformationMessage(`DockyardOS initialized for ${result?.name ?? "workspace"}.`);
  })));

  context.subscriptions.push(vscode.commands.registerCommand("dockyard.doctor", () => withErrorUi(async () => {
    show("Doctor", await runDockyard(["doctor"], { json: true }));
  })));

  context.subscriptions.push(vscode.commands.registerCommand("dockyard.resume", () => withErrorUi(async () => {
    const host = vscode.workspace.getConfiguration("dockyard").get<string>("defaultHost", "vscode");
    show("Resume Context", await runDockyard(["hosts", "context", "--id", host], { json: true }));
  })));

  context.subscriptions.push(vscode.commands.registerCommand("dockyard.checkpoint", () => withErrorUi(async () => {
    const reason = await vscode.window.showInputBox({ title: "DockyardOS checkpoint", prompt: "Reason for this checkpoint", value: "milestone" });
    if (!reason) return;
    const task = await vscode.window.showInputBox({ prompt: "Active task (optional)" });
    const args = ["checkpoint", "--reason", reason];
    if (task) args.push("--task", task);
    show("Checkpoint", await runDockyard(args, { json: true }));
  })));

  context.subscriptions.push(vscode.commands.registerCommand("dockyard.teamStart", () => withErrorUi(async () => {
    const task = await vscode.window.showInputBox({ title: "Start DockyardOS team", prompt: "What should the team build/fix?" });
    if (!task) return;
    const stackInput = await vscode.window.showInputBox({ prompt: "Detected stack (comma-separated, optional)", placeHolder: "web,nextjs,react,postgres" });
    const args = ["team", "start", "--task", task, "--host", "universal"];
    if (stackInput) args.push("--stack", stackInput);
    show("Team Started", await runDockyard(args, { json: true }));
  })));

  context.subscriptions.push(vscode.commands.registerCommand("dockyard.teamStatus", () => withErrorUi(async () => {
    show("Team Status", await runDockyard(["team", "status"], { json: true }));
  })));

  context.subscriptions.push(vscode.commands.registerCommand("dockyard.teamAdvance", () => withErrorUi(async () => {
    const notes = await vscode.window.showInputBox({ title: "Advance DockyardOS team phase", prompt: "Evidence/notes for the completed phase" });
    if (notes === undefined) return;
    const args = ["team", "advance"];
    if (notes) args.push("--notes", notes);
    show("Team Phase Advanced", await runDockyard(args, { json: true }));
  })));

  context.subscriptions.push(vscode.commands.registerCommand("dockyard.refresh", () => withErrorUi(async () => {
    await refreshStatus();
  })));

  context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(() => void refreshStatus()));
  void refreshStatus();
}

export function deactivate(): void {}
