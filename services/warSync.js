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
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function writeJson(file, data) {
  ensureDirExists(file);
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

async function safeFetch(name, fn, fallback) {
  try {
    const res = await fn();
    console.log(`[WAR SYNC] ${name} OK`);
    return res;
  } catch (err) {
    console.warn(
      `[WAR SYNC] ${name} FAILED:`,
      err.response?.status || err.message
    );
    return fallback;
  }
}

async function syncWarData() {
  console.log("[WAR SYNC] Starting sync...");

  const status = await safeFetch("status", getStatus, null);
  const info = await safeFetch("info", getInfo, null);
  const campaign = await safeFetch("campaign", getCampaign, []);
  const planets = await safeFetch("planets", getPlanets, {});
  const majorOrders = await safeFetch("majorOrders", getMajorOrders, []);

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
  console.log("[WAR SYNC] MO count:", majorOrders?.length || 0);

  return payload;
}

module.exports = { syncWarData };