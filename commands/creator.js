const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

const fs = require("fs");
const path = require("path");

const creatorStore = require("../services/creatorStore");
const {
  buildApplicationModal,
  hasApproverAccess,
} = require("../services/creatorApplication");

const STREAM_ALERTS_PATH = path.join(
  __dirname,
  "..",
  "data",
  "streamAlerts.json"
);

const MULTISTREAMS_PATH = path.join(
  __dirname,
  "..",
  "data",
  "multistreams.json"
);

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) {
      return fallback;
    }

    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function getLiveStreams() {
  const data = readJson(STREAM_ALERTS_PATH, {
    liveStreams: [],
  });

  return Array.isArray(data.liveStreams) ? data.liveStreams : [];
}

function getMultiStreams() {
  const data = readJson(MULTISTREAMS_PATH, {
    activeMultiStreams: [],
  });

  return Array.isArray(data.activeMultiStreams)
    ? data.activeMultiStreams
    : [];
}

function buildTwitchUrl(username) {
  return `https://twitch.tv/${username}`;
}

function buildMultiStreamUrl(usernames) {
  return `https://multitwitch.tv/${usernames.join("/")}`;
}

function formatLinkList(items, fallbackText) {
  if (!Array.isArray(items) || !items.length) {
    return fallbackText || "Not provided";
  }

  return items
    .map((item) => {
      const label = item.label || item.platform || "Link";
      const url = item.url || "Not provided";
      return `**${label}:** ${url}`;
    })
    .join("\n");
}

function buildCreatorProfileEmbed(user, creator) {
  return new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle(`🎥 ${creator.displayName || user.username} • Creator Profile`)
    .setDescription(
      [
        `**Creator:** <@${creator.discordUserId}>`,
        "",
        "**Alerts Enabled**",
        creator.alertsEnabled ? "Yes" : "No",
        "",
        "━━━━━━━━━━━━━━━━━━",
        "",
        "**Streaming Platforms**",
        formatLinkList(creator.platforms, creator.platformsRaw),
        "",
        "**Socials**",
        formatLinkList(creator.socials, creator.socialsRaw),
        "",
        "**Content Type**",
        creator.contentType || "Not provided",
        "",
        "**Schedule**",
        creator.schedule || "Not provided",
        "",
        "**Bio**",
        creator.bio || "Not provided",
      ].join("\n")
    )
    .setFooter({
      text: "Golden Vanguard • Creator Network",
    })
    .setTimestamp(new Date());
}

async function findMemberVoice(client, creatorId) {
  for (const guild of client.guilds.cache.values()) {
    const member = await guild.members.fetch(creatorId).catch(() => null);

    if (!member?.voice?.channel) {
      continue;
    }

    return member.voice.channel.name;
  }

  return null;
}

function getUsernamesFromMultiStream(multi) {
  if (Array.isArray(multi.twitchUsernames)) {
    return multi.twitchUsernames;
  }

  if (Array.isArray(multi.streamers)) {
    return multi.streamers;
  }

  return [];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("creator")
    .setDescription("Creator Network commands")

    .addSubcommand((subcommand) =>
      subcommand
        .setName("apply")
        .setDescription("Apply to become a creator")
    )

    .addSubcommand((subcommand) =>
      subcommand
        .setName("edit")
        .setDescription("Edit your creator profile")
    )

    .addSubcommand((subcommand) =>
      subcommand
        .setName("remove")
        .setDescription("Leave the creator network")
    )

    .addSubcommandGroup((group) =>
      group
        .setName("alerts")
        .setDescription("Creator alert settings")
        .addSubcommand((subcommand) =>
          subcommand
            .setName("on")
            .setDescription("Enable live alerts")
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("off")
            .setDescription("Disable live alerts")
        )
    )

    .addSubcommand((subcommand) =>
      subcommand
        .setName("profile")
        .setDescription("View a creator profile")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("Creator to view")
            .setRequired(false)
        )
    )

    .addSubcommand((subcommand) =>
      subcommand
        .setName("live")
        .setDescription("View all live Vanguard creators")
    )

    .addSubcommand((subcommand) =>
      subcommand
        .setName("list")
        .setDescription("List approved creators")
    )

    .addSubcommand((subcommand) =>
      subcommand
        .setName("pending")
        .setDescription("List pending creator applications")
    )

    .addSubcommand((subcommand) =>
      subcommand
        .setName("approve")
        .setDescription("Approve creator application")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("User to approve")
            .setRequired(true)
        )
    )

    .addSubcommand((subcommand) =>
      subcommand
        .setName("deny")
        .setDescription("Deny creator application")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("User to deny")
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    const group = interaction.options.getSubcommandGroup(false);
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "apply") {
      const existingCreator = creatorStore.getCreatorByUserId(
        interaction.user.id
      );

      if (existingCreator) {
        return interaction.reply({
          content:
            "You are already an approved creator. Use `/creator edit` instead.",
          flags: 64,
        });
      }

      const existingPending = creatorStore.getPendingApplicationByUserId(
        interaction.user.id
      );

      const modal = buildApplicationModal(existingPending || null);

      return interaction.showModal(modal);
    }

    if (subcommand === "edit") {
      const creator = creatorStore.getCreatorByUserId(interaction.user.id);

      if (!creator) {
        return interaction.reply({
          content: "You are not an approved creator.",
          flags: 64,
        });
      }

      const modal = buildApplicationModal(creator);

      return interaction.showModal(modal);
    }

    if (subcommand === "remove") {
      const result = creatorStore.removeCreator(interaction.user.id);

      if (!result.ok) {
        return interaction.reply({
          content: result.reason || "Could not remove creator.",
          flags: 64,
        });
      }

      const creatorRoleId = process.env.CREATOR_ROLE_ID;

      if (creatorRoleId && interaction.guild) {
        const member = await interaction.guild.members
          .fetch(interaction.user.id)
          .catch(() => null);

        if (member) {
          await member.roles.remove(creatorRoleId).catch(() => null);
        }
      }

      return interaction.reply({
        content: "You have left the Creator Network.",
        flags: 64,
      });
    }

    if (group === "alerts") {
      const creator = creatorStore.getCreatorByUserId(interaction.user.id);

      if (!creator) {
        return interaction.reply({
          content: "You are not an approved creator.",
          flags: 64,
        });
      }

      const enabled = subcommand === "on";

      creatorStore.setCreatorAlerts(interaction.user.id, enabled);

      return interaction.reply({
        content: enabled
          ? "Creator alerts enabled."
          : "Creator alerts disabled.",
        flags: 64,
      });
    }

    if (subcommand === "profile") {
      const targetUser = interaction.options.getUser("user") || interaction.user;
      const creator = creatorStore.getCreatorByUserId(targetUser.id);

      if (!creator) {
        return interaction.reply({
          content: "That user is not an approved creator.",
          flags: 64,
        });
      }

      const embed = buildCreatorProfileEmbed(targetUser, creator);

      return interaction.reply({
        embeds: [embed],
      });
    }

    if (subcommand === "live") {
      const liveStreams = getLiveStreams();

      if (!liveStreams.length) {
        return interaction.reply({
          content: "No Vanguard creators are currently live.",
          flags: 64,
        });
      }

      const multiStreams = getMultiStreams();

      const embed = new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle("🔴 Vanguard Creator Network")
        .setDescription("Currently live Vanguard creators.")
        .setFooter({
          text: "The Golden Vanguard",
        })
        .setTimestamp();

      const rows = [];

      for (const stream of liveStreams) {
        const creator = creatorStore.getCreatorByUserId(stream.creatorId);

        if (!creator) {
          continue;
        }

        const vcName = await findMemberVoice(
          interaction.client,
          stream.creatorId
        );

        embed.addFields({
          name: `🎥 ${creator.displayName}`,
          value: [
            "**Platform:** Twitch",
            `**Channel:** ${stream.twitchUsername}`,
            `**Voice Channel:** ${vcName || "Not in VC"}`,
          ].join("\n"),
          inline: false,
        });

        if (stream.twitchUsername && rows.length < 5) {
          rows.push(
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setLabel(`Watch ${creator.displayName}`.slice(0, 80))
                .setStyle(ButtonStyle.Link)
                .setURL(buildTwitchUrl(stream.twitchUsername))
            )
          );
        }
      }

      for (const multi of multiStreams) {
        const usernames = getUsernamesFromMultiStream(multi);

        if (usernames.length < 2 || rows.length >= 5) {
          continue;
        }

        const url = multi.multitwitchUrl || buildMultiStreamUrl(usernames);

        rows.push(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setLabel(`Watch Multi-Stream (${usernames.length})`)
              .setStyle(ButtonStyle.Link)
              .setURL(url)
          )
        );
      }

      return interaction.reply({
        embeds: [embed],
        components: rows,
      });
    }

    if (subcommand === "list") {
      const creators = creatorStore.listCreators();

      if (!creators.length) {
        return interaction.reply({
          content: "There are no approved creators yet.",
          flags: 64,
        });
      }

      const lines = creators.slice(0, 25).map((creator, index) => {
        const content = creator.contentType || "No content listed";
        return `${index + 1}. <@${creator.discordUserId}> — ${content}`;
      });

      const embed = new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle("🎥 Approved Creators")
        .setDescription(lines.join("\n"))
        .setFooter({
          text:
            creators.length > 25
              ? `Showing 25 of ${creators.length} creators`
              : `Total creators: ${creators.length}`,
        })
        .setTimestamp(new Date());

      return interaction.reply({
        embeds: [embed],
      });
    }

    if (subcommand === "pending") {
      if (!hasApproverAccess(interaction.member)) {
        return interaction.reply({
          content: "You do not have permission.",
          flags: 64,
        });
      }

      const pending = creatorStore.listPendingApplications();

      if (!pending.length) {
        return interaction.reply({
          content: "There are no pending creator applications.",
          flags: 64,
        });
      }

      const lines = pending.slice(0, 25).map((application, index) => {
        return `${index + 1}. <@${application.discordUserId}> — ${
          application.contentType || "No content listed"
        }`;
      });

      const embed = new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle("📝 Pending Creator Applications")
        .setDescription(lines.join("\n"))
        .setTimestamp(new Date());

      return interaction.reply({
        embeds: [embed],
        flags: 64,
      });
    }

    if (subcommand === "approve") {
      if (!hasApproverAccess(interaction.member)) {
        return interaction.reply({
          content: "You do not have permission.",
          flags: 64,
        });
      }

      const user = interaction.options.getUser("user", true);

      const result = creatorStore.approveApplication(user.id, interaction.user.id);

      if (!result.ok) {
        return interaction.reply({
          content: result.reason || "Could not approve application.",
          flags: 64,
        });
      }

      const creatorRoleId = process.env.CREATOR_ROLE_ID;

      if (creatorRoleId && interaction.guild) {
        const member = await interaction.guild.members
          .fetch(user.id)
          .catch(() => null);

        if (member) {
          await member.roles.add(creatorRoleId).catch(() => null);
        }
      }

      return interaction.reply({
        content: `Approved ${user}.`,
      });
    }

    if (subcommand === "deny") {
      if (!hasApproverAccess(interaction.member)) {
        return interaction.reply({
          content: "You do not have permission.",
          flags: 64,
        });
      }

      const user = interaction.options.getUser("user", true);

      const result = creatorStore.denyApplication(user.id);

      if (!result.ok) {
        return interaction.reply({
          content: result.reason || "Could not deny application.",
          flags: 64,
        });
      }

      return interaction.reply({
        content: `Denied ${user}.`,
      });
    }

    return interaction.reply({
      content: "Unknown creator command.",
      flags: 64,
    });
  },
};
