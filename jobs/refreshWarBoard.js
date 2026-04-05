// jobs/refreshWarBoard.js
const logger = require("../services/logger");
const { syncWarData } = require("../services/warSync");
const { updateOperationsBoard } = require("../services/operationsBoard");

async function refreshWarBoard(client) {
  logger.info("[WAR BOARD] Refresh starting...");

  const warData = await syncWarData();

  if (!warData) {
    const err = new Error("No war data returned from syncWarData()");
    logger.error("[WAR BOARD] No war data returned", err, {
      location: "jobs/refreshWarBoard.js -> refreshWarBoard",
    });
    throw err;
  }

  await updateOperationsBoard(client, warData);

  logger.info("[WAR BOARD] Refresh complete");
}

module.exports = { refreshWarBoard };
