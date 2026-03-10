const fs = require("fs");
const path = require("path");
const { EmbedBuilder } = require("discord.js");

const BOARD_CONFIG = path.join(__dirname, "..", "data", "boardConfig.json");
const TRACKER_STORE = path.join(__dirname, "..", "tracker_store.json");

function readJson(file, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

function topEntry(obj) {
  const entries = Object.entries(obj || {});
  if (!entries.length) return null;
  entries.sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0));
  return { key: entries[0][0], val: Number(entries[0][1] || 0) };
}

function topN(obj, n = 3, valueGetter = (v) => Number(v || 0)) {
  return Object.entries(obj || {})
    .sort((a, b) => valueGetter(b[1]) - valueGetter(a[1]))
    .slice(0, n);
}

function findPrimaryAssignment(warData) {
  const list = Array.isArray(warData?.assignments) ? warData.assignments : [];
  return list[0] || null;
}

function buildAssignmentText(assignment) {
  if (!assignment) return "_No active assignment found._";

  const title = assignment.title || "Unknown Assignment";
  const briefing = assignment.briefing ? `\n${assignment.briefing.slice(0, 250)}` : "";
  const expiresAt = assignment.expiresAt
    ? `\nEnds: <t:${Math.floor(new Date(assignment.expiresAt).getTime() / 1000)}:R>`
    : "";

  return `**${title}**${briefing}${expiresAt}`;
}

function getTrackedTopPlanets(store) {
  const planets = store?.planets || {};
  const entries = topN(planets, 3, (v) => Number(v?.missions || 0));

  if (!entries.length) return "_No planet data yet._";

  return entries
    .map(([planet, stats], i) => `${i + 1}. **${planet}** — ${Number(stats?.missions || 0)} missions`)
    .join("\n");
}

function extractPlanetNames(warData) {
  const names = new Set();

  const status = warData?.status;
  const info = warData?.info;

  if (Array.isArray(status)) {
    for (const p of status) {
      if (p?.name) names.add(String(p.name));
      if (p?.planet?.name) names.add(String(p.planet.name));
    }
  }

  if (Array.isArray(status?.planetStatus)) {
    for (const p of status.planetStatus) {
      if (p?.name) names.add(String(p.name));
      if (p?.planet?.name) names.add(String(p.planet.name));
    }
  }

  if (Array.isArray(info)) {
    for (const p of info) {
      if (p?.name) names.add(String(p.name));
    }
  }

  if (info && typeof info === "object" && !Array.isArray(info)) {
    for (const value of Object.values(info)) {
      if (value?.name) names.add(String(value.name));
      if (Array.isArray(value)) {
        for (const p of value) {
          if (p?.name) names.add(String(p.name));
        }
      }
    }
  }

  return [...names];
}

function inferFrontFromPlanet(name) {
  const n = String(name || "").toLowerCase();

  const illuminate = [
    "herthon", "zea", "secundus", "rugosia", "kerth", "regnus", "mog", "oasis",
    "genesis", "hydrobius", "haldus", "valmox", "alamak", "meze", "parsh"
  ];

  const automatons = [
    "mintoria", "gacrux", "achdar", "grand", "urant", "gracux", "mortar", "martale",
    "charbal", "choepessa", "vernen", "wells", "aesir", "pass", "matar", "bay"
  ];

  const terminids = [
    "estanu", "fori", "prime", "crimsica", "hellmire", "nivel", "omicron",
    "fenrir", "erata", "pöpli", "bore", "rock", "pandion"
  ];

  if (illuminate.some((x) => n.includes(x))) return "Illuminate";
  if (automatons.some((x) => n.includes(x))) return "Automatons";
  if (terminids.some((x) => n.includes(x))) return "Terminids";
  return "Unknown";
}

function buildWarMapLines(warData) {
  const planetNames = extractPlanetNames(warData);

  if (!planetNames.length) {
    return {
      bots: "_No planet intel_",
      bugs: "_No planet intel_",
      ill: "_No planet intel_",
    };
  }

  const grouped = {
    Automatons: [],
    Terminids: [],
    Illuminate: [],
    Unknown: [],
  };

  for (const name of planetNames) {
    const front = inferFrontFromPlanet(name);
    grouped[front].push(name);
  }

  const format = (arr) =>
    arr.length
      ? arr.slice(0, 5).map((p, i) => `${i + 1}. ${p}`).join("\n")
      : "_No active intel_";

  return {
    bots: format(grouped.Automatons),
    bugs: format(grouped.Terminids),
    ill: format(grouped.Illuminate),
  };
}

function buildDivisionContribution(store) {
  const divisions = store?.weekly?.divisions || {};
  const entries = topN(divisions, 4);

  if (!entries.length) return "_No division activity yet._";

  return entries
    .map(([name, pts], i) => `${i + 1}. **${name}** — ${Number(pts)} pts`)
    .join("\n");
}

function buildPlanetContribution(store) {
  const planets = store?.planets || {};
  const entries = topN(planets, 5, (v) => Number(v?.score || 0));

  if (!entries.length) return "_No planet contribution yet._";

  return entries
    .map(([name, stats], i) => {
      const missions = Number(stats?.missions || 0);
      const score = Number(stats?.score || 0);
      return `${i + 1}. **${name}** — ${missions} runs / ${score} pts`;
    })
    .join("\n");
}

async function updateOperationsBoard(client, warData) {
  console.log("[WAR BOARD] updateOperationsBoard started");

  const cfg = readJson(BOARD_CONFIG, {});
  console.log("[WAR BOARD] boardConfig:", cfg);

  if (!cfg.channelId) {
    console.log("[WAR BOARD] No channelId found in boardConfig.json");
    return;
  }

  const tracker = readJson(TRACKER_STORE, {});
  const weeklyPlayers = tracker.weekly?.players || {};
  const weeklyDivisions = tracker.weekly?.divisions || {};
  const weeklyEnemies = tracker.weekly?.enemies || {};

  const topPlayer = topEntry(weeklyPlayers);
  const topDivision = topEntry(weeklyDivisions);
  const topEnemy = topEntry(weeklyEnemies);

  const channel = await client.channels.fetch(cfg.channelId).catch((err) => {
    console.error("[WAR BOARD] Failed fetching channel:", err.message);
    return null;
  });

  if (!channel) {
    console.log("[WAR BOARD] Channel not found");
    return;
  }

  if (!channel.isTextBased?.()) {
    console.log("[WAR BOARD] Channel is not text-based");
    return;
  }

  console.log("[WAR BOARD] Found channel:", channel.name);

  const assignment = findPrimaryAssignment(warData);
  const warMap = buildWarMapLines(warData);

function parseMajorOrderIntel(assignment) {
  if (!assignment) return "_No intel available_";

  const briefing = (assignment.briefing || "").toLowerCase();

  let faction = "Unknown";
  if (briefing.includes("terminid")) faction = "Terminids";
  if (briefing.includes("automaton")) faction = "Automatons";
  if (briefing.includes("illuminate")) faction = "Illuminate";

  const planetMatch = briefing.match(/(fenrir|hellmire|estanu|mintoria|aesir|fori|erata|nivel)/i);
  const planet = planetMatch ? planetMatch[0] : "Multiple Planets";

  return `Planet Target: **${planet}**
Enemy Faction: **${faction}**`;
}

  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle("🌌 GOLDEN VANGUARD WAR MAP")
    .setDescription("Live war sync + Vanguard command overview")
    .addFields(
     {
 name: "🎯 Current Major Order",
 value: buildAssignmentText(assignment)
},
{
 name: "🛰 Mission Intel",
 value: parseMajorOrderIntel(assignment)
},
      {
        name: "🤖 Automaton Front",
        value: warMap.bots,
        inline: true,
      },
      {
        name: "🐛 Terminid Front",
        value: warMap.bugs,
        inline: true,
      },
      {
        name: "👽 Illuminate Front",
        value: warMap.ill,
        inline: true,
      },
      {
        name: "🪖 Division Contribution",
        value: buildDivisionContribution(tracker),
        inline: false,
      },
      {
        name: "🪐 Vanguard Planet Contribution",
        value: buildPlanetContribution(tracker),
        inline: false,
      },
      {
        name: "🏆 Top Diver",
        value: topPlayer ? `<@${topPlayer.key}> — **${topPlayer.val}**` : "_None yet_",
        inline: true,
      },
      {
        name: "🛡 Top Division",
        value: topDivision ? `**${topDivision.key}** — **${topDivision.val}**` : "_None yet_",
        inline: true,
      },
      {
        name: "👾 Top Enemy Front",
        value: topEnemy ? `**${topEnemy.key}** — **${topEnemy.val}**` : "_None yet_",
        inline: true,
      },
      {
        name: "📡 War Sync",
        value: warData?.updatedAt
          ? `Updated <t:${Math.floor(new Date(warData.updatedAt).getTime() / 1000)}:R>`
          : "_No sync data_",
        inline: false,
      }
    )
    .setFooter({ text: "The Golden Vanguard" })
    .setTimestamp();

  let message = null;

  if (cfg.messageId) {
    message = await channel.messages.fetch(cfg.messageId).catch((err) => {
      console.error("[WAR BOARD] Failed fetching message:", err.message);
      return null;
    });
  }

  if (!message) {
    console.log("[WAR BOARD] No valid message found. Sending new one...");
    message = await channel.send({ embeds: [embed] }).catch((err) => {
      console.error("[WAR BOARD] Failed sending new message:", err.message);
      return null;
    });

    if (!message) return;

    cfg.messageId = message.id;
    writeJson(BOARD_CONFIG, cfg);
    console.log("[WAR BOARD] Created new board message:", message.id);
    return;
  }

  if (message.author.id !== client.user.id) {
    console.log("[WAR BOARD] Existing message belongs to a user, not the bot. Sending new one...");
    const newMessage = await channel.send({ embeds: [embed] }).catch((err) => {
      console.error("[WAR BOARD] Failed sending replacement message:", err.message);
      return null;
    });

    if (!newMessage) return;

    cfg.messageId = newMessage.id;
    writeJson(BOARD_CONFIG, cfg);
    console.log("[WAR BOARD] Created replacement board message:", newMessage.id);
    return;
  }

  await message.edit({ embeds: [embed] }).catch((err) => {
    console.error("[WAR BOARD] Failed editing message:", err.message);
  });

  console.log("[WAR BOARD] Edited existing board message");
}

module.exports = { updateOperationsBoard };