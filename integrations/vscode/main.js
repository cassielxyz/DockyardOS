const vscode = require("vscode");
const legacy = require("./extension.js");
const { activateConnections, deactivateConnections } = require("./connections-controller.js");
const { activateDashboard, deactivateDashboard } = require("./dashboard-controller.js");

function sidebarProvider() {
  const actions = [
    { label: "Open Control Center", description: "Dashboard, memory, agents, workflows and settings", command: "dockyardOS.dashboard", icon: "dashboard" },
    { label: "Auto Initialize", description: "Initialize project and selected host integration", command: "dockyardOS.autoInitialize", icon: "zap" },
    { label: "Connections", description: "Providers, logins and MCP readiness", command: "dockyardOS.connections", icon: "plug" },
    { label: "Community Hub", description: "Skills and capability packages", command: "dockyardOS.communityBrowse", icon: "extensions" },
  ];
  return {
    getTreeItem(item) {
      const tree = new vscode.TreeItem(item.label, vscode.TreeItemCollapsibleState.None);
      tree.description = item.description;
      tree.tooltip = item.description;
      tree.iconPath = new vscode.ThemeIcon(item.icon);
      tree.command = { command: item.command, title: item.label };
      return tree;
    },
    getChildren(element) {
      return element ? [] : actions;
    },
  };
}

function activate(context) {
  legacy.activate(context);
  activateConnections(context);
  activateDashboard(context);
  context.subscriptions.push(vscode.window.registerTreeDataProvider("dockyardOS.overview", sidebarProvider()));
}

function deactivate() {
  deactivateDashboard();
  deactivateConnections();
  return legacy.deactivate();
}

module.exports = { activate, deactivate };
