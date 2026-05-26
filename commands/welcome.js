// ================================
// commands/welcome.js
// COMMUNITY WELCOME MESSAGE
// ================================

const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("welcome")
    .setDescription("Welcome the last 5 members who joined the server."),

  async execute(interaction) {
    try {
      await interaction.guild.members.fetch();

      const newest = interaction.guild.members.cache
        .filter(
          (m) =>
            !m.user.bot &&
            typeof m.joinedTimestamp === "number"
        )
        .sort(
          (a, b) =>
            b.joinedTimestamp - a.joinedTimestamp
        )
        .first(5);

      if (!newest.length) {
        return interaction.reply({
          content: "No recent members found.",
          ephemeral: true,
        });
      }

      const isSingle = newest.length === 1;

      const header = isSingle
        ? "@everyone A new gamer has joined the Vanguard:"
        : "@everyone Fresh gamers have joined the Vanguard:";

      const list = newest
        .map((m) => `🎮 <@${m.id}>`)
        .join("\n");

      const message = [
        header,
        "",
        list,
        "",
        "Say hello before another squad steals them first.",
        "",
        "🎯 Looking for teammates? Use **#squad-lfg** and **@Ask to Play**.",
        "📡 Streamers & creators can promote themselves in **#self-promo**.",
        "",
        "Please be nice to them.",
        "At least for the first 24 hours.",
      ].join("\n");

      await interaction.reply({
        content: message,
        allowedMentions: {
          parse: ["everyone"],
          users: newest.map((m) => m.id),
        },
      });
    } catch (err) {
      console.error("welcome command error:", err);

      await interaction.reply({
        content: "Something went wrong.",
        ephemeral: true,
      });
    }
  },
};