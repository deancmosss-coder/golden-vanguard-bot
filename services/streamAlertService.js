const fs = require("fs");
const path = require("path");

const logger = require("./logger");

const twitchService = require("./platformServices/twitchService");

const creatorStore = require("./creatorStore");

const ALERT_STORE_PATH = path.join(
  __dirname,
  "..",
  "data",
  "streamAlerts.json"
);

const STREAM_ALERT_CHANNEL_ID =
  process.env.STREAM_ALERT_CHANNEL_ID;

const LIVE_CREATOR_ROLE_ID =
  process.env.LIVE_CREATOR_ROLE_ID;

/* =========================
   STORE
========================= */

function defaultStore() {
  return {
    liveStreams: [],
  };
}

function readStore() {
  try {
    if (!fs.existsSync(ALERT_STORE_PATH)) {
      return defaultStore();
    }

    const raw = fs.readFileSync(
      ALERT_STORE_PATH,
      "utf8"
    );

    return JSON.parse(raw);
  } catch (err) {
    logger.error(
      "Failed to read stream alert store",
      err,
      {
        location:
          "streamAlertService.js -> readStore",
      }
    );

    return defaultStore();
  }
}

function writeStore(store) {
  try {
    fs.writeFileSync(
      ALERT_STORE_PATH,
      JSON.stringify(store, null, 2),
      "utf8"
    );
  } catch (err) {
    logger.error(
      "Failed to write stream alert store",
      err,
      {
        location:
          "streamAlertService.js -> writeStore",
      }
    );
  }
}

/* =========================
   HELPERS
========================= */

function isAlreadyLive(
  store,
  creatorId,
  platform
) {
  return store.liveStreams.some(
    (stream) =>
      stream.creatorId === creatorId &&
      stream.platform === platform
  );
}

function markLive(store, data) {
  store.liveStreams.push(data);
  writeStore(store);
}

function clearLive(
  store,
  creatorId,
  platform
) {
  store.liveStreams =
    store.liveStreams.filter(
      (stream) =>
        !(
          stream.creatorId === creatorId &&
          stream.platform === platform
        )
    );

  writeStore(store);
}

function findPlatformLink(
  creator,
  platformName
) {
  if (
    !Array.isArray(creator.platforms)
  ) {
    return null;
  }

  return (
    creator.platforms.find(
      (platform) =>
        String(
          platform.platform || ""
        ).toLowerCase() ===
        platformName.toLowerCase()
    ) || null
  );
}

function extractTwitchUsername(url) {
  if (!url) return null;

  try {
    const cleaned = String(url)
      .trim()
      .replace(/\/+$/, "");

    const match = cleaned.match(
      /twitch\.tv\/([^/?]+)/i
    );

    if (!match) {
      return null;
    }

    return match[1];
  } catch {
    return null;
  }
}

/* =========================
   ALERT EMBED
========================= */

function buildLiveMessage(
  creator,
  streamData
) {
  const title =
    streamData.title ||
    "LIVE NOW";

  const game =
    streamData.game_name ||
    "Streaming";

  const streamUrl =
    `https://twitch.tv/${streamData.user_login}`;

  return {
    content:
      LIVE_CREATOR_ROLE_ID
        ? `<@&${LIVE_CREATOR_ROLE_ID}>`
        : null,

    embeds: [
      {
        color: 0xf1c40f,

        title: `🔴 ${creator.displayName} is LIVE`,

        url: streamUrl,

        description: [
          `🎮 ${game}`,
          "",
          `**${title}**`,
          "",
          "━━━━━━━━━━━━━━━━━━",
          "",
          "🪖 Deploy into the stream and support the Vanguard creator network.",
        ].join("\n"),

        image: {
          url:
            streamData.thumbnail_url
              ?.replace(
                "{width}",
                "1280"
              )
              ?.replace(
                "{height}",
                "720"
              ) || null,
        },

        footer: {
          text:
            "The Golden Vanguard Creator Network",
        },

        timestamp:
          new Date().toISOString(),
      },
    ],

    allowedMentions:
      LIVE_CREATOR_ROLE_ID
        ? {
            roles: [
              LIVE_CREATOR_ROLE_ID,
            ],
          }
        : undefined,
  };
}

/* =========================
   TWITCH CHECK
========================= */

async function checkTwitchCreator(
  client,
  creator,
  store
) {
  try {
    if (
      creator.alertsEnabled === false
    ) {
      return;
    }

    const twitchPlatform =
      findPlatformLink(
        creator,
        "twitch"
      );

    if (!twitchPlatform?.url) {
      return;
    }

    const twitchUsername =
      extractTwitchUsername(
        twitchPlatform.url
      );

    if (!twitchUsername) {
      return;
    }

    const stream =
      await twitchService.getLiveStream(
        twitchUsername
      );

    const alreadyLive =
      isAlreadyLive(
        store,
        creator.discordUserId,
        "twitch"
      );

    if (!stream && alreadyLive) {
      clearLive(
        store,
        creator.discordUserId,
        "twitch"
      );

      logger.info(
        `${creator.displayName} is no longer live`
      );

      return;
    }

    if (!stream) {
      return;
    }

    if (alreadyLive) {
      return;
    }

    const channel =
      await client.channels
        .fetch(
          STREAM_ALERT_CHANNEL_ID
        )
        .catch(() => null);

    if (
      !channel ||
      !channel.isTextBased()
    ) {
      logger.warn(
        "Stream alert channel missing or invalid"
      );

      return;
    }

    await channel.send(
      buildLiveMessage(
        creator,
        stream
      )
    );

    markLive(store, {
      creatorId:
        creator.discordUserId,

      platform: "twitch",

      startedAt:
        new Date().toISOString(),
    });

    logger.info(
      `${creator.displayName} Twitch live alert sent`
    );
  } catch (err) {
    logger.error(
      "Failed checking Twitch creator",
      err,
      {
        creatorId:
          creator.discordUserId,

        location:
          "streamAlertService.js -> checkTwitchCreator",
      }
    );
  }
}

/* =========================
   MAIN SCAN
========================= */

async function scanCreators(client) {
  try {
    const creators =
      creatorStore.listCreators();

    if (!creators.length) {
      return;
    }

    const store = readStore();

    for (const creator of creators) {
      await checkTwitchCreator(
        client,
        creator,
        store
      );
    }
  } catch (err) {
    logger.error(
      "Creator live scan failed",
      err,
      {
        location:
          "streamAlertService.js -> scanCreators",
      }
    );
  }
}

/* =========================
   EXPORTS
========================= */

module.exports = {
  scanCreators,
};