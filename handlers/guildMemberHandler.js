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
    .setTitle("🛡 Welcome to The Golden Vanguard")
    .setDescription(
      [
        `Welcome ${username},`,
        "",
        "You’ve joined a tactical squad-based community built for coordination, growth, and winning together.",
        "",
        "Here, we don’t just play — we deploy with purpose.",
        "",
        "━━━━━━━━━━━━━━━━━━",
        "",
        "🪖 **Become a True Vanguard Member**",
        "To unlock full access and fight alongside the Vanguard, you must complete your Recruit Orientation.",
        "",
        "📍 Head to **#orientation-checklist** to begin",
        "⏳ You have **7 days** to complete it",
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
