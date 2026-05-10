const cron = require("node-cron");

const logger = require("../services/logger");
const streamAlertService = require("../services/streamAlertService");

const TRACKER_TZ = process.env.TRACKER_TIMEZONE || "Europe/London";

function startStreamAlertScheduler(client) {
  logger.info("Starting stream alert scheduler...");

  cron.schedule(
    "*/30 * * * * *",
    async () => {
      try {
        await streamAlertService.scanCreators(client);
      } catch (err) {
        logger.error("Stream alert scheduler failed", err, {
          location: "jobs/streamAlertScheduler.js -> cron",
        });
      }
    },
    {
      timezone: TRACKER_TZ,
    }
  );

  logger.info(`Stream alerts: every 30 seconds (${TRACKER_TZ})`);
}

module.exports = {
  startStreamAlertScheduler,
};
