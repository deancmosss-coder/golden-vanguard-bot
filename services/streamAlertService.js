const fs = require("fs");
const path = require("path");

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

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
  fs.writeFileSync(ALERT_STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

function isAlreadyLive(store, creatorId, platform) {
  return store.liveStreams.some(
    (stream) => stream.creatorId === creatorId && stream.platform === platform
  );
}

function markLive(store, data) {
  if (!isAlreadyLive(store, data.creatorId, data.platform)) {
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

function getAllowedVcCategoryIds() {
  return String(process.env.STREAM_VC_CATEGORY_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

function isApprovedVanguardVc(vc) {
  if (!vc) return false;
  return getAllowedVcCategoryIds().includes(vc.parentId);
}

function extractTwitchUsername(value) {
  if (!value) return null;

  const text = String(value).trim();
  const urlMatch = text.match(/(?:https?:\/\/)?(?:www\.)?twitch\.tv\/([^/?\s]+)/i);

  if (urlMatch?.[1]) {
    return urlMatch[1].replace("@", "").trim();
  }

  return null;
}

function getTwitchUsernameFromCreator(creator) {
  if (!creator) return null;

  const platforms = Array.isArray(creator.platforms) ? creator.platforms : [];

  for (const item of platforms) {
    const username = extractTwitchUsername(item.url);

    if (username) {
      return username;
    }
  }

  return null;
}

async function getCreatorMember(client, creatorId) {
  for (const guild of client.guilds.cache.values()) {
    const member = await guild.members.fetch(creatorId).catch(() => null);

    if (member) {
      return member;
    }
  }

  return null;
}

async function getCreatorVc(client, creator) {
  for (const guild of client.guilds.cache.values()) {
    const member = await guild.members.fetch(creator.discordUserId).catch(() => null);

    if (!member?.voice?.channel) {
      continue;
    }

    const vc = member.voice.channel;

    if (!isApprovedVanguardVc(vc)) {
      continue;
    }

    return {
      guild,
      member,
      vc,
    };
  }

  return null;
}

async function addLiveRole(client, creatorId) {
  const roleId = process.env.LIVE_CREATOR_ROLE_ID;

  if (!roleId) {
    logger.warn("LIVE_CREATOR_ROLE_ID is missing from .env");
    return;
  }

  const member = await getCreatorMember(client, creatorId);

  if (!member) {
    logger.warn("Could not find member to add live role", {
      creatorId,
      roleId,
    });
    return;
  }

  if (member.roles.cache.has(roleId)) {
    return;
  }

  await member.roles.add(roleId).catch((err) => {
    logger.error("Failed to add live creator role", err, {
      memberId: member.id,
      roleId,
      location: "streamAlertService.js -> addLiveRole",
    });
  });
}

async function removeLiveRole(client, creatorId) {
  const roleId = process.env.LIVE_CREATOR_ROLE_ID;

  if (!roleId) {
    return;
  }

  const member = await getCreatorMember(client, creatorId);

  if (!member) {
    return;
  }

  if (!member.roles.cache.has(roleId)) {
    return;
  }

  await member.roles.remove(roleId).catch((err) => {
    logger.error("Failed to remove live creator role", err, {
      memberId: member.id,
      roleId,
      location: "streamAlertService.js -> removeLiveRole",
    });
  });
}

function buildLiveMessage(creator, streamData, vcData) {
  const streamUrl = `https://twitch.tv/${streamData.user_login}`;
  const vcText = vcData?.vc?.name || "Not currently in a Vanguard VC";

  return {
    content: "@everyone",

    embeds: [
      {
        color: 0xf1c40f,
        title: `🔴 ${creator.displayName} is LIVE`,
        url: streamUrl,
        description: [
          "## 🎙️ Vanguard Creator Live",
          "",
          `${creator.displayName} has deployed live.`,
          "",
          "🎮 **Game**",
          streamData.game_name || "Streaming",
          "",
          "🎤 **Voice Channel**",
          vcText,
          "",
          "━━━━━━━━━━━━━━━━━━",
          "",
          `**${streamData.title || "LIVE NOW"}**`,
          "",
          "🔥 Drop into the stream, support the creator, and join the operation.",
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

    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel("Watch Stream")
          .setStyle(ButtonStyle.Link)
          .setURL(streamUrl)
      ),
    ],

    allowedMentions: {
      parse: ["everyone"],
    },
  };
}

async function checkTwitchCreator(client, creator, store) {
  try {
    if (creator.alertsEnabled === false) {
      return;
    }

    const twitchUsername = getTwitchUsernameFromCreator(creator);

    if (!twitchUsername) {
      return;
    }

    const stream = await twitchService.getLiveStream(twitchUsername);

    const alreadyLive = isAlreadyLive(store, creator.discordUserId, "twitch");

    if (!stream && alreadyLive) {
      clearLive(store, creator.discordUserId, "twitch");

      await removeLiveRole(client, creator.discordUserId);

      logger.info("Creator is no longer live", {
        creatorId: creator.discordUserId,
        creatorName: creator.displayName,
      });

      return;
    }

    if (!stream) {
      return;
    }

    await addLiveRole(client, creator.discordUserId);

    const vcData = await getCreatorVc(client, creator);

    if (alreadyLive) {
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

    await channel.send(buildLiveMessage(creator, stream, vcData));

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

    if (!creators.length) {
      return;
    }

    const store = readStore();

    for (const creator of creators) {
      await checkTwitchCreator(client, creator, store);
    }
  } catch (err) {
    logger.error("Creator live scan failed", err, {
      location: "streamAlertService.js -> scanCreators",
    });
  }
}

module.exports = {
  scanCreators,
};