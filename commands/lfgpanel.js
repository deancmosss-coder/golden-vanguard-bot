// =========================
// commands/lfgpanel.js
// Posts the LFG notification settings panel
// =========================

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require("discord.js");

const lfgNotificationService = require("../services/lfgNotificationService");

const data = new SlashCommandBuilder()
  .setName("lfgpanel")
  .setDescription("Post the LFG notification settings panel.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .setDMPermission(false);

async function execute(interaction) {
  await interaction.deferReply({ flags: 64 });

  const channelId = process.env.NOTIFICATION_SETTINGS_CHANNEL_ID;

  if (!channelId) {
    return interaction.editReply(
      "Missing NOTIFICATION_SETTINGS_CHANNEL_ID in .env."
    );
  }

  const channel = await interaction.guild.channels
    .fetch(channelId)
    .catch(() => null);

  if (!channel?.isTextBased()) {
    return interaction.editReply(
      "Notification settings channel could not be found or is not a text channel."
    );
  }

  await lfgNotificationService.postNotificationPanel(channel);

  return interaction.editReply(
    `✅ LFG notification panel posted in <#${channel.id}>.`
  );
}

module.exports = {
  data,
  execute,
};
