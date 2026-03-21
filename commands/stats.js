const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { getPlayerStats } = require("../services/playerStatsService");

const data = new SlashCommandBuilder()
  .setName("stats")
  .setDescription("View your Vanguard combat statistics.")
  .addUserOption((option) =>
    option
      .setName("player")
      .setDescription("View another player's stats")
      .setRequired(false)
  );

async function execute(interaction) {
  const targetUser = interaction.options.getUser("player") || interaction.user;
  const stats = getPlayerStats(targetUser.id);

  if (!stats) {
    return interaction.reply({
      content: `No tracked stats found for **${targetUser.username}** yet.`,
      ephemeral: true,
    });
  }

  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle(`📊 Vanguard Combat Record — ${targetUser.username}`)
    .setDescription(
      [
        `**Runs Logged:** ${stats.runs}`,
        `**Wins:** ${stats.wins}`,
        `**Losses:** ${stats.losses}`,
        `**Win Rate:** ${stats.winRate}`,
        "",
        `**Kills:** ${stats.kills}`,
        `**Deaths:** ${stats.deaths}`,
        `**K/D Ratio:** ${stats.kd}`,
        `**Accidentals:** ${stats.accidentals}`,
        "",
        `**Terminids Killed:** ${stats.enemies?.Terminids || 0}`,
        `**Automatons Killed:** ${stats.enemies?.Automatons || 0}`,
        `**Illuminate Killed:** ${stats.enemies?.Illuminate || 0}`,
        "",
        `**Total Score:** ${stats.totalScore || 0}`,
      ].join("\n")
    )
    .setFooter({ text: "The Golden Vanguard" })
    .setTimestamp();

  return interaction.reply({ embeds: [embed] });
}

module.exports = {
  data,
  execute,
};