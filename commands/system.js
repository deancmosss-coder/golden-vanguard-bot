// commands/system.js
const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} = require("discord.js");

const registry = require("../services/featureRegistry");
const logger = require("../services/logger");

const FEATURE_CHOICES = [
  { name: "warboard", value: "warboard" },
  { name: "tracker", value: "tracker" },
  { name: "playerStats", value: "playerStats" },
  { name: "askToPlay", value: "askToPlay" },
  { name: "orientation", value: "orientation" },
  { name: "voiceTracking", value: "voiceTracking" },
  { name: "leaderboard", value: "leaderboard" },
];

function formatDate(value) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Invalid date";
  return `<t:${Math.floor(date.getTime() / 1000)}:R>`;
}

function buildStatusEmbed() {
  const features = registry.getAllFeatures();

  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle("🛠 System Status")
    .setDescription("Current protected feature states")
    .setTimestamp()
    .setFooter({ text: "The Golden Vanguard" });

  for (const [featureName, state] of Object.entries(features)) {
    const status = state.enabled ? "✅ Enabled" : "🛑 Disabled";
    const failCount = Number(state.failCount || 0);

    embed.addFields({
      name: featureName,
      value:
        `${status}\n` +
        `Failures: **${failCount}**\n` +
        `Last Success: **${formatDate(state.lastSuccessAt)}**\n` +
        `Last Error: **${state.lastError || "None"}**\n` +
        `Paused Reason: **${state.pausedReason || "None"}**`,
      inline: false,
    });
  }

  return embed;
}

function buildFeatureEmbed(title, featureName, state, color = 0xf1c40f) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .addFields(
      { name: "Feature", value: featureName, inline: true },
      { name: "Enabled", value: state.enabled ? "Yes" : "No", inline: true },
      { name: "Fail Count", value: String(state.failCount || 0), inline: true },
      { name: "Last Error", value: state.lastError || "None", inline: false },
      { name: "Paused Reason", value: state.pausedReason || "None", inline: false },
      { name: "Last Success", value: formatDate(state.lastSuccessAt), inline: false }
    )
    .setTimestamp()
    .setFooter({ text: "The Golden Vanguard" });
}

function getLogText(logType) {
  const lineCount = 20;

  if (logType === "error") {
    return logger.getLastLines(logger.getErrorLogPath(), lineCount).join("\n");
  }

  if (logType === "activity") {
    return logger.getLastLines(logger.getActivityLogPath(), lineCount).join("\n");
  }

  if (logType === "debug") {
    return logger.getLastLines(logger.getDebugLogPath(), lineCount).join("\n");
  }

  return "Unknown log type.";
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("system")
    .setDescription("Manage protected bot systems")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName("status")
        .setDescription("Show all protected feature statuses")
    )
    .addSubcommand((sub) =>
      sub
        .setName("enable")
        .setDescription("Enable a protected feature")
        .addStringOption((opt) =>
          opt
            .setName("feature")
            .setDescription("Feature name")
            .setRequired(true)
            .addChoices(...FEATURE_CHOICES)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("disable")
        .setDescription("Disable a protected feature")
        .addStringOption((opt) =>
          opt
            .setName("feature")
            .setDescription("Feature name")
            .setRequired(true)
            .addChoices(...FEATURE_CHOICES)
        )
        .addStringOption((opt) =>
          opt
            .setName("reason")
            .setDescription("Reason for disabling")
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("reset")
        .setDescription("Reset a protected feature state")
        .addStringOption((opt) =>
          opt
            .setName("feature")
            .setDescription("Feature name")
            .setRequired(true)
            .addChoices(...FEATURE_CHOICES)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("logs")
        .setDescription("Show recent system logs")
        .addStringOption((opt) =>
          opt
            .setName("type")
            .setDescription("Log type")
            .setRequired(true)
            .addChoices(
              { name: "error", value: "error" },
              { name: "activity", value: "activity" },
              { name: "debug", value: "debug" }
            )
        )
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "status") {
      const embed = buildStatusEmbed();
      return interaction.reply({
        embeds: [embed],
        ephemeral: true,
      });
    }

    if (subcommand === "enable") {
      const feature = interaction.options.getString("feature", true);
      const state = registry.enableFeature(feature);

      return interaction.reply({
        embeds: [
          buildFeatureEmbed("✅ Feature Enabled", feature, state, 0x2ecc71),
        ],
        ephemeral: true,
      });
    }

    if (subcommand === "disable") {
      const feature = interaction.options.getString("feature", true);
      const reason =
        interaction.options.getString("reason") || "Disabled manually by admin";

      const state = registry.disableFeature(feature, reason);

      return interaction.reply({
        embeds: [
          buildFeatureEmbed("🛑 Feature Disabled", feature, state, 0xe74c3c),
        ],
        ephemeral: true,
      });
    }

    if (subcommand === "reset") {
      const feature = interaction.options.getString("feature", true);
      const state = registry.resetFeature(feature);

      return interaction.reply({
        embeds: [
          buildFeatureEmbed("🔄 Feature Reset", feature, state, 0x3498db),
        ],
        ephemeral: true,
      });
    }

    if (subcommand === "logs") {
      const type = interaction.options.getString("type", true);
      const logText = getLogText(type);

      const trimmed =
        logText.length > 3800
          ? `${logText.slice(-3800)}`
          : logText;

      return interaction.reply({
        content: `\`\`\`\n${trimmed || "No log data found."}\n\`\`\``,
        ephemeral: true,
      });
    }

    return interaction.reply({
      content: "Unknown subcommand.",
      ephemeral: true,
    });
  },
};
