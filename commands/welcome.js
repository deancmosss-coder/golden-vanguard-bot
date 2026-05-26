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
      await interaction.deferReply();

      await interaction.guild.members.fetch();

      const newest = interaction.guild.members.cache
        .filter((m) => !m.user.bot && typeof m.joinedTimestamp === "number")
        .sort((a, b) => b.joinedTimestamp - a.joinedTimestamp)
        .first(5);

      if (!newest || newest.length === 0) {
        return await interaction.editReply({
          content: "No recent members found.",
        });
      }

      const isSingle = newest.length === 1;

      const header = isSingle
        ? "@here A new gamer has joined the Vanguard:"
        : "@here Fresh gamers have joined the Vanguard:";

      const list = newest.map((m) => `🎮 <@${m.id}>`).join("\n");

      const message = [
        header,
        "",
        list,
        "",
        "Say hello before another squad steals them first.",
        "",
        "🎯 Looking for teammates? Use **#squad-lfg** and **@Ask to Play**.",
        "📡 Streamers & creators — show off your content in **#self-promo** and join the Vanguard Creator Network with **/creator apply**.",
        "",
        "Please be nice to them.",
        "At least for the first 24 hours.",
      ].join("\n");

      return await interaction.editReply({
        content: message,
        allowedMentions: {
          parse: ["everyone", "users"],
        },
      });
    } catch (err) {
      console.error("welcome command error:", err);

      if (interaction.deferred || interaction.replied) {
        return await interaction.editReply({
          content: "Something went wrong while sending the welcome message.",
        });
      }

      return await interaction.reply({
        content: "Something went wrong while sending the welcome message.",
        ephemeral: true,
      });
    }
  },
};