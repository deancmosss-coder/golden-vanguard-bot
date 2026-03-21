const axios = require("axios");

const API_BASE = "https://helldiverstrainingmanual.com/api/v1";

async function fetchJson(endpoint) {
  const url = `${API_BASE}${endpoint}`;
  console.log(`[WAR API] GET ${url}`);

  const res = await axios.get(url, {
    timeout: 15000,
    headers: {
      Accept: "application/json",
      "User-Agent": "golden-vanguard-bot",
    },
    validateStatus: (status) => status >= 200 && status < 300,
  });

  return res.data;
}

// ===== CORE ENDPOINTS =====

async function getStatus() {
  return fetchJson("/war/status");
}

async function getInfo() {
  return fetchJson("/war/info");
}

async function getCampaign() {
  return fetchJson("/war/campaign");
}

async function getPlanets() {
  return fetchJson("/planets");
}

async function getMajorOrders() {
  try {
    return await fetchJson("/war/major-orders");
  } catch (err) {
    console.warn(
      "[WAR API] /war/major-orders failed:",
      err.response?.status || err.message
    );
    return [];
  }
}

module.exports = {
  getStatus,
  getInfo,
  getCampaign,
  getPlanets,
  getMajorOrders,
};