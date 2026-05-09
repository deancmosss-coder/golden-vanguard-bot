// =========================
// handlers/messageHandler.js
// Handles:
// - tracker proof image messages
// - ask-to-play trigger messages
// =========================

const { Events } = require("discord.js");

const logger = require("../services/logger");
const registry = require("../services/featureRegistry");
const { sendErrorAlert } = require("../services/alertService");

function registerMessageHandler(client, options) {
  const {
    ASK_ROLE_ID,
    ALLOWED_CHANNEL_ID,
    TRIGGER_TEXT,
    buildAskEmbed,
    buildAskComponents,
    syncRosterFromVc,
    sessions,
  } = options;

  client.on(Events.MessageCreate, async (message) => {
    try {
      if (message.author.bot || !message.guild) return;

      try {
        const runCmd = require("../commands/run.js");
        if (typeof runCmd.handleTrackerProofMessage === "function") {
          await runCmd.handleTrackerProofMessage(message);
        }
      } catch {
        // ignore tracker proof handler errors here
      }

      if (ALLOWED_CHANNEL_ID && message.channel.id !== ALLOWED_CHANNEL_ID) return;

      const contentLower = (message.content || "").toLowerCase();
      const roleMentionTrigger = !!ASK_ROLE_ID && message.mentions?.roles?.has(ASK_ROLE_ID);
      const textTrigger = contentLower.includes(TRIGGER_TEXT);

      if (!roleMentionTrigger && !textTrigger) return;

      const guild = message.guild;
      const owner = await guild.members.fetch(message.author.id).catch(() => null);
      if (!owner) return;

      const vc = owner.voice?.channel || null;

      const session = {
        ownerId: owner.id,
        guildId: guild.id,
        textChannelId: message.channel.id,
        messageId: "pending",
        faction: null,
        difficulty: null,
        roster: new Set([owner.id]),
      };

      syncRosterFromVc(session, vc);

      const sent = await message.channel.send({
        content: ASK_ROLE_ID ? `<@&${ASK_ROLE_ID}>` : undefined,
        embeds: [buildAskEmbed(session, vc?.name || null)],
        components: buildAskComponents(session),
        allowedMentions: ASK_ROLE_ID ? { roles: [ASK_ROLE_ID] } : undefined,
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
