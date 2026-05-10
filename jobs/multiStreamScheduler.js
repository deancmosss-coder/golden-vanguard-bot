const cron = require("node-cron");

const logger = require("../services/logger");
const multiStreamService = require("../services/multiStreamService");

const TRACKER_TZ = process.env.TRACKER_TIMEZONE || "Europe/London";

function startMultiStreamScheduler(client) {
  logger.info("Starting multistream scheduler...");

  cron.schedule(
    "*/30 * * * * *",
    async () => {
      try {
        await multiStreamService.scanMultiStreams(client);
      } catch (err) {
        logger.error("Multistream scheduler failed", err, {
          location: "jobs/multiStreamScheduler.js -> cron",
        });
      }
    },
    {
      timezone: TRACKER_TZ,
    }
  );

  logger.info(`Multistream alerts: every 30 seconds (${TRACKER_TZ})`);
}

module.exports = {
  startMultiStreamScheduler,
};
