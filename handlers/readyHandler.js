// =========================
// handlers/readyHandler.js
// Handles bot ready/startup logic
// =========================

const { Events } = require("discord.js");

const logger = require("../services/logger");
const { sendStartupAlert } = require("../services/alertService");
const { startScheduler } = require("../jobs/scheduler");
const {
  startStreamAlertScheduler,
} = require("../jobs/streamAlertScheduler");

function registerReadyHandler(client) {
  client.once(Events.ClientReady, async () => {
    logger.info(`Logged in as ${client.user.tag}`, {
      botId: client.user.id,
    });

    await sendStartupAlert(
      client,
      `Golden Vanguard bot is now online as **${client.user.tag}**`
    );

    await startScheduler(client);

    startStreamAlertScheduler(client);
  });
}

module.exports = {
  registerReadyHandler,
};