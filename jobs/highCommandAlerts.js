const fs = require("fs");
const path = require("path");

const CACHE = path.join(__dirname, "..", "data", "war_cache.json");

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

function getPlanetStatusList(war) {
  if (Array.isArray(war?.status?.planetStatus)) return war.status.planetStatus;
  if (Array.isArray(war?.status)) return war.status;
  return [];
}

function getPlanetName(planet) {
  return planet?.name || planet?.planet?.name || "Unknown Planet";
}

function getLiberationValue(planet) {
  const raw =
    planet?.liberation ??
    planet?.liberationPercent ??
    planet?.percentage ??
    planet?.health ??
    0;

  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

async function checkWarAlerts(client) {
  console.log("[WAR ALERTS] Checking alerts...");

  const war = readJson(CACHE);
  const planets = getPlanetStatusList(war);

  const critical = planets.filter((p) => getLiberationValue(p) >= 90);

  if (!critical.length) {
    console.log("[WAR ALERTS] No critical planets");
    return;
  }

  const channel = client.channels.cache.find(
    (c) => c.name === "high-command-dispatch" && c.isTextBased?.()
  );

  if (!channel) {
    console.log("[WAR ALERTS] Channel not found");
    return;
  }

  for (const p of critical) {
    const name = getPlanetName(p);
    const liberation = getLiberationValue(p);

    await channel.send(
      `⚠ **HIGH COMMAND ALERT**

**${name}** is nearing liberation (**${liberation}%**).

All Vanguard divisions deploy immediately.

For Super Earth.`
    ).catch(() => {});
  }

  console.log("[WAR ALERTS] Alerts posted");
}

module.exports = { checkWarAlerts };