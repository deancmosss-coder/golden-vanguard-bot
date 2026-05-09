// =========================
// handlers/voiceStateHandler.js
// Handles:
// - orientation VC tracking
// - player voice session tracking
// - ask-to-play roster syncing
// =========================

const { Events } = require("discord.js");

const logger = require("../services/logger");
const registry = require("../services/featureRegistry");
const { sendAlert, sendErrorAlert } = require("../services/alertService");
const orientationSystem = require("../services/orientationSystem");
const playerStats = require("../services/playerStats");

function registerVoiceStateHandler(client, options) {
  const {
    sessions,
    resolveHostVc,
    syncRosterFromVc,
    updateAskMessage,
  } = options;

  client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    try {
      if (registry.isFeatureEnabled("orientation")) {
        try {
          orientationSystem.handleVoiceStateUpdate(oldState, newState);
          registry.registerSuccess("orientation");
        } catch (err) {
          const state = registry.registerFailure("orientation", err);

          logger.error("Orientation voice update failed", err, {
            location:
              "handlers/voiceStateHandler.js -> orientationSystem.handleVoiceStateUpdate",
            failCount: state.failCount,
          });

          if (state.failCount >= 3) {
            registry.disableFeature(
              "orientation",
              "Disabled after repeated voice update failures."
            );

            await sendErrorAlert(client, "orientation isolated", err, {
              feature: "orientation",
              location: "VoiceStateUpdate",
              action: "Handling orientation voice update",
              likelyCause: "Orientation VC tracking failed repeatedly.",
              severity: "critical",
            });

            await sendAlert(client, {
              title: "orientation paused",
              description:
                "The **orientation** feature has been temporarily disabled after repeated voice update failures.",
              severity: "warning",
            });
          } else {
            await sendErrorAlert(client, "orientation failed", err, {
              feature: "orientation",
              location: "VoiceStateUpdate",
              action: "Handling orientation voice update",
              likelyCause: "Orientation VC tracking failed.",
              severity: "warning",
            });
          }
        }
      }

      if (!oldState.channelId && newState.channelId) {
        playerStats.startVoiceSession(newState.id);
        registry.registerSuccess("playerStats");
      }

      if (oldState.channelId && !newState.channelId) {
        playerStats.endVoiceSession(oldState.id);
        registry.registerSuccess("playerStats");
      }

      if (
        oldState.channelId &&
        newState.channelId &&
        oldState.channelId !== newState.channelId
      ) {
        playerStats.endVoiceSession(oldState.id);
        playerStats.startVoiceSession(newState.id);
        registry.registerSuccess("playerStats");
      }

      const guild = newState.guild || oldState.guild;
      if (!guild) return;

      for (const session of sessions.values()) {
        if (session.guildId !== guild.id) continue;

        const vc = await resolveHostVc(guild, session.ownerId);

        const touchedHost =
          oldState.id === session.ownerId || newState.id === session.ownerId;

        const touchedVc =
          vc && (oldState.channelId === vc.id || newState.channelId === vc.id);

        if (!touchedHost && !touchedVc) continue;

        const changed = syncRosterFromVc(session, vc);
        if (changed) {
          await updateAskMessage(session);
          registry.registerSuccess("askToPlay");
        }
      }
    } catch (err) {
      logger.error("VoiceStateUpdate error", err, {
        location: "handlers/voiceStateHandler.js",
        oldChannelId: oldState?.channelId || null,
        newChannelId: newState?.channelId || null,
        userId: newState?.id || oldState?.id || null,
      });

      await sendErrorAlert(client, "Voice State Update Failed", err, {
        feature: "voiceTracking",
        location: "VoiceStateUpdate",
        action: "Updating VC sessions / roster tracking",
        likelyCause: "Voice session tracking or roster sync error.",
        severity: "warning",
      });
    }
  });
}

module.exports = {
  registerVoiceStateHandler,
};
