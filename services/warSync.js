// services/warSync.js
const fs = require("fs");
const path = require("path");
const logger = require("./logger");
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

function formatApiError(err) {
  return err?.response?.status
    ? `HTTP ${err.response.status}`
    : err?.message || "Unknown error";
}

async function syncWarData() {
  logger.info("[WAR SYNC] Starting sync...");

  let status = null;
  let info = null;
  let campaign = [];
  let planets = {};
  let majorOrders = [];

  const failures = [];

  try {
    status = await getStatus();
    logger.info("[WAR SYNC] status OK");
  } catch (err) {
    failures.push(`status: ${formatApiError(err)}`);
    logger.warn("[WAR SYNC] status failed", {
      location: "services/warSync.js -> syncWarData",
      error: formatApiError(err),
    });
  }

  try {
    info = await getInfo();
    logger.info("[WAR SYNC] info OK");
  } catch (err) {
    failures.push(`info: ${formatApiError(err)}`);
    logger.warn("[WAR SYNC] info failed", {
      location: "services/warSync.js -> syncWarData",
      error: formatApiError(err),
    });
  }

  try {
    campaign = await getCampaign();
    logger.info("[WAR SYNC] campaign OK");
  } catch (err) {
    failures.push(`campaign: ${formatApiError(err)}`);
    logger.warn("[WAR SYNC] campaign failed", {
      location: "services/warSync.js -> syncWarData",
      error: formatApiError(err),
    });
  }

  try {
    planets = await getPlanets();
    logger.info("[WAR SYNC] planets OK");
  } catch (err) {
    failures.push(`planets: ${formatApiError(err)}`);
    logger.warn("[WAR SYNC] planets failed", {
      location: "services/warSync.js -> syncWarData",
      error: formatApiError(err),
    });
  }

  try {
    majorOrders = await getMajorOrders();
    logger.info("[WAR SYNC] majorOrders OK");
  } catch (err) {
    failures.push(`majorOrders: ${formatApiError(err)}`);
    logger.warn("[WAR SYNC] majorOrders failed", {
      location: "services/warSync.js -> syncWarData",
      error: formatApiError(err),
    });
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

  logger.info("[WAR SYNC] Sync complete", {
    majorOrderCount: Array.isArray(majorOrders) ? majorOrders.length : 0,
    failures,
  });

  const hasAnyCoreData =
    Boolean(status) ||
    Boolean(info) ||
    (Array.isArray(campaign) && campaign.length > 0) ||
    (planets && Object.keys(planets).length > 0) ||
    (Array.isArray(majorOrders) && majorOrders.length > 0);

  if (!hasAnyCoreData) {
    const err = new Error(
      `War sync returned no usable data. Failures: ${failures.join(" | ") || "unknown"}`
    );
    logger.error("[WAR SYNC] No usable data returned", err, {
      location: "services/warSync.js -> syncWarData",
    });
    throw err;
  }

  return payload;
}

module.exports = { syncWarData };
