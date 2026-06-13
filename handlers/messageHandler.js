// =========================
// handlers/messageHandler.js
// Handles:
// - tracker proof image messages
// - multi-game ask-to-play trigger messages
// =========================

const { Events } = require("discord.js");

const logger = require("../services/logger");
const registry = require("../services/featureRegistry");
const { sendErrorAlert } = require("../services/alertService");

const {
  addMessage,
} = require("../services/wallpaperChatStore");

function registerMessageHandler(client, options) {
  const {
    ASK_ROLE_ID,
    TRIGGER_TEXT,
    buildAskEmbed,
    buildAskComponents,
    syncRosterFromVc,
    sessions,
    findGameConfigByChannel,
    getDisplayVcName,
  } = options;

  client.on(Events.MessageCreate, async (message) => {
    try {
      if (message.author.bot || !message.guild) return;
        const allowedChannels = String(
          process.env.DASHBOARD_CHAT_CHANNEL_IDS || ""
        )
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean);

        if (allowedChannels.includes(message.channel.id)) {
          addMessage({
            channel: message.channel.name,
            author: message.member?.displayName || message.author.username,
            content: (message.content || "")
              .replace(/\n/g, " ")
              .slice(0, 120),
          });
        }

      try {
        const runCmd = require("../commands/run.js");

        if (typeof runCmd.handleTrackerProofMessage === "function") {
          await runCmd.handleTrackerProofMessage(message);
        }
      } catch {
        // ignore tracker proof handler errors here
      }

      const gameConfig = findGameConfigByChannel(message.channel);

      if (!gameConfig) return;

      const contentLower = (message.content || "").toLowerCase();

      const roleMentionTrigger =
        !!gameConfig.pingRoleId &&
        message.mentions?.roles?.has(gameConfig.pingRoleId);

      const oldAskRoleTrigger =
        !!ASK_ROLE_ID &&
        message.mentions?.roles?.has(ASK_ROLE_ID);

      const textTrigger =
        !!TRIGGER_TEXT &&
        contentLower.includes(TRIGGER_TEXT);

      if (!roleMentionTrigger && !oldAskRoleTrigger && !textTrigger) return;

      const guild = message.guild;
      const owner = await guild.members
        .fetch(message.author.id)
        .catch(() => null);

      if (!owner) return;

      const vc = owner.voice?.channel || null;

      const session = {
        ownerId: owner.id,
        guildId: guild.id,
        textChannelId: message.channel.id,
        messageId: "pending",
        gameKey: gameConfig.gameKey,
        faction: null,
        difficulty: null,
        activity: null,
        customGame: null,
        roster: new Set([owner.id]),
      };

      syncRosterFromVc(session, vc);

      const vcName = getDisplayVcName(vc, gameConfig);

      const sent = await message.channel.send({
        content: gameConfig.pingRoleId
          ? `<@&${gameConfig.pingRoleId}>`
          : undefined,
        embeds: [buildAskEmbed(session, vcName)],
        components: buildAskComponents(session),
        allowedMentions: gameConfig.pingRoleId
          ? { roles: [gameConfig.pingRoleId] }
          : undefined,
      });

      session.messageId = sent.id;
      sessions.set(sent.id, session);

      registry.registerSuccess("askToPlay");
    } catch (err) {
      logger.error("MessageCreate error", err, {
        location: "handlers/messageHandler.js -> MessageCreate",
        messageId: message?.id,
        authorId: message?.author?.id,
        channelId: message?.channel?.id,
      });

      await sendErrorAlert(client, "Message Handler Failed", err, {
        feature: "askToPlay",
        location: "MessageCreate",
        action: "Handling Ask-to-Play trigger",
        likelyCause: "Command flow, channel access, or session build failure.",
        severity: "warning",
      });
    }
  });
}

module.exports = {
  registerMessageHandler,
};
