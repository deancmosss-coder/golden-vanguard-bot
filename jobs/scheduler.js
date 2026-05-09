// =========================
// jobs/scheduler.js
// Handles all startup jobs + cron schedules
// =========================

const cron = require("node-cron");

const logger = require("../services/logger");

const {
  sendErrorAlert,
} = require("../services/alertService");

const registry = require("../services/featureRegistry");

const { runProtected } = require("../services/featureGuard");

const githubDeployService = require("../services/githubDeployService");

const {
  scanForReviews,
} = require("../services/discoveryReviewService");

const {
  refreshWarBoard,
} = require("./refreshWarBoard");

const TRACKER_TZ =
  process.env.TRACKER_TIMEZONE || "Europe/London";

const DISCOVERY_SCAN_CRON =
  (
    process.env.DISCOVERY_SCAN_CRON ||
    "*/10 * * * *"
  ).trim();

async function startScheduler(client) {
  let resumedGitHubDeployment = null;

  try {
    resumedGitHubDeployment =
      await githubDeployService.resumePendingDeployment(
        client
      );

    if (
      resumedGitHubDeployment?.scanPerformed
    ) {
      registry.registerSuccess(
        "registry"
      );
    }
  } catch (err) {
    logger.error(
      "GitHub deployment recovery failed",
      err,
      {
        location:
          "jobs/scheduler.js -> githubDeployService.resumePendingDeployment",
      }
    );

    await sendErrorAlert(
      client,
      "GitHub Deployment Recovery Failed",
      err,
      {
        feature: "registry",
        location:
          "jobs/scheduler.js -> githubDeployService.resumePendingDeployment",
        action:
          "Finalising pending GitHub deployment after restart",
        likelyCause:
          "Deployment state mismatch, scan failure, or channel access issue.",
        severity: "warning",
      }
    );
  }

  await runProtected(client, {
    feature: "warboard",

    action:
      "Refreshing war board on startup",

    location:
      "jobs/scheduler.js -> refreshWarBoard",

    likelyCause:
      "Refresh job failed, missing channel, or bad data.",

    retries: 1,

    retryDelayMs: 2000,

    maxFailures: 3,

    job: async () => {
      await refreshWarBoard(client);

      logger.info(
        "War board refreshed on startup"
      );

      registry.registerSuccess(
        "warboard"
      );
    },
  });

  if (
    !resumedGitHubDeployment?.scanPerformed
  ) {
    await runProtected(client, {
      feature: "registry",

      action:
        "Startup discovery scan",

      location:
        "jobs/scheduler.js -> scanForReviews",

      likelyCause:
        "Discovery scan failed on startup.",

      retries: 0,

      maxFailures: 3,

      job: async () => {
        await scanForReviews(
          client,
          "System Startup"
        );

        registry.registerSuccess(
          "registry"
        );
      },
    });
  }

  // =========================
  // WAR BOARD REFRESH
  // =========================

  cron.schedule(
    "*/15 * * * *",
    async () => {
      await runProtected(client, {
        feature: "warboard",

        action:
          "Scheduled war board refresh",

        location:
          "jobs/scheduler.js -> cron refreshWarBoard",

        likelyCause:
          "Refresh job failed repeatedly.",

        retries: 1,

        retryDelayMs: 3000,

        maxFailures: 3,

        job: async () => {
          await refreshWarBoard(
            client
          );

          registry.registerSuccess(
            "warboard"
          );
        },
      });
    },
    {
      timezone: TRACKER_TZ,
    }
  );

  // =========================
  // DISCOVERY SCAN
  // =========================

  cron.schedule(
    DISCOVERY_SCAN_CRON,
    async () => {
      await runProtected(client, {
        feature: "registry",

        action:
          "Scheduled discovery scan",

        location:
          "jobs/scheduler.js -> cron scanForReviews",

        likelyCause:
          "Discovery scan failed on schedule.",

        retries: 0,

        maxFailures: 3,

        job: async () => {
          await scanForReviews(
            client,
            "Scheduled Scan"
          );

          registry.registerSuccess(
            "registry"
          );
        },
      });
    },
    {
      timezone: TRACKER_TZ,
    }
  );

  logger.info(
    `War: 15m board refresh (${TRACKER_TZ})`
  );

  logger.info(
    `Discovery: ${DISCOVERY_SCAN_CRON} (${TRACKER_TZ})`
  );
}

module.exports = {
  startScheduler,
};
