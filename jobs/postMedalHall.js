const fs = require("fs");
const path = require("path");

const STORE = path.join(__dirname, "..", "tracker_store.json");

function readStore() {
  try {
    return JSON.parse(fs.readFileSync(STORE, "utf8"));
  } catch {
    return {};
  }
}

function topEntry(obj) {
  const entries = Object.entries(obj || {});
  if (!entries.length) return null;
  entries.sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0));
  return { key: entries[0][0], val: Number(entries[0][1] || 0) };
}

function getWeekLabel(date = new Date()) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
  }).format(date);
}

function currentMonthKey(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
  }).format(d);
}

async function postMedalHall(client) {
  console.log("[MEDAL HALL] Posting weekly medals...");

  const store = readStore();

  const weeklyPlayers = store.weekly?.players || {};
  const weeklyDivisions = store.weekly?.divisions || {};

  const topPlayer = topEntry(weeklyPlayers);
  const topDivision = topEntry(weeklyDivisions);

  if (!topPlayer && !topDivision) {
    console.log("[MEDAL HALL] No data to post");
    return;
  }

  const channel = client.channels.cache.find(
    (c) => c.name === "vanguard-medal-hall" && c.isTextBased?.()
  );

  if (!channel) {
    console.log("[MEDAL HALL] Channel not found");
    return;
  }

  const weekLabel = getWeekLabel();
  const monthKey = currentMonthKey();

  // Save history
  store.history = store.history || {};
  store.history.weeks = store.history.weeks || [];

  store.history.weeks.push({
    weekLabel,
    monthKey,
    topPlayerId: topPlayer?.key || null,
    topPlayerPoints: topPlayer?.val || 0,
    topFactionName: topDivision?.key || null,
    topFactionPoints: topDivision?.val || 0,
    createdAt: new Date().toISOString(),
  });

  fs.writeFileSync(STORE, JSON.stringify(store, null, 2), "utf8");

  await channel.send({
    content: [
      "🎖 **VANGUARD MEDAL AWARDS**",
      "",
      `📅 Week of **${weekLabel}**`,
      "",
      "🏆 **Top Diver**",
      topPlayer ? `<@${topPlayer.key}> — **${topPlayer.val} pts**` : "_None_",
      "",
      "🛡 **Top Division**",
      topDivision ? `**${topDivision.key}** — **${topDivision.val} pts**` : "_None_",
      "",
      "Glory to the Vanguard.",
    ].join("\n"),
  });

  console.log("[MEDAL HALL] Posted and saved to history");
}

module.exports = { postMedalHall };