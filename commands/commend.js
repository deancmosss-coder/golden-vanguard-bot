const {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");

const commendSystem = require("../services/playerReviewSystem");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("commend")
    .setDescription("Submit a player commendation.")
    .addUserOption((option) =>
      option
        .setName("player")
        .setDescription("The player you want to commend.")
        .setRequired(true)
    ),

  async execute(interaction) {
    const reviewedUser = interaction.options.getUser("player");

    if (!reviewedUser) {
      return interaction.reply({
        content: "Player not found.",
        ephemeral: true,
      });
    }

    if (reviewedUser.bot) {
      return interaction.reply({
        content: "You cannot commend a bot.",
        ephemeral: true,
      });
    }

    if (reviewedUser.id === interaction.user.id) {
      return interaction.reply({
        content: "You cannot commend yourself.",
        ephemeral: true,
      });
    }

    const cooldown = commendSystem.checkCooldown(
      interaction.user.id,
      reviewedUser.id
    );

    if (!cooldown.allowed) {
      return interaction.reply({
        content:
          "You have already commended this player recently.",
        ephemeral: true,
      });
    }

    const gameMenu =
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(
            `commend_game:${reviewedUser.id}`
          )
          .setPlaceholder(
            "Select operation front"
          )
          .addOptions(
            commendSystem.getGameSelectOptions()
          )
      );

    return interaction.reply({
      content:
        "Select the game this commendation relates to.",
      components: [gameMenu],
      ephemeral: true,
    });
  },

  async handleInteraction(interaction) {
    // =========================
    // GAME SELECT
    // =========================

    if (interaction.isStringSelectMenu()) {
      if (
        !interaction.customId.startsWith(
          "commend_game:"
        )
      ) {
        return false;
      }

      const reviewedUserId =
        interaction.customId.split(":")[1];

      const gameId =
        interaction.values[0];

      const modal =
        new ModalBuilder()
          .setCustomId(
            `commend_modal:${reviewedUserId}:${gameId}`
          )
          .setTitle(
            "Player Commendation"
          );

      const ratingInput =
        new TextInputBuilder()
          .setCustomId("rating")
          .setLabel(
            "Combat Rating (1-5)"
          )
          .setPlaceholder("1-5")
          .setStyle(
            TextInputStyle.Short
          )
          .setRequired(true);

      const anonymousInput =
        new TextInputBuilder()
          .setCustomId("anonymous")
          .setLabel(
            "Anonymous? yes/no"
          )
          .setPlaceholder("yes or no")
          .setStyle(
            TextInputStyle.Short
          )
          .setRequired(true);

      const promotionInput =
        new TextInputBuilder()
          .setCustomId("promotion")
          .setLabel(
            "Promotion Support"
          )
          .setPlaceholder(
            "yes / not yet / no opinion"
          )
          .setStyle(
            TextInputStyle.Short
          )
          .setRequired(true);

      const reviewInput =
        new TextInputBuilder()
          .setCustomId("review")
          .setLabel(
            "Field Report"
          )
          .setPlaceholder(
            "Write your commendation..."
          )
          .setStyle(
            TextInputStyle.Paragraph
          )
          .setRequired(true)
          .setMaxLength(500);

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          ratingInput
        ),
        new ActionRowBuilder().addComponents(
          anonymousInput
        ),
        new ActionRowBuilder().addComponents(
          promotionInput
        ),
        new ActionRowBuilder().addComponents(
          reviewInput
        )
      );

      await interaction.showModal(modal);

      return true;
    }

    // =========================
    // MODAL SUBMIT
    // =========================

    if (interaction.isModalSubmit()) {
      if (
        !interaction.customId.startsWith(
          "commend_modal:"
        )
      ) {
        return false;
      }

      await commendSystem.handleReviewModal(
        interaction
      );

      return true;
    }

    return false;
  },
};