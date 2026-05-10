const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

const creatorStore = require("../services/creatorStore");
const {
  buildApplicationModal,
  hasApproverAccess,
} = require("../services/creatorApplication");

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
    .setFooter({ text: "Golden Vanguard • Creator Network" })
    .setTimestamp(new Date());
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("creator")
    .setDescription("Creator Network commands")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("apply")
        .setDescription("Apply to become an approved creator")
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
        .setDescription("Approve a pending creator application")
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
        .setDescription("Deny a pending creator application")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("User to deny")
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "apply") {
      const existingCreator = creatorStore.getCreatorByUserId(interaction.user.id);

      if (existingCreator) {
        return interaction.reply({
          content: "You are already an approved creator.",
          flags: 64,
        });
      }

      const existingPending = creatorStore.getPendingApplicationByUserId(interaction.user.id);
      const modal = buildApplicationModal(existingPending || null);

      return interaction.showModal(modal);
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
          content: "You do not have permission to view pending applications.",
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
        .setFooter({
          text:
            pending.length > 25
              ? `Showing 25 of ${pending.length} applications`
              : `Total pending: ${pending.length}`,
        })
        .setTimestamp(new Date());

      return interaction.reply({
        embeds: [embed],
        flags: 64,
      });
    }

    if (subcommand === "approve") {
      if (!hasApproverAccess(interaction.member)) {
        return interaction.reply({
          content: "You do not have permission to approve creators.",
          flags: 64,
        });
      }

      const user = interaction.options.getUser("user", true);
      const result = creatorStore.approveApplication(user.id, interaction.user.id);

      if (!result.ok) {
        return interaction.reply({
          content: result.reason || "Could not approve that creator application.",
          flags: 64,
        });
      }

      const creatorRoleId = process.env.CREATOR_ROLE_ID;

      if (creatorRoleId && interaction.guild) {
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);

        if (member) {
          await member.roles.add(creatorRoleId).catch(() => null);
        }
      }

      await user
        .send(
          "Your Golden Vanguard creator application has been approved. Welcome to the Creator Network."
        )
        .catch(() => null);

      return interaction.reply({
        content: `Approved creator application for ${user}.`,
      });
    }

    if (subcommand === "deny") {
      if (!hasApproverAccess(interaction.member)) {
        return interaction.reply({
          content: "You do not have permission to deny creators.",
          flags: 64,
        });
      }

      const user = interaction.options.getUser("user", true);
      const result = creatorStore.denyApplication(user.id);

      if (!result.ok) {
        return interaction.reply({
          content: result.reason || "Could not deny that creator application.",
          flags: 64,
        });
      }

      await user
        .send(
          "Your Golden Vanguard creator application was not approved this time. You can reapply later."
        )
        .catch(() => null);

      return interaction.reply({
        content: `Denied creator application for ${user}.`,
      });
    }

    return interaction.reply({
      content: "Unknown creator command.",
      flags: 64,
    });
  },
};
