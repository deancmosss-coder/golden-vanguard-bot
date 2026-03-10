const fs = require("fs");
const path = require("path");
const { updateOperationsBoard } = require("../services/operationsBoard");

const CACHE_FILE = path.join(__dirname, "..", "data", "war_cache.json");

function readJson(file, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    console.error("[WAR BOARD] Failed reading war_cache.json:", err.message);
    return fallback;
  }
}

async function refreshWarBoard(client) {
  console.log("[WAR BOARD] refreshWarBoard started");

  const warData = readJson(CACHE_FILE, {});
  console.log("[WAR BOARD] Loaded cache keys:", Object.keys(warData || {}));

  await updateOperationsBoard(client, warData);

  console.log("[WAR BOARD] refreshWarBoard finished");
}

module.exports = { refreshWarBoard };