const legacy = require("./extension.js");
const { activateConnections, deactivateConnections } = require("./connections-controller.js");
const { activateDashboard, deactivateDashboard } = require("./dashboard-controller.js");

function activate(context) {
  legacy.activate(context);
  activateConnections(context);
  activateDashboard(context);
}

function deactivate() {
  deactivateDashboard();
  deactivateConnections();
  return legacy.deactivate();
}

module.exports = { activate, deactivate };
