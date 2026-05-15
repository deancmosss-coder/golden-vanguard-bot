// =========================
// commands/review.js
// Player Review / Commendation Command
// =========================

const {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");

const reviewSystem = require("../services/playerReviewSystem");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("review")
    .setDescription("Submit a player commendation review.")
    .addUserOption((option) =>
      option
        .setName("player")
        .setDescription("The player you want to review.")
        .setRequired(true)
    ),

  async execute(interaction) {
    const reviewedUser = interaction.options.getUser("player");

    if (!reviewedUser) {
      return interaction.reply({
        content: "Could not find that player.",
        ephemeral: true,
      });
    }

    if (reviewedUser.bot) {
      return interaction.reply({
        content: "You cannot review a bot.",
        ephemeral: true,
      });
    }

    if (reviewedUser.id === interaction.user.id) {
      return interaction.reply({
        content: "You cannot review yourself.",
        ephemeral: true,
      });
    }

    const cooldownCheck = reviewSystem.checkCooldown(
      interaction.user.id,
      reviewedUser.id
    );

    if (!cooldownCheck.allowed) {
      return interaction.reply({
        content: `You have already reviewed this player recently. Try again later.`,
        ephemeral: true,
      });
    }

    const customId = `review_game_select:${reviewedUser.id}`;

    const gameRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(customId)
        .setPlaceholder("Select the game this review relates to")
        .addOptions(reviewSystem.getGameSelectOptions())
    );

    return interaction.reply({
      content: `Select the game this review is for:`,
      components: [gameRow],
      ephemeral: true,
    });
  },

  async handleInteraction(interaction) {
    if (interaction.isStringSelectMenu()) {
      if (!interaction.customId.startsWith("review_game_select:")) return false;

      const reviewedUserId = interaction.customId.split(":")[1];
      const gameId = interaction.values[0];

      const modal = new ModalBuilder()
        .setCustomId(`review_modal:${reviewedUserId}:${gameId}`)
        .setTitle("Player Commendation");

      const ratingInput = new TextInputBuilder()
        .setCustomId("rating")
        .setLabel("Combat Rating 1-5")
        .setPlaceholder("Enter a number from 1 to 5")
        .setStyle(TextInputStyle.Short)
        .setMinLength(1)
        .setMaxLength(1)
        .setRequired(true);

      const anonymousInput = new TextInputBuilder()
        .setCustomId("anonymous")
        .setLabel("Post anonymously? yes/no")
        .setPlaceholder("yes or no")
        .setStyle(TextInputStyle.Short)
        .setMinLength(2)
        .setMaxLength(3)
        .setRequired(true);

      const promotionInput = new TextInputBuilder()
        .setCustomId("promotion")
        .setLabel("Support promotion review? yes/not yet/no opinion")
        .setPlaceholder("yes, not yet, or no opinion")
        .setStyle(TextInputStyle.Short)
        .setMinLength(2)
        .setMaxLength(20)
        .setRequired(true);

      const reviewInput = new TextInputBuilder()
        .setCustomId("review")
        .setLabel("Field Report")
        .setPlaceholder(
          "Write what this player did well, how they helped, or why they deserve recognition."
        )
        .setStyle(TextInputStyle.Paragraph)
        .setMinLength(20)
        .setMaxLength(500)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(ratingInput),
        new ActionRowBuilder().addComponents(anonymousInput),
        new ActionRowBuilder().addComponents(promotionInput),
        new ActionRowBuilder().addComponents(reviewInput)
      );

      await interaction.showModal(modal);
      return true;
    }

    if (interaction.isModalSubmit()) {
      if (!interaction.customId.startsWith("review_modal:")) return false;

      await reviewSystem.handleReviewModal(interaction);
      return true;
    }

    return false;
  },
};