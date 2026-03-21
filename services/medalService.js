// =========================
// services/medalService.js
// FOUNDATION SERVICE
// Player medals / achievements system
// =========================

const fs = require("fs");
const path = require("path");

const STORE_PATH = path.join(__dirname, "..", "tracker_store.json");
const TRACKER_TZ = process.env.TRACKER_TIMEZONE || "Europe/London";

function currentMonthKey(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TRACKER_TZ,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(d);

  const y = parts.find((p) => p.type === "year")?.value || "0000";
  const m = parts.find((p) => p.type === "month")?.value || "00";
  return `${y}-${m}`;
}

function defaultStore() {
  return {
    leaderboardMessage: {},
    weekly: { players: {}, divisions: {}, enemies: {} },
    monthly: { monthKey: currentMonthKey(), players: {}, divisions: {}, enemies: {} },
    users: {},
    runs: [],
    proofSessions: {},
    history: { weeks: [] },
    planets: {},
    profiles: {},
    medals: {},
  };
}

function readStore() {
  try {
    if (!fs.existsSync(STORE_PATH)) return defaultStore();
    const raw = fs.readFileSync(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    const base = defaultStore();

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
    console.error("[MEDALS] readStore failed:", err);
    return defaultStore();
  }
}

function writeStore(store) {
  try {
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
  } catch (err) {
    console.error("[MEDALS] writeStore failed:", err);
  }
}

function ensureUserMedals(store, userId) {
  store.medals = store.medals || {};

  if (!store.medals[userId]) {
    store.medals[userId] = {
      unlocked: [],
      stats: {
        lastCheckedAt: null,
      },
    };
  }

  if (!Array.isArray(store.medals[userId].unlocked)) {
    store.medals[userId].unlocked = [];
  }

  if (!store.medals[userId].stats) {
    store.medals[userId].stats = {
      lastCheckedAt: null,
    };
  }

  return store.medals[userId];
}

function hasMedal(userMedals, medalId) {
  return userMedals.unlocked.some((m) => m.id === medalId);
}

function unlockMedal(userMedals, medal) {
  if (hasMedal(userMedals, medal.id)) return false;

  userMedals.unlocked.push({
    id: medal.id,
    name: medal.name,
    description: medal.description,
    category: medal.category,
    rarity: medal.rarity,
    awardedAt: new Date().toISOString(),
  });

  return true;
}

function getProfile(store, userId) {
  return store?.profiles?.[userId] || null;
}

function getLifetime(profile) {
  return profile?.lifetime || {};
}

function getDivisionEntries(profile) {
  return Object.entries(profile?.divisions || {});
}

function maxMapValue(obj) {
  const values = Object.values(obj || {}).map((v) => Number(v || 0));
  return values.length ? Math.max(...values) : 0;
}

const MEDAL_DEFINITIONS = [
  {
    id: "first_drop",
    name: "First Drop",
    description: "Complete your first logged operation.",
    category: "operations",
    rarity: "common",
    check: (profile) => Number(getLifetime(profile).runsLogged || 0) >= 1,
  },
  {
    id: "field_veteran",
    name: "Field Veteran",
    description: "Complete 25 logged operations.",
    category: "operations",
    rarity: "common",
    check: (profile) => Number(getLifetime(profile).runsLogged || 0) >= 25,
  },
  {
    id: "warhound",
    name: "Warhound",
    description: "Complete 100 logged operations.",
    category: "operations",
    rarity: "rare",
    check: (profile) => Number(getLifetime(profile).runsLogged || 0) >= 100,
  },
  {
    id: "proof_of_service",
    name: "Proof of Service",
    description: "Complete 10 proof-verified runs.",
    category: "verification",
    rarity: "common",
    check: (profile) => Number(getLifetime(profile).proofRuns || 0) >= 10,
  },
  {
    id: "sealed_record",
    name: "Sealed Record",
    description: "Complete 50 proof-verified runs.",
    category: "verification",
    rarity: "rare",
    check: (profile) => Number(getLifetime(profile).proofRuns || 0) >= 50,
  },
  {
    id: "bug_hunter",
    name: "Bug Hunter",
    description: "Complete 25 operations against Terminids.",
    category: "enemy",
    rarity: "common",
    check: (profile) => Number(getLifetime(profile).enemies?.Terminids || 0) >= 25,
  },
  {
    id: "bot_breaker",
    name: "Bot Breaker",
    description: "Complete 25 operations against Automatons.",
    category: "enemy",
    rarity: "common",
    check: (profile) => Number(getLifetime(profile).enemies?.Automatons || 0) >= 25,
  },
  {
    id: "squid_slayer",
    name: "Squid Slayer",
    description: "Complete 25 operations against Illuminate.",
    category: "enemy",
    rarity: "common",
    check: (profile) => Number(getLifetime(profile).enemies?.Illuminate || 0) >= 25,
  },
  {
    id: "hundred_kills",
    name: "Hundred Kills",
    description: "Accumulate 100 lifetime kills.",
    category: "combat",
    rarity: "common",
    check: (profile) => Number(getLifetime(profile).kills || 0) >= 100,
  },
  {
    id: "thousand_kills",
    name: "Thousand Kills",
    description: "Accumulate 1,000 lifetime kills.",
    category: "combat",
    rarity: "rare",
    check: (profile) => Number(getLifetime(profile).kills || 0) >= 1000,
  },
  {
    id: "executioner",
    name: "Executioner",
    description: "Accumulate 10,000 lifetime kills.",
    category: "combat",
    rarity: "legendary",
    check: (profile) => Number(getLifetime(profile).kills || 0) >= 10000,
  },
  {
    id: "unbroken",
    name: "Unbroken",
    description: "Win 25 operations.",
    category: "success",
    rarity: "common",
    check: (profile) => Number(getLifetime(profile).wins || 0) >= 25,
  },
  {
    id: "campaign_hero",
    name: "Campaign Hero",
    description: "Win 100 operations.",
    category: "success",
    rarity: "rare",
    check: (profile) => Number(getLifetime(profile).wins || 0) >= 100,
  },
  {
    id: "deathless_ten",
    name: "Deathless Ten",
    description: "Maintain a lifetime K/D of at least 10.0 after 25 runs.",
    category: "combat",
    rarity: "rare",
    check: (profile) => {
      const lt = getLifetime(profile);
      const runs = Number(lt.runsLogged || 0);
      const kills = Number(lt.kills || 0);
      const deaths = Number(lt.deaths || 0);
      if (runs < 25) return false;
      if (deaths === 0) return kills >= 100;
      return kills / deaths >= 10;
    },
  },
  {
    id: "friendly_fire_notice",
    name: "Friendly Fire Notice",
    description: "Record 25 lifetime accidentals.",
    category: "combat",
    rarity: "common",
    check: (profile) => Number(getLifetime(profile).accidentals || 0) >= 25,
  },
  {
    id: "frontline_regular",
    name: "Frontline Regular",
    description: "Spend 10 hours in voice channels.",
    category: "service",
    rarity: "common",
    check: (profile) => Number(getLifetime(profile).vcMinutes || 0) >= 600,
  },
  {
    id: "operations_mainstay",
    name: "Operations Mainstay",
    description: "Spend 50 hours in voice channels.",
    category: "service",
    rarity: "rare",
    check: (profile) => Number(getLifetime(profile).vcMinutes || 0) >= 3000,
  },
  {
    id: "specialist",
    name: "Specialist",
    description: "Complete 25 runs with one division.",
    category: "division",
    rarity: "common",
    check: (profile) =>
      getDivisionEntries(profile).some(([, stats]) => Number(stats?.runsLogged || 0) >= 25),
  },
  {
    id: "division_legend",
    name: "Division Legend",
    description: "Complete 100 runs with one division.",
    category: "division",
    rarity: "rare",
    check: (profile) =>
      getDivisionEntries(profile).some(([, stats]) => Number(stats?.runsLogged || 0) >= 100),
  },
  {
    id: "planet_loyalist",
    name: "Planet Loyalist",
    description: "Fight 10 times on the same planet.",
    category: "planet",
    rarity: "common",
    check: (profile) => maxMapValue(getLifetime(profile).planets) >= 10,
  },
  {
    id: "difficulty_specialist",
    name: "Difficulty Specialist",
    description: "Play 15 operations on the same difficulty.",
    category: "difficulty",
    rarity: "common",
    check: (profile) => maxMapValue(getLifetime(profile).difficulties) >= 15,
  },
];

function evaluateUserMedals(store, userId) {
  const profile = getProfile(store, userId);
  if (!profile) return [];

  const userMedals = ensureUserMedals(store, userId);
  const newlyUnlocked = [];

  for (const medal of MEDAL_DEFINITIONS) {
    try {
      if (medal.check(profile)) {
        const unlocked = unlockMedal(userMedals, medal);
        if (unlocked) newlyUnlocked.push(medal);
      }
    } catch (err) {
      console.error(`[MEDALS] Failed checking medal ${medal.id}:`, err);
    }
  }

  userMedals.stats.lastCheckedAt = new Date().toISOString();
  return newlyUnlocked;
}

function evaluateAndStore(userId) {
  if (!userId) return [];

  const store = readStore();
  const unlocked = evaluateUserMedals(store, userId);
  writeStore(store);
  return unlocked;
}

function getUserMedals(userId) {
  const store = readStore();
  const userMedals = ensureUserMedals(store, userId);
  return userMedals.unlocked || [];
}

function rebuildAllMedals() {
  const store = readStore();
  const profiles = store.profiles || {};
  const summary = [];

  for (const userId of Object.keys(profiles)) {
    const unlocked = evaluateUserMedals(store, userId);
    summary.push({
      userId,
      newCount: unlocked.length,
      medals: unlocked.map((m) => m.id),
    });
  }

  writeStore(store);
  return summary;
}

module.exports = {
  MEDAL_DEFINITIONS,
  readStore,
  writeStore,
  getUserMedals,
  evaluateAndStore,
  rebuildAllMedals,
};