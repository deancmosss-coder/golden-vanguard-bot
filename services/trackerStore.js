// =========================
// services/trackerStore.js
// Handles tracker_store.json read/write helpers
// =========================

const fs = require("fs");
const path = require("path");

const logger = require("./logger");

const TRACKER_TZ = process.env.TRACKER_TIMEZONE || "Europe/London";
const TRACKER_STORE_PATH = path.join(__dirname, "..", "tracker_store.json");

function currentMonthKeyLocal(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TRACKER_TZ,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(d);

  const y = parts.find((p) => p.type === "year")?.value || "0000";
  const m = parts.find((p) => p.type === "month")?.value || "00";

  return `${y}-${m}`;
}

function defaultTrackerStore() {
  return {
    leaderboardMessage: {},
    weekly: { players: {}, divisions: {}, enemies: {} },
    monthly: {
      monthKey: currentMonthKeyLocal(),
      players: {},
      divisions: {},
      enemies: {},
    },
    users: {},
    runs: [],
    proofSessions: {},
    history: { weeks: [] },
    planets: {},
    profiles: {},
    medals: {},
  };
}

function readTrackerStore() {
  try {
    if (!fs.existsSync(TRACKER_STORE_PATH)) return defaultTrackerStore();

    const raw = fs.readFileSync(TRACKER_STORE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    const base = defaultTrackerStore();

    return {
      ...base,
      ...parsed,
      leaderboardMessage: parsed.leaderboardMessage || base.leaderboardMessage,
      weekly: parsed.weekly || base.weekly,
      monthly: parsed.monthly || base.monthly,
      users: parsed.users || base.users,
      runs: Array.isArray(parsed.runs) ? parsed.runs : [],
      proofSessions: parsed.proofSessions || base.proofSessions,
      history: parsed.history || base.history,
      planets: parsed.planets || base.planets,
      profiles: parsed.profiles || base.profiles,
      medals: parsed.medals || base.medals,
    };
  } catch (err) {
    logger.error("readTrackerStore failed", err, {
      location: "services/trackerStore.js -> readTrackerStore",
    });

    return defaultTrackerStore();
  }
}

function writeTrackerStore(store) {
  try {
    fs.writeFileSync(TRACKER_STORE_PATH, JSON.stringify(store, null, 2), "utf8");
  } catch (err) {
    logger.error("writeTrackerStore failed", err, {
      location: "services/trackerStore.js -> writeTrackerStore",
    });
  }
}

module.exports = {
  TRACKER_STORE_PATH,
  currentMonthKeyLocal,
  defaultTrackerStore,
  readTrackerStore,
  writeTrackerStore,
};
