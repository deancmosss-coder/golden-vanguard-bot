const cron = require("node-cron");

const logger = require("../services/logger");

const {
  scanCreators,
} = require("../services/streamAlertService");

let started = false;

function startStreamAlertScheduler(client) {
  if (started) return;

  started = true;

  logger.info(
    "Starting stream alert scheduler..."
  );

  /*
    TWITCH:
    every 30 seconds
  */

  cron.schedule(
    "*/30 * * * * *",
    async () => {
      try {
        await scanCreators(client, {
          platforms: ["twitch"],
        });
      } catch (err) {
        logger.error(
          "Twitch scheduler failed",
          err,
          {
            location:
              "streamAlertScheduler.js -> twitchScheduler",
          }
        );
      }
    },
    {
      timezone: "Europe/London",
    }
  );

  /*
    YOUTUBE:
    every 15 minutes
  */

  cron.schedule(
    "*/15 * * * *",
    async () => {
      try {
        await scanCreators(client, {
          platforms: ["youtube"],
        });
      } catch (err) {
        logger.error(
          "YouTube scheduler failed",
          err,
          {
            location:
              "streamAlertScheduler.js -> youtubeScheduler",
          }
        );
      }
    },
    {
      timezone: "Europe/London",
    }
  );

  logger.info(
    "Twitch alerts: every 30 seconds (Europe/London)"
  );

  logger.info(
    "YouTube alerts: every 15 minutes (Europe/London)"
  );
}

module.exports = {
  startStreamAlertScheduler,
};