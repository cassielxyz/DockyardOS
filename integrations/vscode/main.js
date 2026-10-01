const legacy = require("./extension.js");
const { activateConnections, deactivateConnections } = require("./connections-controller.js");

function activate(context) {
  legacy.activate(context);
  activateConnections(context);
}

function deactivate() {
  deactivateConnections();
  return legacy.deactivate();
}

module.exports = { activate, deactivate };
