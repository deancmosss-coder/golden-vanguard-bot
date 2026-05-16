// =========================
// services/askToPlayService.js
// Multi-game Ask-to-Play:
// - game config detection
// - embeds
// - dropdowns
// - roster sync
// - VC resolve
// - VC validation
// - Helldivers VC rename support
// =========================

const fs = require("fs");
const path = require("path");

const {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} = require("discord.js");

const logger = require("./logger");
const { sendErrorAlert } = require("./alertService");

const CONFIG_PATH = path.join(
  __dirname,
  "../config/askToPlayGames.json"
);

const FACTION_SELECT_ID = "gv_faction";
const DIFFICULTY_SELECT_ID = "gv_difficulty";
const ACTIVITY_SELECT_ID = "gv_activity";

function loadGameConfigs() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) {
      return {};
    }

    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch (err) {
    logger.error("Failed to load askToPlayGames.json", err, {
      location: "services/askToPlayService.js -> loadGameConfigs",
    });

    return {};
  }
}

function getGameConfig(gameKey) {
  const configs = loadGameConfigs();
  return configs[gameKey] || null;
}

function findGameConfigByChannel(channel) {
  if (!channel) return null;

  const configs = loadGameConfigs();

  for (const [gameKey, config] of Object.entries(configs)) {
    const categoryMatches =
      !config.textCategoryId ||
      channel.parentId === config.textCategoryId;

    const channelMatches =
      Array.isArray(config.lfgChannelIds) &&
      config.lfgChannelIds.includes(channel.id);

    if (categoryMatches && channelMatches) {
      return {
        gameKey,
        ...config,
      };
    }
  }

  return null;
}

function getSessionConfig(session) {
  if (!session?.gameKey) return null;

  const config = getGameConfig(session.gameKey);

  if (!config) return null;

  return {
    gameKey: session.gameKey,
    ...config,
  };
}

function factionToTag(faction) {
  if (!faction) return null;

  if (faction === "Automatons") return "BOTS";
  if (faction === "Terminids") return "BUGS";
  if (faction === "Illuminate") return "SQUIDS";
  if (faction === "Any / Flexible") return null;

  return null;
}

function safeUsername(user) {
  return (user?.username || "Host")
    .replace(/[^\w\s-]/g, "")
    .slice(0, 16);
}

function rosterText(roster) {
  if (!roster?.size) return "_No one in VC yet._";

  return [...roster]
    .map((id, i) => `${i + 1}. <@${id}>`)
    .join("\n");
}

function isVcAllowedForGame(vc, config) {
  if (!vc || !config) return false;

  const allowedVoiceCategoryIds =
    Array.isArray(config.voiceCategoryIds)
      ? config.voiceCategoryIds
      : [];

  if (!allowedVoiceCategoryIds.length) return true;

  return allowedVoiceCategoryIds.includes(vc.parentId);
}

function getDisplayVcName(vc, config) {
  if (!vc) return "Not currently in a voice channel.";

  if (!isVcAllowedForGame(vc, config)) {
    return "Host is in a voice channel outside this game section.";
  }

  return vc.name;
}

function buildAskEmbed(session, vcName) {
  const config = getSessionConfig(session);
  const displayName = config?.displayName || "Game";
  const pingRoleId = config?.pingRoleId || null;
  const maxSquadSize = Number(config?.maxSquadSize || 4);

  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle(`🎯 ${displayName} Ask-to-Play`)
    .setDescription(
      pingRoleId
        ? `<@${session.ownerId}> pinged <@&${pingRoleId}>`
        : `<@${session.ownerId}> is requesting backup!`
    )
    .setFooter({ text: "The Golden Vanguard" })
    .setTimestamp();

  if (config?.fields?.difficulty) {
    embed.addFields({
      name: "Difficulty",
      value: session.difficulty || "Not specified",
      inline: true,
    });
  }

  if (config?.fields?.faction) {
    embed.addFields({
      name: "Faction",
      value: session.faction || "Not specified",
      inline: true,
    });
  }

  if (config?.fields?.activity) {
    embed.addFields({
      name: "Activity",
      value: session.activity || "Not specified",
      inline: true,
    });
  }

  embed.addFields(
    {
      name: "Voice Channel",
      value: vcName || "Not currently in a voice channel.",
      inline: false,
    },
    {
      name: "Group",
      value: `${session.roster.size}/${maxSquadSize}`,
      inline: true,
    },
    {
      name: "Roster",
      value: rosterText(session.roster),
      inline: false,
    }
  );

  return embed;
}

function buildAskComponents(session) {
  const config = getSessionConfig(session);

  if (!config) return [];

  const rows = [];

  if (config.fields?.faction && !session.faction) {
    const factionMenu = new StringSelectMenuBuilder()
      .setCustomId(FACTION_SELECT_ID)
      .setPlaceholder("Choose a faction…")
      .addOptions(
        { label: "Terminids", value: "Terminids" },
        { label: "Automatons", value: "Automatons" },
        { label: "Illuminate", value: "Illuminate" },
        { label: "Any / Flexible", value: "Any / Flexible" }
      );

    rows.push(new ActionRowBuilder().addComponents(factionMenu));
  }

  if (config.fields?.difficulty && !session.difficulty) {
    const difficultyMenu = new StringSelectMenuBuilder()
      .setCustomId(DIFFICULTY_SELECT_ID)
      .setPlaceholder("Choose difficulty…")
      .addOptions(
        ...Array.from({ length: 10 }, (_, i) => {
          const v = String(i + 1);

          return {
            label: v,
            value: v,
          };
        })
      );

    rows.push(new ActionRowBuilder().addComponents(difficultyMenu));
  }

  if (
    config.fields?.activity &&
    !session.activity &&
    Array.isArray(config.activities) &&
    config.activities.length
  ) {
    const activityMenu = new StringSelectMenuBuilder()
      .setCustomId(ACTIVITY_SELECT_ID)
      .setPlaceholder("Choose activity…")
      .addOptions(
        ...config.activities.slice(0, 25).map((activity) => ({
          label: activity,
          value: activity,
        }))
      );

    rows.push(new ActionRowBuilder().addComponents(activityMenu));
  }

  return rows;
}

async function resolveHostVc(guild, ownerId) {
  const host = await guild.members.fetch(ownerId).catch(() => null);
  return host?.voice?.channel || null;
}

function syncRosterFromVc(session, vc) {
  const config = getSessionConfig(session);
  const maxSquadSize = Number(config?.maxSquadSize || 4);

  const next = new Set();

  next.add(session.ownerId);

  if (vc && isVcAllowedForGame(vc, config)) {
    const ids = [...vc.members.values()].map((m) => m.id);

    for (const id of ids) {
      if (id === session.ownerId) continue;
      if (next.size >= maxSquadSize) break;

      next.add(id);
    }
  }

  const before = [...session.roster].sort().join(",");
  const after = [...next].sort().join(",");

  if (before === after) return false;

  session.roster = next;
  return true;
}

async function updateAskMessage(client, session) {
  const guild = await client.guilds.fetch(session.guildId).catch(() => null);
  if (!guild) return;

  const textChannel = await guild.channels
    .fetch(session.textChannelId)
    .catch(() => null);

  if (!textChannel?.isTextBased()) return;

  const msg = await textChannel.messages
    .fetch(session.messageId)
    .catch(() => null);

  if (!msg) return;

  const config = getSessionConfig(session);
  const vc = await resolveHostVc(guild, session.ownerId);
  const vcName = getDisplayVcName(vc, config);

  syncRosterFromVc(session, vc);

  await msg.edit({
    embeds: [buildAskEmbed(session, vcName)],
    components: buildAskComponents(session),
    allowedMentions: config?.pingRoleId
      ? { roles: [config.pingRoleId], users: [] }
      : undefined,
  });
}

async function renameHostVcFromSession(client, session, guild) {
  const config = getSessionConfig(session);

  if (!config) return;

  // Only Helldivers currently uses difficulty-based VC rename.
  if (session.gameKey !== "helldivers") return;

  const host = await guild.members.fetch(session.ownerId).catch(() => null);
  const vc = host?.voice?.channel;

  if (!vc) return;
  if (!isVcAllowedForGame(vc, config)) return;
  if (!session.difficulty) return;

  const chosenTag = factionToTag(session.faction);

  let tag = chosenTag;

  if (!tag) {
    const match = vc.name.match(/^(MO|BOTS|BUGS|SQUIDS|DANGER)\s\|/i);
    tag = match ? match[1].toUpperCase() : null;
  }

  if (!tag) return;

  const hostName = safeUsername(host.user);
  const desired = `${tag} | D${session.difficulty} | ${hostName}`;

  if (vc.name === desired) return;

  try {
    await vc.setName(
      desired,
      "Auto rename from Ask to Play difficulty selection"
    );
  } catch (err) {
    logger.error("VC rename failed", err, {
      location: "services/askToPlayService.js -> renameHostVcFromSession",
      channelId: vc.id,
      desiredName: desired,
    });

    await sendErrorAlert(client, "VC Rename Failed", err, {
      feature: "askToPlay",
      location: "renameHostVcFromSession",
      action: "Renaming host voice channel",
      likelyCause: "Missing permission or invalid channel state.",
      severity: "warning",
    });
  }
}

module.exports = {
  FACTION_SELECT_ID,
  DIFFICULTY_SELECT_ID,
  ACTIVITY_SELECT_ID,
  loadGameConfigs,
  getGameConfig,
  findGameConfigByChannel,
  getSessionConfig,
  isVcAllowedForGame,
  getDisplayVcName,
  buildAskEmbed,
  buildAskComponents,
  resolveHostVc,
  syncRosterFromVc,
  updateAskMessage,
  renameHostVcFromSession,
};
