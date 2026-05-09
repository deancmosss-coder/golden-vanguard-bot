// =========================
// handlers/errorHandler.js
// Global process + discord error handling
// =========================

const { Events } = require("discord.js");

const logger = require("../services/logger");

const {
  sendAlert,
} = require("../services/alertService");

function registerErrorHandlers(
  client
) {
  // =========================
  // DISCORD CLIENT ERRORS
  // =========================

  client.on(
    Events.Error,
    async (err) => {
      logger.error(
        "Discord Client Error",
        err,
        {
          location:
            "client.on(Events.Error)",
        }
      );
    }
  );

  client.on(
    Events.Warn,
    (warning) => {
      logger.warn(
        "Discord Client Warning",
        {
          location:
            "client.on(Events.Warn)",

          warning,
        }
      );
    }
  );

  // =========================
  // UNHANDLED REJECTIONS
  // =========================

  process.on(
    "unhandledRejection",
    async (reason) => {
      const err =
        reason instanceof Error
          ? reason
          : new Error(
              String(
                reason ||
                  "Unknown rejection"
              )
            );

      logger.error(
        "Unhandled Promise Rejection",
        err,
        {
          location:
            "process.on(unhandledRejection)",
        }
      );
    }
  );

  // =========================
  // UNCAUGHT EXCEPTIONS
  // =========================

  process.on(
    "uncaughtException",
    async (err) => {
      logger.error(
        "Uncaught Exception",
        err,
        {
          location:
            "process.on(uncaughtException)",
        }
      );
    }
  );

  // =========================
  // CLEAN SHUTDOWN
  // =========================

  async function shutdown(
    signal
  ) {
    logger.warn(
      `Shutdown signal received: ${signal}`,
      {
        location: "shutdown()",
      }
    );

    try {
      if (client.isReady()) {
        await sendAlert(client, {
          title:
            "Bot Shutdown",

          description:
            `Golden Vanguard bot is shutting down after receiving **${signal}**.`,

          severity:
            "warning",
        });
      }
    } catch {}

    try {
      client.destroy();
    } catch {}

    process.exit(0);
  }

  process.on(
    "SIGINT",
    () => shutdown("SIGINT")
  );

  process.on(
    "SIGTERM",
    () => shutdown("SIGTERM")
  );
}

module.exports = {
  registerErrorHandlers,
};
