// =========================
// commands/deploy.js
// STRICT ADMIN-ONLY DEPLOYMENT SYSTEM
// =========================

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require("discord.js");

const {
  VALID_FEATURES,
  getFeatureStatus,
  listAllFeatureStatuses,
  enableFeature,
  disableFeature,
  resetFeature,
  getRecentAudit,
} = require("../services/deploymentService");

const { sendAlert } = require("../services/alertService");

function relTime(iso) {
  if (!iso) return "Never";
  const unix = Math.floor(new Date(iso).getTime() / 1000);
  if (!Number.isFinite(unix)) return "Never";
  return `<t:${unix}:R>`;
}

function buildFeatureEmbed(feature, state) {
  return new EmbedBuilder()
    .setColor(state.enabled === false ? 0xe74c3c : 0x2ecc71)
    .setTitle(`Deployment Control — ${feature}`)
    .addFields(
      {
        name: "Enabled",
        value: state.enabled === false ? "❌ No" : "✅ Yes",
        inline: true,
      },
      {
        name: "Failures",
        value: String(state.failCount || 0),
        inline: true,
      },
      {
        name: "Paused Reason",
        value: state.pausedReason || "None",
        inline: false,
      },
      {
        name: "Last Success",
        value: relTime(state.lastSuccessAt),
        inline: true,
      },
      {
        name: "Last Error",
        value: state.lastError || "None",
        inline: true,
      },
      {
        name: "Last Error At",
        value: relTime(state.lastErrorAt),
        inline: true,
      }
    )
    .setFooter({ text: "Golden Vanguard Deployment Control" })
    .setTimestamp();
}

function buildListEmbed(items) {
  const lines = items.map((item) =>
    [
      `**${item.feature}**`,
      `${item.enabled === false ? "❌ Disabled" : "✅ Enabled"}`,
      `Failures: ${item.failCount || 0}`,
      `Last Success: ${relTime(item.lastSuccessAt)}`,
      `Last Error: ${item.lastError || "None"}`,
      `Paused Reason: ${item.pausedReason || "None"}`,
      "",
    ].join("\n")
  );

  return new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle("Deployment Control — All Features")
    .setDescription(lines.join("\n").slice(0, 4096))
    .setFooter({ text: "Golden Vanguard Deployment Control" })
    .setTimestamp();
}

function buildAuditEmbed(entries) {
  const description = entries.length
    ? entries
        .map((entry) =>
          [
            `**${entry.action.toUpperCase()}** — ${entry.feature}`,
            `Actor: ${entry.actor || "Unknown"}`,
            `Reason: ${entry.reason || "None"}`,
            `When: ${relTime(entry.createdAt)}`,
            "",
          ].join("\n")
        )
        .join("\n")
        .slice(0, 4096)
    : "No deployment actions recorded yet.";

  return new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle("Deployment Audit Log")
    .setDescription(description)
    .setFooter({ text: "Golden Vanguard Deployment Control" })
    .setTimestamp();
}

const featureChoices = VALID_FEATURES.map((feature) => ({
  name: feature,
  value: feature,
}));

const adminData = new SlashCommandBuilder()
  .setName("deploy")
  .setDescription("Strict admin-only deployment controls for live features.")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((sub) =>
    sub
      .setName("status")
      .setDescription("View one feature status.")
      .addStringOption((o) =>
        o
          .setName("feature")
          .setDescription("Feature name")
          .setRequired(true)
          .addChoices(...featureChoices)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("list")
      .setDescription("View all feature statuses.")
  )
  .addSubcommand((sub) =>
    sub
      .setName("enable")
      .setDescription("Enable a feature.")
      .addStringOption((o) =>
        o
          .setName("feature")
          .setDescription("Feature name")
          .setRequired(true)
          .addChoices(...featureChoices)
      )
      .addStringOption((o) =>
        o
          .setName("reason")
          .setDescription("Why you are enabling it")
          .setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("disable")
      .setDescription("Disable a feature.")
      .addStringOption((o) =>
        o
          .setName("feature")
          .setDescription("Feature name")
          .setRequired(true)
          .addChoices(...featureChoices)
      )
      .addStringOption((o) =>
        o
          .setName("reason")
          .setDescription("Why you are disabling it")
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("reset")
      .setDescription("Reset failure count and status for a feature.")
      .addStringOption((o) =>
        o
          .setName("feature")
          .setDescription("Feature name")
          .setRequired(true)
          .addChoices(...featureChoices)
      )
      .addStringOption((o) =>
        o
          .setName("reason")
          .setDescription("Why you are resetting it")
          .setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("audit")
      .setDescription("View recent deployment actions.")
  );

async function executeAdmin(interaction) {
  const sub = interaction.options.getSubcommand();
  const actor = `${interaction.user.tag} (${interaction.user.id})`;

  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ flags: 64 });
    }
  } catch (err) {
    console.error("Failed to defer interaction:", err);
    return;
  }

  try {
    if (sub === "status") {
      const feature = interaction.options.getString("feature", true);
      const state = getFeatureStatus(feature);

      return interaction.editReply({
        embeds: [buildFeatureEmbed(feature, state)],
      });
    }

    if (sub === "list") {
      const items = listAllFeatureStatuses();

      return interaction.editReply({
        embeds: [buildListEmbed(items)],
      });
    }

    if (sub === "enable") {
      const feature = interaction.options.getString("feature", true);
      const reason =
        interaction.options.getString("reason") || "Enabled manually by administrator";

      const { state } = enableFeature(feature, actor, reason);

      await sendAlert(interaction.client, {
        title: `${feature} enabled`,
        description: `The **${feature}** feature was enabled by **${interaction.user.tag}**.`,
        severity: "success",
        fields: [
          { name: "Feature", value: feature, inline: true },
          { name: "Reason", value: reason.slice(0, 1024), inline: false },
        ],
      }).catch(() => {});

      return interaction.editReply({
        embeds: [buildFeatureEmbed(feature, state)],
      });
    }

    if (sub === "disable") {
      const feature = interaction.options.getString("feature", true);
      const reason = interaction.options.getString("reason", true);

      const { state } = disableFeature(feature, actor, reason);

      await sendAlert(interaction.client, {
        title: `${feature} disabled`,
        description: `The **${feature}** feature was disabled by **${interaction.user.tag}**.`,
        severity: "warning",
        fields: [
          { name: "Feature", value: feature, inline: true },
          { name: "Reason", value: reason.slice(0, 1024), inline: false },
        ],
      }).catch(() => {});

      return interaction.editReply({
        embeds: [buildFeatureEmbed(feature, state)],
      });
    }

    if (sub === "reset") {
      const feature = interaction.options.getString("feature", true);
      const reason =
        interaction.options.getString("reason") || "Reset manually by administrator";

      const { state } = resetFeature(feature, actor, reason);

      await sendAlert(interaction.client, {
        title: `${feature} reset`,
        description: `The **${feature}** feature was reset by **${interaction.user.tag}**.`,
        severity: "success",
        fields: [
          { name: "Feature", value: feature, inline: true },
          { name: "Reason", value: reason.slice(0, 1024), inline: false },
        ],
      }).catch(() => {});

      return interaction.editReply({
        embeds: [buildFeatureEmbed(feature, state)],
      });
    }

    if (sub === "audit") {
      const entries = getRecentAudit(10);

      return interaction.editReply({
        embeds: [buildAuditEmbed(entries)],
      });
    }

    return interaction.editReply({
      content: "Unknown deployment action.",
    });
  } catch (err) {
    console.error("[DEPLOY COMMAND ERROR]", err);

    return interaction.editReply({
      content: `❌ Deployment command failed: ${err.message}`,
    });
  }
}

module.exports = {
  adminData,
  executeAdmin,
};