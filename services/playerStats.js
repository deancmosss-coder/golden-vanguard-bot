// =========================
// services/playerStats.js
// FOUNDATION SERVICE
// Tracks lifetime + weekly + monthly player stats
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

function blankBucket() {
  return {
    runsLogged: 0,
    proofRuns: 0,
    wins: 0,
    losses: 0,

    kills: 0,
    deaths: 0,
    accidentals: 0,
    score: 0,

    missionTypes: {},
    enemies: {},
    planets: {},
    difficulties: {},

    vcMinutes: 0,

    lastRunAt: null,
    updatedAt: null,
  };
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
    };
  } catch (err) {
    console.error("[PLAYER STATS] readStore failed:", err);
    return defaultStore();
  }
}

function writeStore(store) {
  try {
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
  } catch (err) {
    console.error("[PLAYER STATS] writeStore failed:", err);
  }
}

function ensureProfile(store, userId) {
  store.profiles = store.profiles || {};

  if (!store.profiles[userId]) {
    store.profiles[userId] = {
      lifetime: blankBucket(),
      weekly: blankBucket(),
      monthly: {
        monthKey: currentMonthKey(),
        stats: blankBucket(),
      },
      divisions: {},
      voice: {
        joinedAt: null,
      },
    };
  }

  const profile = store.profiles[userId];

  if (!profile.lifetime) profile.lifetime = blankBucket();
  if (!profile.weekly) profile.weekly = blankBucket();
  if (!profile.monthly) {
    profile.monthly = {
      monthKey: currentMonthKey(),
      stats: blankBucket(),
    };
  }
  if (!profile.monthly.stats) profile.monthly.stats = blankBucket();
  if (!profile.divisions) profile.divisions = {};
  if (!profile.voice) profile.voice = { joinedAt: null };

  if (profile.monthly.monthKey !== currentMonthKey()) {
    profile.monthly = {
      monthKey: currentMonthKey(),
      stats: blankBucket(),
    };
  }

  return profile;
}

function ensureDivisionStats(profile, divisionName) {
  if (!divisionName) return null;
  profile.divisions[divisionName] = profile.divisions[divisionName] || blankBucket();
  return profile.divisions[divisionName];
}

function addMapCount(obj, key, amount = 1) {
  if (!key) return;
  obj[key] = (obj[key] || 0) + amount;
}

function applyToBucket(bucket, run, scoreAwarded = 0) {
  bucket.runsLogged += 1;
  if (run.proofApplied) bucket.proofRuns += 1;

  if (run.mainObjective === "Yes") bucket.wins += 1;
  else bucket.losses += 1;

  bucket.kills += Number(run.kills || 0);
  bucket.deaths += Number(run.deaths || 0);
  bucket.accidentals += Number(run.accidentals || 0);
  bucket.score += Number(scoreAwarded || 0);

  addMapCount(bucket.missionTypes, run.missionType, 1);
  addMapCount(bucket.enemies, run.enemy, 1);
  addMapCount(bucket.planets, run.planet, 1);
  addMapCount(bucket.difficulties, String(run.difficulty || "Unknown"), 1);

  bucket.lastRunAt = run.createdAt || new Date().toISOString();
  bucket.updatedAt = new Date().toISOString();
}

function removeFromBucket(bucket, run, scoreAwarded = 0) {
  bucket.runsLogged = Math.max(0, bucket.runsLogged - 1);
  if (run.proofApplied) bucket.proofRuns = Math.max(0, bucket.proofRuns - 1);

  if (run.mainObjective === "Yes") bucket.wins = Math.max(0, bucket.wins - 1);
  else bucket.losses = Math.max(0, bucket.losses - 1);

  bucket.kills = Math.max(0, bucket.kills - Number(run.kills || 0));
  bucket.deaths = Math.max(0, bucket.deaths - Number(run.deaths || 0));
  bucket.accidentals = Math.max(0, bucket.accidentals - Number(run.accidentals || 0));
  bucket.score = Math.max(0, bucket.score - Number(scoreAwarded || 0));

  if (run.missionType && bucket.missionTypes[run.missionType]) {
    bucket.missionTypes[run.missionType] = Math.max(0, bucket.missionTypes[run.missionType] - 1);
  }

  if (run.enemy && bucket.enemies[run.enemy]) {
    bucket.enemies[run.enemy] = Math.max(0, bucket.enemies[run.enemy] - 1);
  }

  if (run.planet && bucket.planets[run.planet]) {
    bucket.planets[run.planet] = Math.max(0, bucket.planets[run.planet] - 1);
  }

  const diffKey = String(run.difficulty || "Unknown");
  if (bucket.difficulties[diffKey]) {
    bucket.difficulties[diffKey] = Math.max(0, bucket.difficulties[diffKey] - 1);
  }

  bucket.updatedAt = new Date().toISOString();
}

function recordRun(run) {
  if (!run?.loggerId) return;

  const store = readStore();
  const profile = ensureProfile(store, run.loggerId);
  const divisionBucket = ensureDivisionStats(profile, run.divisionName);
  const awarded = Number(run.scoreAwarded || 0);

  applyToBucket(profile.lifetime, run, awarded);
  applyToBucket(profile.weekly, run, awarded);
  applyToBucket(profile.monthly.stats, run, awarded);
  if (divisionBucket) applyToBucket(divisionBucket, run, awarded);

  writeStore(store);
}

function removeRun(run) {
  if (!run?.loggerId) return;

  const store = readStore();
  const profile = ensureProfile(store, run.loggerId);
  const divisionBucket = ensureDivisionStats(profile, run.divisionName);
  const awarded = Number(run.scoreAwarded || 0);

  removeFromBucket(profile.lifetime, run, awarded);
  removeFromBucket(profile.weekly, run, awarded);
  removeFromBucket(profile.monthly.stats, run, awarded);
  if (divisionBucket) removeFromBucket(divisionBucket, run, awarded);

  writeStore(store);
}

function updateRunScore(run, oldScore, newScore) {
  if (!run?.loggerId) return;

  const delta = Number(newScore || 0) - Number(oldScore || 0);
  if (!delta) return;

  const store = readStore();
  const profile = ensureProfile(store, run.loggerId);
  const divisionBucket = ensureDivisionStats(profile, run.divisionName);

  profile.lifetime.score = Math.max(0, Number(profile.lifetime.score || 0) + delta);
  profile.weekly.score = Math.max(0, Number(profile.weekly.score || 0) + delta);
  profile.monthly.stats.score = Math.max(0, Number(profile.monthly.stats.score || 0) + delta);

  if (divisionBucket) {
    divisionBucket.score = Math.max(0, Number(divisionBucket.score || 0) + delta);
    divisionBucket.updatedAt = new Date().toISOString();
  }

  profile.lifetime.updatedAt = new Date().toISOString();
  profile.weekly.updatedAt = new Date().toISOString();
  profile.monthly.stats.updatedAt = new Date().toISOString();

  writeStore(store);
}

function startVoiceSession(userId) {
  if (!userId) return;
  const store = readStore();
  const profile = ensureProfile(store, userId);

  if (!profile.voice.joinedAt) {
    profile.voice.joinedAt = Date.now();
    writeStore(store);
  }
}

function endVoiceSession(userId) {
  if (!userId) return;
  const store = readStore();
  const profile = ensureProfile(store, userId);

  const joinedAt = Number(profile.voice.joinedAt || 0);
  if (!joinedAt) return;

  const minutes = Math.max(0, Math.floor((Date.now() - joinedAt) / 60000));

  profile.lifetime.vcMinutes += minutes;
  profile.weekly.vcMinutes += minutes;
  profile.monthly.stats.vcMinutes += minutes;

  profile.voice.joinedAt = null;

  profile.lifetime.updatedAt = new Date().toISOString();
  profile.weekly.updatedAt = new Date().toISOString();
  profile.monthly.stats.updatedAt = new Date().toISOString();

  writeStore(store);
}

function resetWeeklyProfiles() {
  const store = readStore();
  store.profiles = store.profiles || {};

  for (const profile of Object.values(store.profiles)) {
    profile.weekly = blankBucket();
    if (!profile.voice) profile.voice = { joinedAt: null };
  }

  writeStore(store);
}

function resetMonthlyProfiles() {
  const store = readStore();
  store.profiles = store.profiles || {};
  const monthKey = currentMonthKey();

  for (const profile of Object.values(store.profiles)) {
    profile.monthly = {
      monthKey,
      stats: blankBucket(),
    };
    if (!profile.voice) profile.voice = { joinedAt: null };
  }

  writeStore(store);
}

function topEntryFromMap(mapObj) {
  const entries = Object.entries(mapObj || {});
  if (!entries.length) return null;
  entries.sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0));
  return { key: entries[0][0], val: Number(entries[0][1] || 0) };
}

function buildProfileSummary(userId) {
  const store = readStore();
  const profile = ensureProfile(store, userId);

  const lifetime = profile.lifetime;
  const weekly = profile.weekly;
  const monthly = profile.monthly?.stats || blankBucket();

  const kd =
    Number(lifetime.deaths || 0) > 0
      ? (Number(lifetime.kills || 0) / Number(lifetime.deaths || 1)).toFixed(2)
      : Number(lifetime.kills || 0) > 0
      ? String(lifetime.kills)
      : "0.00";

  return {
    lifetime,
    weekly,
    monthly,
    kd,
    favoriteMission: topEntryFromMap(lifetime.missionTypes),
    favoriteEnemy: topEntryFromMap(lifetime.enemies),
    favoritePlanet: topEntryFromMap(lifetime.planets),
    favoriteDifficulty: topEntryFromMap(lifetime.difficulties),
  };
}

module.exports = {
  readStore,
  writeStore,
  currentMonthKey,

  ensureProfile,
  recordRun,
  removeRun,
  updateRunScore,

  startVoiceSession,
  endVoiceSession,

  resetWeeklyProfiles,
  resetMonthlyProfiles,

  buildProfileSummary,
};