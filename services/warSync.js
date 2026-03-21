const fs = require("fs");
const path = require("path");
const {
  getStatus,
  getInfo,
  getCampaign,
  getPlanets,
  getMajorOrders,
} = require("./helldiversApi");

const CACHE_FILE = path.join(__dirname, "..", "data", "war_cache.json");

function ensureDirExists(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function writeJson(file, data) {
  ensureDirExists(file);
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

async function syncWarData() {
  console.log("[WAR SYNC] Starting sync...");

  let status = null;
  let info = null;
  let campaign = [];
  let planets = {};
  let majorOrders = [];

  try {
    status = await getStatus();
    console.log("[WAR SYNC] status OK");
  } catch (err) {
    console.error("[WAR SYNC] status failed:", err.response?.status || err.message);
  }

  try {
    info = await getInfo();
    console.log("[WAR SYNC] info OK");
  } catch (err) {
    console.error("[WAR SYNC] info failed:", err.response?.status || err.message);
  }

  try {
    campaign = await getCampaign();
    console.log("[WAR SYNC] campaign OK");
  } catch (err) {
    console.error("[WAR SYNC] campaign failed:", err.response?.status || err.message);
  }

  try {
    planets = await getPlanets();
    console.log("[WAR SYNC] planets OK");
  } catch (err) {
    console.error("[WAR SYNC] planets failed:", err.response?.status || err.message);
  }

  try {
    majorOrders = await getMajorOrders();
    console.log("[WAR SYNC] majorOrders OK");
  } catch (err) {
    console.error("[WAR SYNC] majorOrders failed:", err.response?.status || err.message);
  }

  const payload = {
    updatedAt: new Date().toISOString(),
    status,
    info,
    campaign,
    planets,
    majorOrders,
  };

  writeJson(CACHE_FILE, payload);

  console.log("[WAR SYNC] Sync complete");
  console.log("[WAR SYNC] MO count:", Array.isArray(majorOrders) ? majorOrders.length : 0);

  return payload;
}

module.exports = { syncWarData };