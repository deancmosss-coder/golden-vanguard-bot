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

function getMajorOrders(warData) {
  if (Array.isArray(warData?.majorOrders)) return warData.majorOrders;
  return [];
}

function getPrimaryMajorOrder(warData) {
  const list = getMajorOrders(warData);
  return list[0] || null;
}

function getPlanetCatalog(warData) {
  const planets = warData?.planets;
  if (planets && typeof planets === "object" && !Array.isArray(planets)) {
    return planets;
  }
  return {};
}

function resolvePlanetNameByIndex(warData, index) {
  const catalog = getPlanetCatalog(warData);
  const key = String(index);

  if (catalog[key]?.name) return String(catalog[key].name);

  for (const [k, v] of Object.entries(catalog)) {
    if (String(k) === key && v?.name) return String(v.name);
    if (Number(v?.index) === Number(index) && v?.name) return String(v.name);
  }

  return null;
}

function extractPlanetNamesFromTaskValues(warData, values) {
  if (!Array.isArray(values)) return [];

  const out = [];

  for (const value of values) {
    if (Array.isArray(value)) {
      for (const inner of value) {
        const resolved = resolvePlanetNameByIndex(warData, inner);
        if (resolved) out.push(resolved);
      }
      continue;
    }

    if (typeof value === "number" || /^\d+$/.test(String(value))) {
      const resolved = resolvePlanetNameByIndex(warData, value);
      if (resolved) out.push(resolved);
    }
  }

  return [...new Set(out)];
}

function extractMoTargetPlanets(warData, majorOrder) {
  if (!majorOrder) return [];

  const names = new Set();

  const taskLists = [];
  if (Array.isArray(majorOrder.tasks)) taskLists.push(...majorOrder.tasks);
  if (Array.isArray(majorOrder.objectives)) taskLists.push(...majorOrder.objectives);
  if (Array.isArray(majorOrder.goals)) taskLists.push(...majorOrder.goals);

  for (const task of taskLists) {
    if (Array.isArray(task?.values)) {
      for (const name of extractPlanetNamesFromTaskValues(warData, task.values)) {
        names.add(name);
      }
    }

    if (Array.isArray(task?.targetPlanetIndices)) {
      for (const idx of task.targetPlanetIndices) {
        const resolved = resolvePlanetNameByIndex(warData, idx);
        if (resolved) names.add(resolved);
      }
    }

    if (task?.planetIndex !== undefined) {
      const resolved = resolvePlanetNameByIndex(warData, task.planetIndex);
      if (resolved) names.add(resolved);
    }

    if (task?.planet?.name) names.add(String(task.planet.name));
    if (task?.name && !String(task.name).toLowerCase().includes("kill")) names.add(String(task.name));
  }

  if (majorOrder?.planet?.name) names.add(String(majorOrder.planet.name));

  return [...names].filter(Boolean).slice(0, 5);
}

function inferFactionFromText(text) {
  const t = String(text || "").toLowerCase();

  if (t.includes("terminid") || t.includes("bugs") || t.includes("bug")) return "Terminids";
  if (t.includes("automaton") || t.includes("bots") || t.includes("bot")) return "Automatons";
  if (t.includes("illuminate") || t.includes("squid") || t.includes("squids")) return "Illuminate";

  return "Unknown";
}

function getMoFaction(majorOrder) {
  if (!majorOrder) return "Unknown";

  const combined = [
    majorOrder.title,
    majorOrder.briefing,
    majorOrder.description,
    ...(Array.isArray(majorOrder.tasks)
      ? majorOrder.tasks.flatMap((t) => [t?.description, t?.briefing, t?.name])
      : []),
  ]
    .filter(Boolean)
    .join(" ");

  return inferFactionFromText(combined);
}

function getMoExpiry(majorOrder) {
  if (!majorOrder) return null;

  const raw =
    majorOrder.expiresAt ||
    majorOrder.expiration ||
    majorOrder.endTime ||
    majorOrder.endDate ||
    majorOrder.deadline ||
    null;

  if (!raw) return null;

  const ts = new Date(raw).getTime();
  if (Number.isNaN(ts)) return null;

  return Math.floor(ts / 1000);
}

function buildMajorOrderText(warData, majorOrder) {
  if (!majorOrder) return "_No active major order found._";

  const title = majorOrder.title || majorOrder.name || "Major Order";
  const briefing =
    majorOrder.briefing ||
    majorOrder.description ||
    (Array.isArray(majorOrder.tasks) && majorOrder.tasks[0]?.description) ||
    null;

  const planets = extractMoTargetPlanets(warData, majorOrder);
  const faction = getMoFaction(majorOrder);
  const expiryTs = getMoExpiry(majorOrder);

  const parts = [`**${title}**`];

  if (briefing) parts.push(briefing.slice(0, 280));
  parts.push(`Target Planets: **${planets.length ? planets.join(", ") : "Unknown"}**`);
  parts.push(`Enemy Faction: **${faction}**`);

  if (expiryTs) {
    parts.push(`Expires: <t:${expiryTs}:R>`);
  }

  return parts.join("\n");
}

function extractPlanetNames(warData) {
  const names = new Set();

  if (Array.isArray(warData?.campaign)) {
    for (const p of warData.campaign) {
      if (p?.name) names.add(String(p.name));
      if (p?.planet?.name) names.add(String(p.planet.name));
    }
  }

  if (warData?.planets && typeof warData.planets === "object" && !Array.isArray(warData.planets)) {
    for (const value of Object.values(warData.planets)) {
      if (value?.name) names.add(String(value.name));
    }
  }

  if (Array.isArray(warData?.status?.planetStatus)) {
    for (const p of warData.status.planetStatus) {
      if (p?.name) names.add(String(p.name));
      if (p?.planet?.name) names.add(String(p.planet.name));
    }
  }

  if (Array.isArray(warData?.status)) {
    for (const p of warData.status) {
      if (p?.name) names.add(String(p.name));
      if (p?.planet?.name) names.add(String(p.planet.name));
    }
  }

  if (Array.isArray(warData?.info)) {
    for (const p of warData.info) {
      if (p?.name) names.add(String(p.name));
    }
  }

  if (warData?.info && typeof warData.info === "object" && !Array.isArray(warData.info)) {
    for (const value of Object.values(warData.info)) {
      if (value?.name) names.add(String(value.name));
      if (Array.isArray(value)) {
        for (const p of value) {
          if (p?.name) names.add(String(p.name));
          if (p?.planet?.name) names.add(String(p.planet.name));
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
      ? [...new Set(arr)].slice(0, 5).map((p, i) => `${i + 1}. ${p}`).join("\n")
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

  const majorOrder = getPrimaryMajorOrder(warData);
  const warMap = buildWarMapLines(warData);

  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle("🌌 GOLDEN VANGUARD WAR MAP")
    .setDescription("Live war sync + Vanguard command overview")
    .addFields(
      {
        name: "🎯 Current Major Order",
        value: buildMajorOrderText(warData, majorOrder),
        inline: false,
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