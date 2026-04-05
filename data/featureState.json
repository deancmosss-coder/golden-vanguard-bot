// services/featureGuard.js
const logger = require("./logger");
const { sendAlert, sendErrorAlert } = require("./alertService");
const registry = require("./featureRegistry");

const DEFAULT_MAX_FAILURES = 3;
const DEFAULT_RETRIES = 1;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runProtected(client, options = {}) {
  const {
    feature,
    action = "Running protected feature",
    location = "unknown",
    likelyCause = "Unknown",
    retries = DEFAULT_RETRIES,
    retryDelayMs = 1000,
    maxFailures = DEFAULT_MAX_FAILURES,
    announceIsolation = false,
    announceChannelId = null,
    job,
  } = options;

  if (!feature || typeof job !== "function") {
    throw new Error("runProtected requires both 'feature' and 'job'.");
  }

  if (!registry.isFeatureEnabled(feature)) {
    logger.warn(`Skipped disabled feature: ${feature}`, {
      feature,
      location,
    });

    return {
      ok: false,
      skipped: true,
      disabled: true,
    };
  }

  let lastError = null;

  for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
    try {
      const result = await job();

      registry.registerSuccess(feature);

      if (attempt > 1) {
        logger.info(`Feature recovered after retry: ${feature}`, {
          feature,
          location,
          attempt,
        });

        await sendAlert(client, {
          title: `${feature} recovered`,
          description: `The **${feature}** feature recovered successfully on retry ${attempt}.`,
          severity: "success",
          fields: [
            { name: "Feature", value: feature, inline: true },
            { name: "Location", value: location, inline: true },
            { name: "Attempts", value: String(attempt), inline: true },
          ],
        });
      }

      return {
        ok: true,
        skipped: false,
        disabled: false,
        result,
      };
    } catch (err) {
      lastError = err;
      const featureState = registry.registerFailure(feature, err);

      logger.error(`Protected feature failed: ${feature}`, err, {
        feature,
        location,
        action,
        attempt,
        failCount: featureState.failCount,
      });

      if (attempt <= retries) {
        await sendErrorAlert(client, `${feature} retrying`, err, {
          feature,
          location,
          action,
          likelyCause,
          severity: "warning",
        });

        await delay(retryDelayMs);
        continue;
      }

      if (featureState.failCount >= maxFailures) {
        const pauseReason = `Disabled after ${featureState.failCount} consecutive failure(s).`;
        registry.disableFeature(feature, pauseReason);

        logger.warn(`Feature disabled after repeated failures: ${feature}`, {
          feature,
          location,
          failCount: featureState.failCount,
          pauseReason,
        });

        await sendErrorAlert(client, `${feature} isolated`, err, {
          feature,
          location,
          action,
          likelyCause,
          severity: "critical",
        });

        await sendAlert(client, {
          title: `${feature} paused`,
          description:
            `The **${feature}** feature has been temporarily disabled after repeated failures.\n\n` +
            `Reason: ${pauseReason}`,
          severity: "warning",
          fields: [
            { name: "Feature", value: feature, inline: true },
            { name: "Location", value: location, inline: true },
            { name: "Fail Count", value: String(featureState.failCount), inline: true },
          ],
        });

        if (announceIsolation && announceChannelId) {
          try {
            const ch = await client.channels.fetch(announceChannelId).catch(() => null);
            if (ch?.isTextBased()) {
              await ch.send(
                `⚠️ **Bot Notice**\nThe **${feature}** feature has been temporarily paused after repeated errors. Staff have been alerted.`
              );
            }
          } catch (announceErr) {
            logger.error("Failed to send isolation announcement", announceErr, {
              feature,
              location,
              announceChannelId,
            });
          }
        }
      } else {
        await sendErrorAlert(client, `${feature} failed`, err, {
          feature,
          location,
          action,
          likelyCause,
          severity: "error",
        });
      }
    }
  }

  return {
    ok: false,
    skipped: false,
    disabled: !registry.isFeatureEnabled(feature),
    error: lastError,
  };
}

module.exports = {
  runProtected,
};
