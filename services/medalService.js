// =========================
// services/medalService.js
// =========================

const fs = require("fs");
const path = require("path");

const STORE_PATH = path.join(__dirname, "..", "tracker_store.json");
const MEDAL_CHANNEL_NAME = "vanguard-medal-hall";

const MEDALS = [
  {
    key: "first_deployment",
    name: "First Deployment",
    icon: "🪖",
    description: "Completed your first logged operation.",
    check: (stats) => Number(stats.totalRuns || 0) >= 1,
  },
  {
    key: "field_regular",
    name: "Field Regular",
    icon: "🎖",
    description: "Completed 10 logged operations.",
    check: (stats) => Number(stats.totalRuns || 0) >= 10,
  },
  {
    key: "veteran_diver",
    name: "Veteran Diver",
    icon: "🏅",
    description: "Completed 25 logged operations.",
    check: (stats) => Number(stats.totalRuns || 0) >= 25,
  },
  {
    key: "war_machine",
    name: "War Machine",
    icon: "⚔️",
    description: "Completed 50 logged operations.",
    check: (stats) => Number(stats.totalRuns || 0) >= 50,
  },
  {
    key: "centurion",
    name: "Centurion",
    icon: "👑",
    description: "Completed 100 logged operations.",
    check: (stats) => Number(stats.totalRuns || 0) >= 100,
  },
  {
    key: "first_blood",
    name: "First Blood",
    icon: "💥",
    description: "Recorded your first kill.",
    check: (stats) => Number(stats.totalKills || 0) >= 1,
  },
  {
    key: "thousand_kills",
    name: "Executioner",
    icon: "💀",
    description: "Recorded 1,000 kills.",
    check: (stats) => Number(stats.totalKills || 0) >= 1000,
  },
  {
    key: "five_thousand_kills",
    name: "Planet Breaker",
    icon: "☠️",
    description: "Recorded 5,000 kills.",
    check: (stats) => Number(stats.totalKills || 0) >= 5000,
  },
  {
    key: "ten_wins",
    name: "Reliable Operative",
    icon: "✅",
    description: "Achieved 10 mission wins.",
    check: (stats) => Number(stats.wins || 0) >= 10,
  },
  {
    key: "twenty_five_wins",
    name: "Battle Proven",
    icon: "🏆",
    description: "Achieved 25 mission wins.",
    check: (stats) => Number(stats.wins || 0) >= 25,
  },
  {
    key: "verified_operative",
    name: "Verified Operative",
    icon: "📎",
    description: "Completed your first proof-verified run.",
    check: (stats) => Number(stats.proofRuns || 0) >= 1,
  },
  {
    key: "elite_verifier",
    name: "Elite Verifier",
    icon: "📂",
    description: "Completed 10 proof-verified runs.",
    check: (stats) => Number(stats.proofRuns || 0) >= 10,
  },
  {
    key: "bug_hunter",
    name: "Bug Hunter",
    icon: "🐛",
    description: "Recorded 1,000 Terminid kills.",
    check: (stats) => Number(stats?.byEnemy?.Terminids?.kills || 0) >= 1000,
  },
  {
    key: "bot_breaker",
    name: "Bot Breaker",
    icon: "🤖",
    description: "Recorded 1,000 Automaton kills.",
    check: (stats) => Number(stats?.byEnemy?.Automatons?.kills || 0) >= 1000,
  },
  {
    key: "squid_slayer",
    name: "Squid Slayer",
    icon: "👽",
    description: "Recorded 500 Illuminate kills.",
    check: (stats) => Number(stats?.byEnemy?.Illuminate?.kills || 0) >= 500,
  },
  {
    key: "flawless_record",
    name: "Flawless Record",
    icon: "🌟",
    description: "Reached at least 10 runs with zero losses.",
    check: (stats) =>
      Number(stats.totalRuns || 0) >= 10 && Number(stats.losses || 0) === 0,
  },
  {
    key: "high_efficiency",
    name: "High Efficiency",
    icon: "📈",
    description: "Reached a K/D ratio of at least 10 after 10 runs.",
    check: (stats) =>
      Number(stats.totalRuns || 0) >= 10 && Number(stats.kd || 0) >= 10,
  },
];

function readStore() {
  try {
    if (!fs.existsSync(STORE_PATH)) return { users: {} };
    return JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
  } catch (err) {
    console.error("[MEDALS] readStore failed:", err);
    return { users: {} };
  }
}

function writeStore(store) {
  try {
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
  } catch (err) {
    console.error("[MEDALS] writeStore failed:", err);
  }
}

function ensureUserAwards(store, userId) {
  store.users = store.users || {};
  store.users[userId] = store.users[userId] || {};
  store.users[userId].awards = store.users[userId].awards || {};
  store.users[userId].awards.medals = Array.isArray(store.users[userId].awards.medals)
    ? store.users[userId].awards.medals
    : [];
}

function getUnlockedMedalKeys(store, userId) {
  ensureUserAwards(store, userId);
  return new Set(store.users[userId].awards.medals.map((m) => m.key));
}

function getUserStats(store, userId) {
  return store?.users?.[userId]?.stats || null;
}

function getNewlyEarnedMedals(store, userId) {
  const stats = getUserStats(store, userId);
  if (!stats) return [];

  const unlocked = getUnlockedMedalKeys(store, userId);

  return MEDALS.filter((medal) => !unlocked.has(medal.key) && medal.check(stats));
}

function grantMedals(store, userId, medals) {
  if (!medals.length) return;

  ensureUserAwards(store, userId);

  for (const medal of medals) {
    store.users[userId].awards.medals.push({
      key: medal.key,
      name: medal.name,
      icon: medal.icon,
      description: medal.description,
      awardedAt: new Date().toISOString(),
    });
  }
}

async function findMedalChannel(client, guildId) {
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return null;

  return (
    guild.channels.cache.find(
      (c) => c.name === MEDAL_CHANNEL_NAME && c.isTextBased?.()
    ) || null
  );
}

async function postMedalUnlocks(client, guildId, userId, medals) {
  if (!medals.length) return;

  const channel = await findMedalChannel(client, guildId);
  if (!channel) return;

  for (const medal of medals) {
    await channel
      .send(
        [
          `🏅 **MEDAL AWARDED**`,
          "",
          `${medal.icon} <@${userId}> has unlocked **${medal.name}**`,
          `${medal.description}`,
        ].join("\n")
      )
      .catch(() => {});
  }
}

async function checkAndAwardMedals(client, guildId, userId) {
  const store = readStore();
  const medals = getNewlyEarnedMedals(store, userId);

  if (!medals.length) return [];

  grantMedals(store, userId, medals);
  writeStore(store);

  await postMedalUnlocks(client, guildId, userId, medals);
  return medals;
}

function getUserMedals(userId) {
  const store = readStore();
  ensureUserAwards(store, userId);
  return store.users[userId].awards.medals || [];
}

module.exports = {
  MEDALS,
  checkAndAwardMedals,
  getUserMedals,
};