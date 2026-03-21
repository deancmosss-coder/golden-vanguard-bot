const fs = require("fs");
const path = require("path");

const TRACKER = path.join(__dirname, "..", "tracker_store.json");

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

function formatSection(title, lines) {
  if (!lines.length) return `${title}\n_No data yet_`;
  return `${title}\n${lines.join("\n")}`;
}

async function postWarEffort(client) {
  console.log("[WAR EFFORT] Posting report...");

  const tracker = readJson(TRACKER);

  const planets = tracker.planets || {};
  const divisions = tracker.weekly?.divisions || {};
  const enemies = tracker.weekly?.enemies || {};

  const topPlanets = Object.entries(planets)
    .sort((a, b) => Number(b[1]?.missions || 0) - Number(a[1]?.missions || 0))
    .slice(0, 5)
    .map(([name, stats], i) => `${i + 1}. **${name}** — ${Number(stats?.missions || 0)} runs`);

  const topDivisions = Object.entries(divisions)
    .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))
    .slice(0, 5)
    .map(([name, pts], i) => `${i + 1}. **${name}** — ${Number(pts || 0)} pts`);

  const topEnemies = Object.entries(enemies)
    .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))
    .slice(0, 5)
    .map(([name, pts], i) => `${i + 1}. **${name}** — ${Number(pts || 0)} pts`);

  const channel = client.channels.cache.find(
    (c) => c.name === "vanguard-war-effort" && c.isTextBased?.()
  );

  if (!channel) {
    console.log("[WAR EFFORT] Channel not found");
    return;
  }

  await channel.send({
    content: [
      "📡 **WAR EFFORT REPORT**",
      "",
      formatSection("🪐 Top Planets", topPlanets),
      "",
      formatSection("🛡 Division Effort", topDivisions),
      "",
      formatSection("👾 Enemy Front", topEnemies),
    ].join("\n"),
  });

  console.log("[WAR EFFORT] Report posted");
}

module.exports = { postWarEffort };