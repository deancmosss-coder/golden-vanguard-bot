// ================================
// commands/welcome.js (FULL)
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
        .filter((m) => !m.user.bot && typeof m.joinedTimestamp === "number")
        .sort((a, b) => b.joinedTimestamp - a.joinedTimestamp)
        .first(5);

      if (!newest.length) {
        return interaction.reply({ content: "No recent members found.", ephemeral: true });
      }

      const isSingle = newest.length === 1;

      const header = isSingle
        ? "@everyone Please give a warm welcome to our newest Helldiver:"
        : "@everyone Please give a warm welcome to our newest Helldivers:";

      const list = newest.map((m) => `🎖 <@${m.id}>`).join("\n");

      const intro = isSingle
        ? "We’re excited to have you here in The Golden Vanguard!"
        : "We’re excited to have you all join The Golden Vanguard!";

      const message = [
        header,
        "",
        list,
        "",
        intro,
        "",
        "🪖 Don’t forget to complete your **Enlistment Quiz** in **#enlistment-terminal** to discover which faction best fits your playstyle.",
        "📢 If you’re a streamer, feel free to introduce yourself in **#self-promo** — we love supporting our creators.",
        "⚔ When you’re ready to deploy, jump into **#squad-lfg** and send **@Ask to Play** to gather a squad and dive into battle.",
        "",
        "This is a place to learn, grow, and fight together.",
        "",
        "**Welcome to The Golden Vanguard.**",
        "**This is where your journey begins.**",
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
      await interaction.reply({ content: "Something went wrong.", ephemeral: true });
    }
  },
};