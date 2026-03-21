const fs = require("fs");
const path = require("path");

const CACHE = path.join(__dirname, "..", "data", "war_cache.json");
const ALERT_CHANNEL_NAME = "vanguard-high-command";

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

function getPlanetStatuses(war) {
  if (Array.isArray(war?.status?.planetStatus)) return war.status.planetStatus;
  if (Array.isArray(war?.status)) return war.status;
  return [];
}

async function checkWarAlerts(client) {
  console.log("[WAR ALERTS] Checking alerts...");

  const war = readJson(CACHE);
  const planets = getPlanetStatuses(war);

  if (!planets.length) {
    console.log("[WAR ALERTS] No planet data");
    return;
  }

  const critical = planets.filter((p) => {
    const liberation =
      Number(p?.liberationPercent ?? p?.liberation ?? p?.percentage ?? 0);
    return liberation >= 90 && liberation < 100;
  });

  if (!critical.length) {
    console.log("[WAR ALERTS] No critical planets");
    return;
  }

  for (const guild of client.guilds.cache.values()) {
    const channel = guild.channels.cache.find(
      (c) =>
        c.isTextBased?.() &&
        c.name?.toLowerCase() === ALERT_CHANNEL_NAME.toLowerCase()
    );

    if (!channel) {
      console.log("[WAR ALERTS] Channel not found in:", guild.name);
      continue;
    }

    for (const p of critical) {
      const name = p?.name || p?.planet?.name || "Unknown Planet";
      const liberation = Number(
        p?.liberationPercent ?? p?.liberation ?? p?.percentage ?? 0
      ).toFixed(1);

      await channel.send(
        [
          "⚠️ **HIGH COMMAND ALERT**",
          "",
          `**${name}** nearing liberation (**${liberation}%**)`,
          "All Vanguard divisions deploy immediately.",
          "",
          "For Super Earth.",
        ].join("\n")
      ).catch(() => {});
    }
  }
}

module.exports = { checkWarAlerts };