// =========================
// services/askToPlayService.js
// Handles Ask-to-Play:
// - embeds
// - dropdowns
// - roster sync
// - VC resolve
// - VC rename
// =========================

const {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} = require("discord.js");

const logger = require("./logger");
const { sendErrorAlert } = require("./alertService");

const ASK_ROLE_ID = (process.env.PING_ROLE_ID || "").trim();

const MAX_SQUAD = 4;

const FACTION_SELECT_ID = "gv_faction";
const DIFFICULTY_SELECT_ID = "gv_difficulty";

const HUB_CATEGORY_ID = "1478464677783666778";

function factionToTag(faction) {
  if (!faction) return null;

  if (faction === "Automatons") return "BOTS";
  if (faction === "Terminids") return "BUGS";
  if (faction === "Illuminate") return "SQUIDS";
  if (faction === "Any / Flexible") return null;

  return null;
}

function safeUsername(user) {
  return (user?.username || "Host").replace(/[^\w\s-]/g, "").slice(0, 16);
}

function rosterText(roster) {
  if (!roster.size) return "_No one in VC yet._";

  return [...roster].map((id, i) => `${i + 1}. <@${id}>`).join("\n");
}

function buildAskEmbed(session, vcName) {
  return new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle("🎯 Ask-to-Play Alert")
    .setDescription(
      ASK_ROLE_ID
        ? `<@${session.ownerId}> pinged <@&${ASK_ROLE_ID}>`
        : `<@${session.ownerId}> is requesting backup!`
    )
    .addFields(
      {
        name: "Difficulty",
        value: session.difficulty || "Not specified",
        inline: true,
      },
      {
        name: "Faction",
        value: session.faction || "Not specified",
        inline: true,
      },
      {
        name: "Voice Channel",
        value: vcName || "Not currently in a voice channel.",
        inline: false,
      },
      {
        name: "Squad",
        value: `${session.roster.size}/${MAX_SQUAD}`,
        inline: true,
      },
      {
        name: "Roster",
        value: rosterText(session.roster),
        inline: false,
      }
    )
    .setFooter({ text: "The Golden Vanguard" })
    .setTimestamp();
}

function buildAskComponents(session) {
  const factionDone = !!session.faction;
  const difficultyDone = !!session.difficulty;

  if (factionDone && difficultyDone) return [];

  const factionMenu = new StringSelectMenuBuilder()
    .setCustomId(FACTION_SELECT_ID)
    .setPlaceholder(factionDone ? `Faction: ${session.faction}` : "Choose a faction…")
    .addOptions(
      { label: "Terminids", value: "Terminids" },
      { label: "Automatons", value: "Automatons" },
      { label: "Illuminate", value: "Illuminate" },
      { label: "Any / Flexible", value: "Any / Flexible" }
    );

  const difficultyMenu = new StringSelectMenuBuilder()
    .setCustomId(DIFFICULTY_SELECT_ID)
    .setPlaceholder(difficultyDone ? `Difficulty: ${session.difficulty}` : "Choose difficulty…")
    .addOptions(
      ...Array.from({ length: 10 }, (_, i) => {
        const v = String(i + 1);

        return {
          label: v,
          value: v,
        };
      })
    );

  return [
    new ActionRowBuilder().addComponents(factionMenu),
    new ActionRowBuilder().addComponents(difficultyMenu),
  ];
}

async function resolveHostVc(guild, ownerId) {
  const host = await guild.members.fetch(ownerId).catch(() => null);
  return host?.voice?.channel || null;
}

function syncRosterFromVc(session, vc) {
  const next = new Set();

  next.add(session.ownerId);

  if (vc) {
    const ids = [...vc.members.values()].map((m) => m.id);

    for (const id of ids) {
      if (id === session.ownerId) continue;
      if (next.size >= MAX_SQUAD) break;

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

  const textChannel = await guild.channels.fetch(session.textChannelId).catch(() => null);
  if (!textChannel?.isTextBased()) return;

  const msg = await textChannel.messages.fetch(session.messageId).catch(() => null);
  if (!msg) return;

  const vc = await resolveHostVc(guild, session.ownerId);
  const vcName = vc?.name || null;

  syncRosterFromVc(session, vc);

  await msg.edit({
    embeds: [buildAskEmbed(session, vcName)],
    components: buildAskComponents(session),
    allowedMentions: ASK_ROLE_ID ? { roles: [ASK_ROLE_ID], users: [] } : undefined,
  });
}

async function renameHostVcFromSession(client, session, guild) {
  const host = await guild.members.fetch(session.ownerId).catch(() => null);
  const vc = host?.voice?.channel;

  if (!vc) return;
  if (vc.parentId !== HUB_CATEGORY_ID) return;
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
    await vc.setName(desired, "Auto rename from Ask to Play difficulty selection");
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
  ASK_ROLE_ID,
  MAX_SQUAD,
  FACTION_SELECT_ID,
  DIFFICULTY_SELECT_ID,
  HUB_CATEGORY_ID,
  buildAskEmbed,
  buildAskComponents,
  resolveHostVc,
  syncRosterFromVc,
  updateAskMessage,
  renameHostVcFromSession,
};
