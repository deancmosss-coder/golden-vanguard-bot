// commands/system.js
const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} = require("discord.js");

const registry = require("../services/featureRegistry");
const logger = require("../services/logger");
const {
  getAllManagedFeatureNames,
  hasManagedFeature,
} = require("../services/managedFeatureStore");

const STATUS_FIELDS_PER_EMBED = 12;
const MAX_STATUS_EMBEDS = 10;
const MAX_TEXT_LENGTH = 180;

function formatDate(value) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Invalid date";
  return `<t:${Math.floor(date.getTime() / 1000)}:R>`;
}

function truncateText(value, fallback = "None") {
  const text = String(value || fallback);
  if (text.length <= MAX_TEXT_LENGTH) {
    return text;
  }

  return `${text.slice(0, MAX_TEXT_LENGTH - 3)}...`;
}

function chunkItems(items, size) {
  const chunks = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function buildSummaryFields(entries) {
  const enabledCount = entries.filter(([, state]) => state.enabled !== false).length;
  const disabledCount = entries.length - enabledCount;
  const failingCount = entries.filter(([, state]) => Number(state.failCount || 0) > 0).length;

  return [
    { name: "Total Features", value: String(entries.length), inline: true },
    { name: "Enabled", value: String(enabledCount), inline: true },
    { name: "Disabled", value: String(disabledCount), inline: true },
    { name: "With Failures", value: String(failingCount), inline: true },
  ];
}

function buildStatusEmbeds() {
  const features = registry.getAllFeatures();
  const entries = Object.entries(features).sort((a, b) => a[0].localeCompare(b[0]));

  if (!entries.length) {
    return [
      new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle("System Status")
        .setDescription("No protected features are registered yet.")
        .setTimestamp()
        .setFooter({ text: "The Golden Vanguard" }),
    ];
  }

  const chunks = chunkItems(entries, STATUS_FIELDS_PER_EMBED);
  const embeds = chunks.slice(0, MAX_STATUS_EMBEDS).map((chunk, index) => {
    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle(index === 0 ? "System Status" : `System Status (Page ${index + 1})`)
      .setTimestamp()
      .setFooter({ text: "The Golden Vanguard" });

    if (index === 0) {
      embed.setDescription("Current protected feature states");
      embed.addFields(...buildSummaryFields(entries));
    }

    for (const [featureName, state] of chunk) {
      const status = state.enabled !== false ? "Enabled" : "Disabled";
      const failCount = Number(state.failCount || 0);

      embed.addFields({
        name: featureName,
        value:
          `Status: **${status}**\n` +
          `Failures: **${failCount}**\n` +
          `Last Success: **${formatDate(state.lastSuccessAt)}**\n` +
          `Last Error: **${truncateText(state.lastError)}**\n` +
          `Paused Reason: **${truncateText(state.pausedReason)}**`,
        inline: false,
      });
    }

    return embed;
  });

  if (chunks.length > MAX_STATUS_EMBEDS && embeds.length) {
    const shown = STATUS_FIELDS_PER_EMBED * MAX_STATUS_EMBEDS;
    embeds[embeds.length - 1].addFields({
      name: "Additional Features",
      value: `Showing ${shown} of ${entries.length} features in Discord.`,
      inline: false,
    });
  }

  return embeds;
}

function buildFeatureEmbed(title, featureName, state, color = 0xf1c40f) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .addFields(
      { name: "Feature", value: featureName, inline: true },
      { name: "Enabled", value: state.enabled ? "Yes" : "No", inline: true },
      { name: "Fail Count", value: String(state.failCount || 0), inline: true },
      { name: "Last Error", value: truncateText(state.lastError), inline: false },
      { name: "Paused Reason", value: truncateText(state.pausedReason), inline: false },
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

function ensureManagedFeature(featureName) {
  if (hasManagedFeature(featureName)) {
    return null;
  }

  return {
    content: `Unknown protected feature: \`${featureName}\`. Use the feature autocomplete to select a managed system.`,
    ephemeral: true,
  };
}

async function autocomplete(interaction) {
  const focused = interaction.options.getFocused(true);
  if (focused.name !== "feature") {
    return interaction.respond([]);
  }

  const query = String(focused.value || "").toLowerCase();

  const choices = getAllManagedFeatureNames()
    .filter((feature) => feature.toLowerCase().includes(query))
    .slice(0, 25)
    .map((feature) => ({
      name: feature,
      value: feature,
    }));

  return interaction.respond(choices);
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
            .setAutocomplete(true)
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
            .setAutocomplete(true)
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
            .setAutocomplete(true)
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

  autocomplete,

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "status") {
      const embeds = buildStatusEmbeds();
      return interaction.reply({
        embeds,
        ephemeral: true,
      });
    }

    if (subcommand === "enable") {
      const feature = interaction.options.getString("feature", true);
      const invalid = ensureManagedFeature(feature);
      if (invalid) return interaction.reply(invalid);

      const state = registry.enableFeature(feature);

      return interaction.reply({
        embeds: [
          buildFeatureEmbed("Feature Enabled", feature, state, 0x2ecc71),
        ],
        ephemeral: true,
      });
    }

    if (subcommand === "disable") {
      const feature = interaction.options.getString("feature", true);
      const invalid = ensureManagedFeature(feature);
      if (invalid) return interaction.reply(invalid);

      const reason =
        interaction.options.getString("reason") || "Disabled manually by admin";

      const state = registry.disableFeature(feature, reason);

      return interaction.reply({
        embeds: [
          buildFeatureEmbed("Feature Disabled", feature, state, 0xe74c3c),
        ],
        ephemeral: true,
      });
    }

    if (subcommand === "reset") {
      const feature = interaction.options.getString("feature", true);
      const invalid = ensureManagedFeature(feature);
      if (invalid) return interaction.reply(invalid);

      const state = registry.resetFeature(feature);

      return interaction.reply({
        embeds: [
          buildFeatureEmbed("Feature Reset", feature, state, 0x3498db),
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