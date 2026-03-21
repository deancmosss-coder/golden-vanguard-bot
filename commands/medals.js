// =========================
// commands/medals.js
// =========================

const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { getUserMedals } = require("../services/medalService");

const data = new SlashCommandBuilder()
  .setName("medals")
  .setDescription("Show unlocked medals for a diver.")
  .addUserOption((o) =>
    o.setName("user").setDescription("View another diver's medals").setRequired(false)
  );

async function execute(interaction) {
  const targetUser = interaction.options.getUser("user") || interaction.user;
  const medals = getUserMedals(targetUser.id);

  if (!medals.length) {
    return interaction.reply({
      content: `No medals unlocked yet for **${targetUser.username}**.`,
      ephemeral: true,
    });
  }

  const lines = medals
    .sort((a, b) => new Date(b.awardedAt).getTime() - new Date(a.awardedAt).getTime())
    .map((m) => `${m.icon} **${m.name}**\n${m.description}`)
    .join("\n\n");

  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle(`🏅 ${targetUser.username}'s Medals`)
    .setDescription(lines)
    .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
    .setFooter({ text: "The Golden Vanguard" })
    .setTimestamp();

  return interaction.reply({ embeds: [embed] });
}

module.exports = {
  data,
  execute,
};