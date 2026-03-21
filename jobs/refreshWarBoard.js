const { syncWarData } = require("../services/warSync");
const { updateOperationsBoard } = require("../services/operationsBoard");

async function refreshWarBoard(client) {
  console.log("[WAR BOARD] refreshWarBoard started");

  const warData = await syncWarData();

  console.log("[WAR BOARD] Loaded cache keys:", Object.keys(warData || {}));

  await updateOperationsBoard(client, warData);

  console.log("[WAR BOARD] refreshWarBoard finished");
}

module.exports = { refreshWarBoard };