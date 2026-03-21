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

function sortedEntries(obj) {
  return Object.entries(obj || {}).sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0));
}

async function postTopRankers(client, mode = "weekly") {
  console.log(`[TOP RANKERS] Posting ${mode} honours...`);

  const store = readStore();

  const playerSource = mode === "monthly" ? store.monthly?.players : store.weekly?.players;
  const divisionSource = mode === "monthly" ? store.monthly?.divisions : store.weekly?.divisions;
  const enemySource = mode === "monthly" ? store.monthly?.enemies : store.weekly?.enemies;

  const players = sortedEntries(playerSource);
  const divisions = sortedEntries(divisionSource);
  const enemies = sortedEntries(enemySource);

  const channel = client.channels.cache.find(
    (c) => c.name === "top-rankers" && c.isTextBased?.()
  );

  if (!channel) {
    console.log("[TOP RANKERS] Channel not found");
    return;
  }

  const title =
    mode === "monthly"
      ? "🏅 MONTHLY VANGUARD HONOURS"
      : "🏆 WEEKLY VANGUARD HONOURS";

  const topPlayer = players[0];
  const topDivision = divisions[0];
  const topEnemy = enemies[0];

  await channel.send({
    content: [
      title,
      "",
      "🥇 **Top Diver**",
      topPlayer ? `<@${topPlayer[0]}> — **${Number(topPlayer[1] || 0)} pts**` : "_None yet_",
      "",
      "🛡 **Top Division**",
      topDivision ? `**${topDivision[0]}** — **${Number(topDivision[1] || 0)} pts**` : "_None yet_",
      "",
      "👾 **Top Enemy Front**",
      topEnemy ? `**${topEnemy[0]}** — **${Number(topEnemy[1] || 0)} pts**` : "_None yet_",
    ].join("\n"),
  });

  console.log(`[TOP RANKERS] ${mode} honours posted`);
}

module.exports = { postTopRankers };