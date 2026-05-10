const fs = require("fs");
const path = require("path");

const logger = require("./logger");
const twitchService = require("./platformServices/twitchService");
const creatorStore = require("./creatorStore");

const ALERT_STORE_PATH = path.join(__dirname, "..", "data", "streamAlerts.json");

function defaultStore() {
  return {
    liveStreams: [],
  };
}

function ensureStoreFile() {
  const dir = path.dirname(ALERT_STORE_PATH);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(ALERT_STORE_PATH)) {
    fs.writeFileSync(ALERT_STORE_PATH, JSON.stringify(defaultStore(), null, 2), "utf8");
  }
}

function readStore() {
  ensureStoreFile();

  try {
    const raw = fs.readFileSync(ALERT_STORE_PATH, "utf8");
    const parsed = JSON.parse(raw);

    return {
      liveStreams: Array.isArray(parsed.liveStreams) ? parsed.liveStreams : [],
    };
  } catch (err) {
    logger.error("Failed to read stream alert store", err, {
      location: "streamAlertService.js -> readStore",
    });

    return defaultStore();
  }
}

function writeStore(store) {
  ensureStoreFile();

  try {
    fs.writeFileSync(ALERT_STORE_PATH, JSON.stringify(store, null, 2), "utf8");
  } catch (err) {
    logger.error("Failed to write stream alert store", err, {
      location: "streamAlertService.js -> writeStore",
    });
  }
}

function isAlreadyLive(store, creatorId, platform) {
  return store.liveStreams.some(
    (stream) => stream.creatorId === creatorId && stream.platform === platform
  );
}

function markLive(store, data) {
  const alreadyLive = isAlreadyLive(store, data.creatorId, data.platform);

  if (!alreadyLive) {
    store.liveStreams.push(data);
    writeStore(store);
  }
}

function clearLive(store, creatorId, platform) {
  store.liveStreams = store.liveStreams.filter(
    (stream) => !(stream.creatorId === creatorId && stream.platform === platform)
  );

  writeStore(store);
}

function normalisePlatformName(value) {
  const text = String(value || "").toLowerCase();

  if (text.includes("twitch")) return "twitch";
  if (text.includes("youtube")) return "youtube";
  if (text.includes("kick")) return "kick";
  if (text.includes("tiktok")) return "tiktok";

  return text.trim();
}

function extractTwitchUsername(value) {
  if (!value) return null;

  const text = String(value).trim();

  const urlMatch = text.match(/(?:https?:\/\/)?(?:www\.)?twitch\.tv\/([^/?\s]+)/i);
  if (urlMatch?.[1]) {
    return urlMatch[1].replace("@", "").trim();
  }

  const simpleMatch = text.match(/^[a-zA-Z0-9_]{3,25}$/);
  if (simpleMatch) {
    return text.trim();
  }

  return null;
}

function parseRawLinesForTwitch(rawText) {
  const lines = String(rawText || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (line.toLowerCase().includes("twitch") || line.toLowerCase().includes("twitch.tv")) {
      const username = extractTwitchUsername(line);
      if (username) return username;
    }
  }

  return null;
}

function getTwitchUsernameFromCreator(creator) {
  if (!creator) return null;

  if (Array.isArray(creator.platforms)) {
    for (const item of creator.platforms) {
      const platform = normalisePlatformName(item.platform || item.label || item.name);
      const url = item.url || item.value || item.link;

      if (platform === "twitch") {
        const username = extractTwitchUsername(url);
        if (username) return username;
      }

      const fallbackUsername = extractTwitchUsername(url);
      if (fallbackUsername) return fallbackUsername;
    }
  }

  const topLevelRaw = parseRawLinesForTwitch(creator.platformsRaw);
  if (topLevelRaw) return topLevelRaw;

  if (creator.application) {
    if (Array.isArray(creator.application.platforms)) {
      for (const item of creator.application.platforms) {
        const platform = normalisePlatformName(item.platform || item.label || item.name);
        const url = item.url || item.value || item.link;

        if (platform === "twitch") {
          const username = extractTwitchUsername(url);
          if (username) return username;
        }

        const fallbackUsername = extractTwitchUsername(url);
        if (fallbackUsername) return fallbackUsername;
      }
    }

    const nestedRaw = parseRawLinesForTwitch(creator.application.platformsRaw);
    if (nestedRaw) return nestedRaw;

    if (typeof creator.application.platforms === "string") {
      const nestedString = parseRawLinesForTwitch(creator.application.platforms);
      if (nestedString) return nestedString;
    }
  }

  return null;
}

function buildLiveMessage(creator, streamData) {
  const liveCreatorRoleId = process.env.LIVE_CREATOR_ROLE_ID;
  const title = streamData.title || "LIVE NOW";
  const game = streamData.game_name || "Streaming";
  const streamUrl = `https://twitch.tv/${streamData.user_login}`;

  return {
    content: "@everyone", 

    embeds: [
      {
        color: 0xf1c40f,
        title: `🔴 ${creator.displayName || creator.discordTag || "A Vanguard Creator"} is LIVE`,
        url: streamUrl,
        description: [
          `🎮 ${game}`,
          "",
          `**${title}**`,
          "",
          "━━━━━━━━━━━━━━━━━━",
          "",
          "🪖 Deploy into the stream and support the Vanguard Creator Network.",
        ].join("\n"),
        image: {
          url:
            streamData.thumbnail_url
              ?.replace("{width}", "1280")
              ?.replace("{height}", "720") || null,
        },
        footer: {
          text: "The Golden Vanguard Creator Network",
        },
        timestamp: new Date().toISOString(),
      },
    ],

    allowedMentions: {
  parse: ["everyone"],
},

  };
}

async function checkTwitchCreator(client, creator, store) {
  try {
    if (creator.alertsEnabled === false) {
      logger.info("Skipping creator because alerts are disabled", {
        creatorId: creator.discordUserId,
        creatorName: creator.displayName,
      });
      return;
    }

    const twitchUsername = getTwitchUsernameFromCreator(creator);

    if (!twitchUsername) {
      logger.info("Skipping creator because no Twitch username/link was found", {
        creatorId: creator.discordUserId,
        creatorName: creator.displayName,
      });
      return;
    }

    logger.info("Checking Twitch live status", {
      creatorId: creator.discordUserId,
      creatorName: creator.displayName,
      twitchUsername,
    });

    const stream = await twitchService.getLiveStream(twitchUsername);

    const alreadyLive = isAlreadyLive(store, creator.discordUserId, "twitch");

    if (!stream && alreadyLive) {
      clearLive(store, creator.discordUserId, "twitch");

      logger.info("Creator is no longer live", {
        creatorId: creator.discordUserId,
        creatorName: creator.displayName,
        platform: "twitch",
      });

      return;
    }

    if (!stream) {
      logger.info("Creator is not live", {
        creatorId: creator.discordUserId,
        creatorName: creator.displayName,
        twitchUsername,
      });
      return;
    }

    if (alreadyLive) {
      logger.info("Creator is live but alert already sent", {
        creatorId: creator.discordUserId,
        creatorName: creator.displayName,
        platform: "twitch",
      });
      return;
    }

    const channelId = process.env.STREAM_ALERT_CHANNEL_ID;

    if (!channelId) {
      logger.warn("STREAM_ALERT_CHANNEL_ID is missing from .env");
      return;
    }

    const channel = await client.channels.fetch(channelId).catch(() => null);

    if (!channel || !channel.isTextBased()) {
      logger.warn("Stream alert channel missing or invalid", {
        channelId,
      });
      return;
    }

    await channel.send(buildLiveMessage(creator, stream));

    markLive(store, {
      creatorId: creator.discordUserId,
      platform: "twitch",
      twitchUsername,
      streamId: stream.id,
      startedAt: new Date().toISOString(),
    });

    logger.info("Twitch live alert sent", {
      creatorId: creator.discordUserId,
      creatorName: creator.displayName,
      twitchUsername,
    });
  } catch (err) {
    logger.error("Failed checking Twitch creator", err, {
      creatorId: creator?.discordUserId,
      creatorName: creator?.displayName,
      location: "streamAlertService.js -> checkTwitchCreator",
    });
  }
}

async function scanCreators(client) {
  try {
    const creators = creatorStore.listCreators();

    logger.info("Stream alert scan started", {
      creatorCount: creators.length,
    });

    if (!creators.length) {
      return;
    }

    const store = readStore();

    for (const creator of creators) {
      await checkTwitchCreator(client, creator, store);
    }

    logger.info("Stream alert scan complete");
  } catch (err) {
    logger.error("Creator live scan failed", err, {
      location: "streamAlertService.js -> scanCreators",
    });
  }
}

module.exports = {
  scanCreators,
};