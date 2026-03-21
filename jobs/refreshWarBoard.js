const { syncWarData } = require("../services/warSync");
const { updateOperationsBoard } = require("../services/operationsBoard");

async function refreshWarBoard(client) {
  try {
    console.log("[WAR BOARD] Refresh starting...");

    // 🔁 ALWAYS pull fresh data from API
    const warData = await syncWarData();

    if (!warData) {
      console.log("[WAR BOARD] No war data returned");
      return;
    }

    // 🧠 Update board with fresh data
    await updateOperationsBoard(client, warData);

    console.log("[WAR BOARD] Refresh complete");
  } catch (err) {
    console.error("[WAR BOARD] Refresh failed:", err);
  }
}

module.exports = { refreshWarBoard };