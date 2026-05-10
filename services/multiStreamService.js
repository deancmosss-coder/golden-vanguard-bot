const fs = require("fs");
const path = require("path");

const logger = require("./logger");
const creatorStore = require("./creatorStore");

const MULTISTREAM_STORE_PATH = path.join(
  __dirname,
  "..",
  "data",
  "multistreams.json"
);

const STREAM_ALERT_STORE_PATH = path.join(
  __dirname,
  "..",
  "data",
  "streamAlerts.json"
);

function defaultStore() {
  return {
    activeMultiStreams: [],
  };
}

function ensureStoreFile() {
  const dir = path.dirname(MULTISTREAM_STORE_PATH);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(MULTISTREAM_STORE_PATH)) {
    fs.writeFileSync(
      MULTISTREAM_STORE_PATH,
      JSON.stringify(defaultStore(), null, 2),
      "utf8"
    );
  }
}

function readStore() {
  ensureStoreFile();

  try {
    const raw = fs.readFileSync(MULTISTREAM_STORE_PATH, "utf8");
    const parsed = JSON.parse(raw);

    return {
      activeMultiStreams: Array.isArray(parsed.activeMultiStreams)
        ? parsed.activeMultiStreams
        : [],
    };
  } catch (err) {
    logger.error("Failed to read multistream store", err, {
      location: "multiStreamService.js -> readStore",
    });

    return defaultStore();
  }
}

function writeStore(store) {
  ensureStoreFile();

  fs.writeFileSync(
    MULTISTREAM_STORE_PATH,
    JSON.stringify(store, null, 2),
    "utf8"
  );
}

function readStreamAlertStore() {
  try {
    if (!fs.existsSync(STREAM_ALERT_STORE_PATH)) {
      return {
        liveStreams: [],
      };
    }

    const raw = fs.readFileSync(STREAM_ALERT_STORE_PATH, "utf8");
    const parsed = JSON.parse(raw);

    return {
      liveStreams: Array.isArray(parsed.liveStreams) ? parsed.liveStreams : [],
    };
  } catch (err) {
    logger.error("Failed to read stream alert store for multistreams", err, {
      location: "multiStreamService.js -> readStreamAlertStore",
    });

    return {
      liveStreams: [],
    };
  }
}

function getAllowedVcCategoryIds() {
  return String(process.env.STREAM_VC_CATEGORY_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

function getCreatorById(creators, discordUserId) {
  return creators.find((creator) => creator.discordUserId === discordUserId) || null;
}

function isApprovedVanguardVc(voiceChannel) {
  if (!voiceChannel) return false;

  const allowedCategoryIds = getAllowedVcCategoryIds();

  if (!allowedCategoryIds.length) {
    return false;
  }

  return allowedCategoryIds.includes(voiceChannel.parentId);
}

function buildMultiStreamKey(vcId, creatorIds) {
  const sortedIds = [...creatorIds].sort();
  return `${vcId}:${sortedIds.join(",")}`;
}

function hasActiveAlert(store, key) {
  return store.activeMultiStreams.some((entry) => entry.key === key);
}

function markActiveAlert(store, data) {
  if (hasActiveAlert(store, data.key)) {
    return;
  }

  store.activeMultiStreams.push(data);
  writeStore(store);
}

function clearInactiveAlerts(store, activeKeys) {
  store.activeMultiStreams = store.activeMultiStreams.filter((entry) =>
    activeKeys.has(entry.key)
  );

  writeStore(store);
}

function buildMultiTwitchUrl(twitchUsernames) {
  const safeNames = twitchUsernames
    .map((name) => String(name || "").trim())
    .filter(Boolean);

  if (safeNames.length < 2) {
    return null;
  }

  return `https://multitwitch.tv/${safeNames.join("/")}`;
}

function formatCreatorNames(creators) {
  if (creators.length === 2) {
    return `**${creators[0].displayName}** and **${creators[1].displayName}**`;
  }

  const names = creators.map((creator) => `**${creator.displayName}**`);

  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function buildMultiStreamMessage({ creators, vcName, multitwitchUrl }) {
  const creatorText = formatCreatorNames(creators);

  return {
    content: "@everyone",
    embeds: [
      {
        color: 0xf1c40f,
        title: "🚨 VANGUARD MULTI-STREAM LIVE 🚨",
        description: [
          "## 🎙️ Joint Operation Detected",
          "",
          `${creatorText} are now live together inside **Operations Command**.`,
          "",
          "🎮 **Game**",
          creators[0]?.contentType || "Streaming",
          "",
          "🎤 **Voice Channel**",
          vcName || "Vanguard Voice Channel",
          "",
          "👀 **Watch All Perspectives Live**",
          multitwitchUrl,
          "",
          "━━━━━━━━━━━━━━━━━━",
          "",
          "🔥 Drop into the streams, show support, and join the operation live.",
          "",
          "Whether you are here for the chaos, teamwork, cinematic moments, or pure Vanguard madness — this is the place to be.",
          "",
          "Support the Vanguard Creator Network and help push the community forward.",
        ].join("\n"),
        footer: {
          text: "The Golden Vanguard • Multi-Stream Operation",
        },
        timestamp: new Date().toISOString(),
      },
    ],
    allowedMentions: {
      parse: ["everyone"],
    },
  };
}

async function getLiveCreatorsWithVc(client) {
  const creators = creatorStore.listCreators();
  const streamAlertStore = readStreamAlertStore();
  const liveStreams = streamAlertStore.liveStreams;

  const results = [];

  for (const liveStream of liveStreams) {
    if (liveStream.platform !== "twitch") {
      continue;
    }

    const creator = getCreatorById(creators, liveStream.creatorId);

    if (!creator) {
      continue;
    }

    if (creator.alertsEnabled === false) {
      continue;
    }

    for (const guild of client.guilds.cache.values()) {
      const member = await guild.members.fetch(creator.discordUserId).catch(() => null);

      if (!member?.voice?.channel) {
        continue;
      }

      const vc = member.voice.channel;

      if (!isApprovedVanguardVc(vc)) {
        continue;
      }

      results.push({
        creator,
        liveStream,
        guild,
        vc,
        twitchUsername: liveStream.twitchUsername,
      });

      break;
    }
  }

  return results;
}

function groupLiveCreatorsByVc(liveCreators) {
  const groups = new Map();

  for (const item of liveCreators) {
    const key = `${item.guild.id}:${item.vc.id}`;

    if (!groups.has(key)) {
      groups.set(key, {
        guild: item.guild,
        vc: item.vc,
        items: [],
      });
    }

    groups.get(key).items.push(item);
  }

  return [...groups.values()];
}

async function scanMultiStreams(client) {
  try {
    const channelId = process.env.MULTISTREAM_ALERT_CHANNEL_ID;

    if (!channelId) {
      logger.warn("MULTISTREAM_ALERT_CHANNEL_ID is missing from .env");
      return;
    }

    const alertChannel = await client.channels.fetch(channelId).catch(() => null);

    if (!alertChannel || !alertChannel.isTextBased()) {
      logger.warn("Multistream alert channel missing or invalid", {
        channelId,
      });
      return;
    }

    const store = readStore();
    const liveCreators = await getLiveCreatorsWithVc(client);
    const groups = groupLiveCreatorsByVc(liveCreators);
    const activeKeys = new Set();

    for (const group of groups) {
      if (group.items.length < 2) {
        continue;
      }

      const creatorIds = group.items.map((item) => item.creator.discordUserId);
      const key = buildMultiStreamKey(group.vc.id, creatorIds);
      activeKeys.add(key);

      if (hasActiveAlert(store, key)) {
        continue;
      }

      const twitchUsernames = group.items
        .map((item) => item.twitchUsername)
        .filter(Boolean);

      const multitwitchUrl = buildMultiTwitchUrl(twitchUsernames);

      if (!multitwitchUrl) {
        continue;
      }

      const creators = group.items.map((item) => item.creator);

      await alertChannel.send(
        buildMultiStreamMessage({
          creators,
          vcName: group.vc.name,
          multitwitchUrl,
        })
      );

      markActiveAlert(store, {
        key,
        vcId: group.vc.id,
        vcName: group.vc.name,
        creatorIds,
        twitchUsernames,
        multitwitchUrl,
        announcedAt: new Date().toISOString(),
      });

      logger.info("Multistream alert sent", {
        vcId: group.vc.id,
        vcName: group.vc.name,
        creatorCount: creators.length,
        multitwitchUrl,
      });
    }

    clearInactiveAlerts(store, activeKeys);
  } catch (err) {
    logger.error("Multistream scan failed", err, {
      location: "multiStreamService.js -> scanMultiStreams",
    });
  }
}

module.exports = {
  scanMultiStreams,
};
