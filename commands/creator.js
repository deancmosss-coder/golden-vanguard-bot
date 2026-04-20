const {
  SlashCommandBuilder,
  EmbedBuilder,
} = require("discord.js");
const creatorStore = require("../services/creatorStore");
const {
  buildApplicationModal,
  hasApproverAccess,
} = require("../services/creatorApplication");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("creator")
    .setDescription("Creator system commands")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("apply")
        .setDescription("Apply for the creator system")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("profile")
        .setDescription("View a creator profile")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("The user to look up")
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
          ephemeral: true,
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
          ephemeral: true,
        });
      }

      const embed = new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle(`${creator.displayName || targetUser.username} • Creator Profile`)
        .setDescription(
          [
            `**User:** <@${creator.discordUserId}>`,
            "",
            "**Streaming Platforms**",
            creator.application?.platforms || "Not provided",
            "",
            "**Socials**",
            creator.application?.socials || "Not provided",
            "",
            `**Content**\n${creator.application?.contentType || "Not provided"}`,
            "",
            `**Schedule**\n${creator.application?.schedule || "Not provided"}`,
            "",
            `**Bio**\n${creator.application?.bio || "Not provided"}`,
          ].join("\n")
        )
        .setFooter({ text: "Golden Vanguard • Creator Profile" })
        .setTimestamp(new Date());

      return interaction.reply({ embeds: [embed], ephemeral: false });
    }

    if (subcommand === "list") {
      const creators = creatorStore.listCreators();

      if (!creators.length) {
        return interaction.reply({
          content: "There are no approved creators yet.",
          ephemeral: true,
        });
      }

      const lines = creators.slice(0, 25).map((creator, index) => {
        const content = creator.application?.contentType || "No content listed";
        return `${index + 1}. <@${creator.discordUserId}> — ${content}`;
      });

      const embed = new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle("Approved Creators")
        .setDescription(lines.join("\n"))
        .setFooter({
          text:
            creators.length > 25
              ? `Showing 25 of ${creators.length} creators`
              : `Total creators: ${creators.length}`,
        })
        .setTimestamp(new Date());

      return interaction.reply({ embeds: [embed], ephemeral: false });
    }

    if (subcommand === "approve") {
      if (!hasApproverAccess(interaction.member)) {
        return interaction.reply({
          content: "You do not have permission to approve creators.",
          ephemeral: true,
        });
      }

      const user = interaction.options.getUser("user", true);
      const result = creatorStore.approveApplication(user.id, interaction.user.id);

      if (!result.ok) {
        return interaction.reply({
          content: result.reason || "Could not approve that application.",
          ephemeral: true,
        });
      }

      const creatorRoleId = process.env.CREATOR_ROLE_ID;
      if (creatorRoleId && interaction.guild) {
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);
        if (member) {
          await member.roles.add(creatorRoleId).catch(() => null);
        }
      }

      await user.send(
        "Your Golden Vanguard creator application has been approved. Welcome to the creator system."
      ).catch(() => null);

      return interaction.reply({
        content: `Approved creator application for ${user}.`,
        ephemeral: false,
      });
    }

    if (subcommand === "deny") {
      if (!hasApproverAccess(interaction.member)) {
        return interaction.reply({
          content: "You do not have permission to deny creators.",
          ephemeral: true,
        });
      }

      const user = interaction.options.getUser("user", true);
      const result = creatorStore.denyApplication(user.id);

      if (!result.ok) {
        return interaction.reply({
          content: result.reason || "Could not deny that application.",
          ephemeral: true,
        });
      }

      await user.send(
        "Your Golden Vanguard creator application was not approved this time. You can reapply later."
      ).catch(() => null);

      return interaction.reply({
        content: `Denied creator application for ${user}.`,
        ephemeral: false,
      });
    }
  },
};