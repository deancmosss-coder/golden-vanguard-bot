const fs = require("fs");
const path = require("path");

const STORE_PATH = path.join(__dirname, "..", "tracker_store.json");

function readStore() {
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
  } catch {
    return {};
  }
}

function getScoreForUser(store, userId) {
  const monthly = Number(store?.monthly?.players?.[userId] || 0);
  const weekly = Number(store?.weekly?.players?.[userId] || 0);
  return Math.max(monthly, weekly);
}

function getSuggestedRank(score) {
  if (score >= 5000) return "Elite Vanguard";
  if (score >= 2500) return "Veteran Diver";
  if (score >= 1000) return "Field Operative";
  if (score >= 300) return "Active Helldiver";
  return "Recruit Diver";
}

function getPlayerRank(userId) {
  const store = readStore();
  const score = getScoreForUser(store, userId);

  return {
    score,
    suggestedRank: getSuggestedRank(score),
  };
}

module.exports = {
  getPlayerRank,
};