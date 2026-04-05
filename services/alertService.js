// services/alertService.js
const { EmbedBuilder } = require("discord.js");
const logger = require("./logger");

const MAX_DESCRIPTION = 4000;

function safeString(value) {
  if (value === null || value === undefined) return "No details provided.";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch (err) {
    return String(value);
  }
}

function truncate(text, maxLength = MAX_DESCRIPTION) {
  if (!text) return "No details provided.";
  return text.length > maxLength
    ? `${text.slice(0, maxLength - 20)}\n\n...[truncated]`
    : text;
}

async function fetchAlertChannel(client) {
  const channelId = process.env.BOT_ALERT_CHANNEL_ID?.trim();

  if (!channelId) {
    logger.warn("BOT_ALERT_CHANNEL_ID is missing from .env");
    return null;
  }

  try {
    const channel = await client.channels.fetch(channelId).catch(() => null);

    if (!channel) {
      logger.warn("Alert channel could not be fetched", { channelId });
      return null;
    }

    if (!channel.isTextBased()) {
      logger.warn("Configured BOT_ALERT_CHANNEL_ID is not a text-based channel", {
        channelId,
      });
      return null;
    }

    return channel;
  } catch (err) {
    logger.error("Failed to fetch alert channel", err, { channelId });
    return null;
  }
}

async function sendAlert(client, options = {}) {
  const {
    title = "Bot Alert",
    description = "No details provided.",
    severity = "warning",
    fields = [],
    ping = false,
  } = options;

  const channel = await fetchAlertChannel(client);
  if (!channel) return false;

  const safeDescription = truncate(safeString(description));
  const colorMap = {
    info: 0x3498db,
    success: 0x2ecc71,
    warning: 0xf1c40f,
    error: 0xe74c3c,
    critical: 0x8e44ad,
  };

  const embed = new EmbedBuilder()
    .setTitle(`⚠️ ${title}`)
    .setDescription(safeDescription)
    .setColor(colorMap[severity] || colorMap.warning)
    .setTimestamp();

  if (Array.isArray(fields) && fields.length) {
    embed.addFields(
      fields
        .filter((field) => field && field.name && field.value)
        .slice(0, 25)
        .map((field) => ({
          name: String(field.name).slice(0, 256),
          value: String(field.value).slice(0, 1024),
          inline: Boolean(field.inline),
        }))
    );
  }

  try {
    await channel.send({
      content: ping ? "<@&YOUR_STAFF_ROLE_IF_YOU_USE_ONE>" : undefined,
      embeds: [embed],
    });

    logger.info("Bot alert sent", { title, severity });
    return true;
  } catch (err) {
    logger.error("Failed to send bot alert", err, { title, severity });
    return false;
  }
}

async function sendErrorAlert(client, contextTitle, err, extra = {}) {
  const stackOrMessage =
    err?.stack || err?.message || safeString(err) || "Unknown error";

  const fields = [];

  if (extra.feature) {
    fields.push({
      name: "Feature",
      value: String(extra.feature),
      inline: true,
    });
  }

  if (extra.location) {
    fields.push({
      name: "Location",
      value: String(extra.location),
      inline: true,
    });
  }

  if (extra.action) {
    fields.push({
      name: "Action",
      value: String(extra.action),
      inline: false,
    });
  }

  if (extra.likelyCause) {
    fields.push({
      name: "Likely Cause",
      value: String(extra.likelyCause),
      inline: false,
    });
  }

  await sendAlert(client, {
    title: contextTitle || "System Error",
    description: stackOrMessage,
    severity: extra.severity || "error",
    fields,
    ping: Boolean(extra.ping),
  });
}

async function sendStartupAlert(client, message) {
  return sendAlert(client, {
    title: "Bot Startup",
    description: message,
    severity: "success",
  });
}

async function sendShutdownAlert(client, message) {
  return sendAlert(client, {
    title: "Bot Shutdown",
    description: message,
    severity: "warning",
  });
}

module.exports = {
  sendAlert,
  sendErrorAlert,
  sendStartupAlert,
  sendShutdownAlert,
};