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

function writeStore(store) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

function getMissionMilestones() {
  return [10, 25, 50, 100, 250];
}

function ensureUserAwards(store, userId) {
  store.users = store.users || {};
  store.users[userId] = store.users[userId] || {};
  store.users[userId].awards = store.users[userId].awards || {};
  store.users[userId].awards.missions = store.users[userId].awards.missions || [];
  return store.users[userId].awards.missions;
}

async function checkAndPostMissionMilestones(client, guildId, userId) {
  const store = readStore();

  const totalRuns = Number(store.users?.[userId]?.totalRuns || 0);
  const awarded = ensureUserAwards(store, userId);

  const newMilestones = getMissionMilestones().filter(
    (m) => totalRuns >= m && !awarded.includes(m)
  );

  if (!newMilestones.length) return;

  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return;

  const channel = guild.channels.cache.find(
    (c) => c.name === "vanguard-medal-hall" && c.isTextBased?.()
  );

  if (!channel) return;

  for (const milestone of newMilestones) {
    await channel.send({
      content: [
        "🏅 **MISSION MILESTONE AWARDED**",
        "",
        `<@${userId}> has completed **${milestone} logged runs** for the Golden Vanguard.`,
      ].join("\n"),
    }).catch(() => {});

    awarded.push(milestone);
  }

  writeStore(store);
}

module.exports = {
  checkAndPostMissionMilestones,
};