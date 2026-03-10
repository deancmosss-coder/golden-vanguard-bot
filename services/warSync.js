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
  let status = null;
  let info = null;
  let campaign = [];
  let planets = {};
  let majorOrders = [];

  try {
    status = await getStatus();
  } catch (err) {
    console.error("[WAR] /war/status failed:", err.response?.status || err.message);
  }

  try {
    info = await getInfo();
  } catch (err) {
    console.error("[WAR] /war/info failed:", err.response?.status || err.message);
  }

  try {
    campaign = await getCampaign();
  } catch (err) {
    console.error("[WAR] /war/campaign failed:", err.response?.status || err.message);
  }

  try {
    planets = await getPlanets();
  } catch (err) {
    console.error("[WAR] /planets failed:", err.response?.status || err.message);
  }

  try {
    majorOrders = await getMajorOrders();
  } catch (err) {
    console.error("[WAR] /war/major-orders failed:", err.response?.status || err.message);
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
  return payload;
}

module.exports = { syncWarData };