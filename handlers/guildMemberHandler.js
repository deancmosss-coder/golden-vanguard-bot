// =========================
// handlers/guildMemberHandler.js
// Handles:
// - new member welcome embed
// - recruit orientation logging
// =========================

const { Events, EmbedBuilder } = require("discord.js");

const logger = require("../services/logger");
const registry = require("../services/featureRegistry");
const { sendErrorAlert } = require("../services/alertService");
const orientationSystem = require("../services/orientationSystem");

function buildWelcomeEmbed(member, memberCount) {
  const username =
    member.displayName ||
    member.user?.globalName ||
    member.user?.username ||
    "Recruit";

  return new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle("🛡 Welcome to The Golden Vanguard 🛡")
    .setDescription(
      [
        `Welcome ${username},`,
        "",
        "You’ve joined a multi-game tactical community built around teamwork, coordination, community, and unforgettable moments.",
        "",
        "Whether you’re here to squad up, compete, chill in voice chat, discover new games, or grow as a creator. There’s a place for you inside the Vanguard.",
        "",
        "━━━━━━━━━━━━━━━━━━",
        "",
        "🪖 🎮 Choose the games you play to unlock your community sections, squad channels, and LFG systems.",
        "", 
        "📡 Join the Vanguard Creator Network to receive stream alerts, creator promotion, and community support for your content.", 
        "",
        "🛡 Respect the community, support your squad, and represent the Vanguard well.", 
        "",
        "━━━━━━━━━━━━━━━━━━",
        "",
        "Form up. Drop in. Execute.",
        "",
        `🎖 Member #${memberCount}`,
      ].join("\n")
    )
    .setTimestamp()
    .setFooter({ text: "The Golden Vanguard" });
}

function registerGuildMemberHandler(client, options = {}) {
  const { WELCOME_CHANNEL_ID } = options;

  client.on(Events.GuildMemberAdd, async (member) => {
    try {
      if (WELCOME_CHANNEL_ID) {
        const ch = await member.guild.channels.fetch(WELCOME_CHANNEL_ID).catch(() => null);

        if (ch?.isTextBased()) {
          await ch.send({
            embeds: [buildWelcomeEmbed(member, member.guild.memberCount)],
          });
        }
      }

      await orientationSystem.logNewRecruit(member);
      registry.registerSuccess("orientation");
    } catch (err) {
      logger.error("GuildMemberAdd failed", err, {
        location: "handlers/guildMemberHandler.js -> GuildMemberAdd",
        memberId: member?.id,
      });

      await sendErrorAlert(client, "Welcome/Recruit Logging Failed", err, {
        feature: "orientation",
        location: "GuildMemberAdd",
        action: "Welcoming new member / logging recruit",
        likelyCause: "Channel issue, permissions, or orientation handler failure.",
        severity: "warning",
      });
    }
  });
}

module.exports = {
  registerGuildMemberHandler,
  buildWelcomeEmbed,
};
