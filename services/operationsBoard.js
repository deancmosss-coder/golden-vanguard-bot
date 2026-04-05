// services/operationsBoard.js
const fs = require("fs");
const path = require("path");
const { EmbedBuilder } = require("discord.js");
const logger = require("./logger");

const BOARD_CONFIG = path.join(__dirname, "..", "data", "boardConfig.json");
const TRACKER_STORE = path.join(__dirname, "..", "tracker_store.json");

function readJson(file, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    logger.warn("Failed to read JSON file, using fallback", {
      location: "services/operationsBoard.js -> readJson",
      file,
      error: err.message,
    });
    return fallback;
  }
}

function writeJson(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    logger.error("Failed to write JSON file", err, {
      location: "services/operationsBoard.js -> writeJson",
      file,
    });
    throw err;
  }
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

function formatNumberShort(num) {
  const n = Number(num || 0);
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  return String(n);
}

function getMajorOrders(warData) {
  return Array.isArray(warData?.majorOrders) ? warData.majorOrders : [];
}

function getPrimaryMajorOrder(warData) {
  const orders = getMajorOrders(warData);
  return orders[0] || null;
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

function inferFactionFromText(text) {
  const t = String(text || "").toLowerCase();

  if (t.includes("illuminate") || t.includes("squid") || t.includes("squids")) return "Illuminate";
  if (t.includes("automaton") || t.includes("bots") || t.includes("bot")) return "Automatons";
  if (t.includes("terminid") || t.includes("bugs") || t.includes("bug")) return "Terminids";

  return "Unknown";
}

function extractPlanetNamesFromBrief(text) {
  const s = String(text || "");
  if (!s) return [];

  const results = new Set();

  const patterns = [
    /Reach\s+([A-Z][A-Za-z'-]+(?:\s[A-Z][A-Za-z0-9'-]+)*)/g,
    /on\s+([A-Z][A-Za-z'-]+(?:\s[A-Z][A-Za-z0-9'-]+)*)/g,
    /Hold\s+([A-Z][A-Za-z'-]+(?:\s[A-Z][A-Za-z0-9'-]+)*)/g,
    /Defend\s+([A-Z][A-Za-z'-]+(?:\s[A-Z][A-Za-z0-9'-]+)*)/g,
  ];

  for (const rx of patterns) {
    let match;
    while ((match = rx.exec(s)) !== null) {
      const value = String(match[1] || "").trim();
      if (value && value.length <= 40) results.add(value);
    }
  }

  return [...results];
}

function getTaskValue(task, desiredValueType) {
  if (!task || !Array.isArray(task.valueTypes) || !Array.isArray(task.values)) return null;
  const idx = task.valueTypes.findIndex((v) => Number(v) === Number(desiredValueType));
  if (idx === -1) return null;
  return task.values[idx] ?? null;
}

function extractMoTargetPlanets(warData, majorOrder) {
  if (!majorOrder) return [];

  const setting = majorOrder.setting || {};
  const tasks = Array.isArray(setting.tasks) ? setting.tasks : [];
  const names = new Set();

  const briefMatches = extractPlanetNamesFromBrief(setting.overrideBrief || "");
  for (const name of briefMatches) names.add(name);

  for (const task of tasks) {
    const planetIndex = getTaskValue(task, 12);
    const resolved = resolvePlanetNameByIndex(warData, planetIndex);
    if (resolved) names.add(resolved);
  }

  return [...names].filter(Boolean).slice(0, 5);
}

function getMoFaction(majorOrder) {
  if (!majorOrder) return "Unknown";
  const setting = majorOrder.setting || {};

  const faction = inferFactionFromText(
    [setting.overrideTitle, setting.overrideBrief, setting.taskDescription]
      .filter(Boolean)
      .join(" ")
  );

  return faction === "Unknown" ? "Illuminate" : faction;
}

function getMoRewardText(majorOrder) {
  const setting = majorOrder?.setting || {};
  const reward = setting.reward || (Array.isArray(setting.rewards) ? setting.rewards[0] : null);

  if (!reward) return "_Unknown_";

  const amount = Number(reward.amount || 0);
  if (!amount) return "_Unknown_";

  return `${amount} medals`;
}

function getMoExpiryText(majorOrder) {
  if (!majorOrder?.expiresIn) return "_Unknown_";
  const future = Math.floor(Date.now() / 1000) + Number(majorOrder.expiresIn);
  return `<t:${future}:R>`;
}

function extractMoTaskLines(warData, majorOrder, moFaction) {
  const setting = majorOrder?.setting || {};
  const tasks = Array.isArray(setting.tasks) ? setting.tasks : [];
  if (!tasks.length) return ["• _No objectives found._"];

  const lines = [];

  for (const task of tasks) {
    const type = Number(task?.type || 0);

    if (type === 3) {
      const target = Number(majorOrder?.progress?.[0] || 0);
      const current = Number(majorOrder?.progress?.[1] || 0);

      const planetIndex = getTaskValue(task, 12);
      const planetName =
        resolvePlanetNameByIndex(warData, planetIndex) ||
        extractPlanetNamesFromBrief(setting.overrideBrief || "")[0] ||
        "Unknown Planet";

      const faction = moFaction || "Illuminate";

      if (current < 1000000 && target >= 100000000) {
        lines.push(`• Kill **${formatNumberShort(target)} ${faction}** on **${planetName}**`);
      } else if (target > 0) {
        const percent = ((current / target) * 100).toFixed(1);
        lines.push(
          `• Kill **${formatNumberShort(target)} ${faction}** on **${planetName}** — ` +
          `**${percent}%** (${formatNumberShort(current)} / ${formatNumberShort(target)})`
        );
      } else {
        lines.push(`• Kill objective on **${planetName}**`);
      }
      continue;
    }

    if (type === 13) {
      const planetIndex = getTaskValue(task, 12);
      const planetName =
        resolvePlanetNameByIndex(warData, planetIndex) ||
        extractPlanetNamesFromBrief(setting.overrideBrief || "")[1] ||
        "Unknown Planet";

      lines.push(`• Hold **${planetName}** when the order expires`);
      continue;
    }

    const rawPlanetIndex = getTaskValue(task, 12);
    const planetName = resolvePlanetNameByIndex(warData, rawPlanetIndex);

    if (planetName) {
      lines.push(`• Objective on **${planetName}**`);
    } else {
      lines.push(`• Objective Type **${type}**`);
    }
  }

  return lines.slice(0, 5);
}

function buildMajorOrderTitle(majorOrder) {
  const setting = majorOrder?.setting || {};
  return setting.overrideTitle || "Major Order";
}

function buildMajorOrderBrief(majorOrder) {
  const setting = majorOrder?.setting || {};
  return setting.overrideBrief || "No briefing available";
}

function buildMajorOrderIntel(warData, majorOrder) {
  if (!majorOrder) return "_No active major order found._";

  const planets = extractMoTargetPlanets(warData, majorOrder);
  const faction = getMoFaction(majorOrder);
  const rewardText = getMoRewardText(majorOrder);
  const expiryText = getMoExpiryText(majorOrder);

  return [
    `🎯 **Target Planets:** ${planets.length ? planets.join(", ") : "Unknown"}`,
    `👾 **Enemy:** ${faction}`,
    `🏅 **Reward:** ${rewardText}`,
    `⏳ **Ends:** ${expiryText}`,
  ].join("\n");
}

function buildMajorOrderObjectives(warData, majorOrder) {
  if (!majorOrder) return "_No objectives found._";
  const faction = getMoFaction(majorOrder);
  return extractMoTaskLines(warData, majorOrder, faction).join("\n");
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
    "genesis", "hydrobius", "haldus", "valmox", "alamak", "meze", "parsh",
    "seasse", "rirga"
  ];

  const automatons = [
    "mintoria", "gacrux", "achdar", "grand", "urant", "gracux", "mortar", "martale",
    "charbal", "choepessa", "vernen", "wells", "aesir", "pass", "matar", "bay",
    "aurora"
  ];

  const terminids = [
    "estanu", "fori", "prime", "crimsica", "hellmire", "nivel", "omicron",
    "fenrir", "erata", "pöpli", "bore", "rock", "pandion", "charon"
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
  logger.info("[WAR BOARD] updateOperationsBoard started");

  const cfg = readJson(BOARD_CONFIG, {});

  if (!cfg.channelId) {
    const err = new Error("No channelId found in boardConfig.json");
    logger.error("[WAR BOARD] Missing board channel config", err, {
      location: "services/operationsBoard.js -> updateOperationsBoard",
      configPath: BOARD_CONFIG,
    });
    throw err;
  }

  const tracker = readJson(TRACKER_STORE, {});
  const weeklyPlayers = tracker.weekly?.players || {};
  const weeklyDivisions = tracker.weekly?.divisions || {};
  const weeklyEnemies = tracker.weekly?.enemies || {};

  const topPlayer = topEntry(weeklyPlayers);
  const topDivision = topEntry(weeklyDivisions);
  const topEnemy = topEntry(weeklyEnemies);

  const channel = await client.channels.fetch(cfg.channelId).catch((err) => {
    logger.error("[WAR BOARD] Failed fetching board channel", err, {
      location: "services/operationsBoard.js -> updateOperationsBoard",
      channelId: cfg.channelId,
    });
    return null;
  });

  if (!channel) {
    throw new Error(`War board channel not found: ${cfg.channelId}`);
  }

  if (!channel.isTextBased?.()) {
    throw new Error(`War board channel is not text-based: ${cfg.channelId}`);
  }

  logger.info("[WAR BOARD] Found board channel", {
    channelId: channel.id,
    channelName: channel.name,
  });

  const majorOrder = getPrimaryMajorOrder(warData);
  const warMap = buildWarMapLines(warData);

  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle("🌌 GOLDEN VANGUARD WAR MAP")
    .setDescription("Live war sync + Vanguard command overview")
    .addFields(
      {
        name: "🎯 Current Major Order",
        value: `**${buildMajorOrderTitle(majorOrder)}**\n${buildMajorOrderBrief(majorOrder)}`,
        inline: false,
      },
      {
        name: "🛰 Major Order Intel",
        value: buildMajorOrderIntel(warData, majorOrder),
        inline: false,
      },
      {
        name: "📋 Major Order Objectives",
        value: buildMajorOrderObjectives(warData, majorOrder),
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
      logger.warn("[WAR BOARD] Failed fetching existing board message", {
        location: "services/operationsBoard.js -> updateOperationsBoard",
        messageId: cfg.messageId,
        error: err.message,
      });
      return null;
    });
  }

  if (!message) {
    logger.info("[WAR BOARD] No valid board message found, sending new one");

    message = await channel.send({ embeds: [embed] }).catch((err) => {
      logger.error("[WAR BOARD] Failed sending new board message", err, {
        location: "services/operationsBoard.js -> updateOperationsBoard",
        channelId: channel.id,
      });
      return null;
    });

    if (!message) {
      throw new Error("Failed to create new war board message");
    }

    cfg.messageId = message.id;
    writeJson(BOARD_CONFIG, cfg);

    logger.info("[WAR BOARD] Created new board message", {
      messageId: message.id,
    });

    return;
  }

  if (message.author.id !== client.user.id) {
    logger.warn("[WAR BOARD] Existing message belongs to a user, sending replacement", {
      location: "services/operationsBoard.js -> updateOperationsBoard",
      messageId: message.id,
      authorId: message.author.id,
    });

    const newMessage = await channel.send({ embeds: [embed] }).catch((err) => {
      logger.error("[WAR BOARD] Failed sending replacement board message", err, {
        location: "services/operationsBoard.js -> updateOperationsBoard",
        channelId: channel.id,
      });
      return null;
    });

    if (!newMessage) {
      throw new Error("Failed to create replacement war board message");
    }

    cfg.messageId = newMessage.id;
    writeJson(BOARD_CONFIG, cfg);

    logger.info("[WAR BOARD] Created replacement board message", {
      messageId: newMessage.id,
    });

    return;
  }

  const edited = await message.edit({ embeds: [embed] }).catch((err) => {
    logger.error("[WAR BOARD] Failed editing board message", err, {
      location: "services/operationsBoard.js -> updateOperationsBoard",
      messageId: message.id,
    });
    return null;
  });

  if (!edited) {
    throw new Error(`Failed to edit existing war board message: ${message.id}`);
  }

  logger.info("[WAR BOARD] Edited existing board message", {
    messageId: message.id,
  });
}

module.exports = { updateOperationsBoard };
