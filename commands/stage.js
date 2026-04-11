// =========================
// commands/stage.js
// STRICT ADMIN-ONLY STAGING SYSTEM
// DYNAMIC FEATURE AUTOCOMPLETE
// =========================

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require("discord.js");

const {
  VALID_STAGES,
  getAvailableFeatures,
  getFeatureStage,
  listFeatureStages,
  setFeatureStage,
  setFeatureVersion,
  setFeatureNotes,
  getRecentAudit,
} = require("../services/stagingService");

const { sendAlert } = require("../services/alertService");

function relTime(iso) {
  if (!iso) return "Never";
  const unix = Math.floor(new Date(iso).getTime() / 1000);
  if (!Number.isFinite(unix)) return "Never";
  return `<t:${unix}:R>`;
}

function stageEmoji(stage) {
  if (stage === "live") return "🟢";
  if (stage === "staging") return "🟡";
  if (stage === "dev") return "🛠";
  if (stage === "frozen") return "❄️";
  return "⚪";
}

function buildFeatureEmbed(feature, data) {
  return new EmbedBuilder()
    .setColor(
      data.stage === "live"
        ? 0x2ecc71
        : data.stage === "staging"
        ? 0xf1c40f
        : data.stage === "dev"
        ? 0x3498db
        : 0x95a5a6
    )
    .setTitle(`Stage Control — ${feature}`)
    .addFields(
      { name: "Stage", value: `${stageEmoji(data.stage)} ${data.stage}`, inline: true },
      { name: "Version", value: data.version || "Unknown", inline: true },
      { name: "Rollout Status", value: data.rolloutStatus || "Unknown", inline: true },
      { name: "Notes", value: data.notes || "None", inline: false },
      { name: "Updated By", value: data.updatedBy || "Unknown", inline: true },
      { name: "Updated", value: relTime(data.updatedAt), inline: true }
    )
    .setFooter({ text: "Golden Vanguard Staging Control" })
    .setTimestamp();
}

function buildListEmbed(items) {
  const body = items
    .map((item) =>
      [
        `**${item.feature}**`,
        `Stage: ${stageEmoji(item.stage)} ${item.stage}`,
        `Version: ${item.version || "Unknown"}`,
        `Rollout: ${item.rolloutStatus || "Unknown"}`,
        `Updated: ${relTime(item.updatedAt)}`,
        `Notes: ${item.notes || "None"}`,
        "",
      ].join("\n")
    )
    .join("\n")
    .slice(0, 4096);

  return new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle("Stage Control — All Features")
    .setDescription(body || "No stage data found.")
    .setFooter({ text: "Golden Vanguard Staging Control" })
    .setTimestamp();
}

function buildAuditEmbed(entries) {
  const body = entries.length
    ? entries
        .map((entry) =>
          [
            `**${entry.action.toUpperCase()}** — ${entry.feature}`,
            entry.stage ? `Stage: ${entry.stage}` : null,
            entry.version ? `Version: ${entry.version}` : null,
            `Actor: ${entry.actor || "Unknown"}`,
            `Notes: ${entry.notes || "None"}`,
            `When: ${relTime(entry.createdAt)}`,
            "",
          ]
            .filter(Boolean)
            .join("\n")
        )
        .join("\n")
        .slice(0, 4096)
    : "No stage changes recorded yet.";

  return new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle("Stage Audit Log")
    .setDescription(body)
    .setFooter({ text: "Golden Vanguard Staging Control" })
    .setTimestamp();
}

const stageChoices = VALID_STAGES.map((stage) => ({
  name: stage,
  value: stage,
}));

const adminData = new SlashCommandBuilder()
  .setName("stage")
  .setDescription("Strict admin-only stage control for live features.")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((sub) =>
    sub
      .setName("status")
      .setDescription("View one feature stage.")
      .addStringOption((o) =>
        o.setName("feature").setDescription("Feature name").setRequired(true).setAutocomplete(true)
      )
  )
  .addSubcommand((sub) =>
    sub.setName("list").setDescription("View all feature stages.")
  )
  .addSubcommand((sub) =>
    sub
      .setName("set")
      .setDescription("Set the stage for a feature.")
      .addStringOption((o) =>
        o.setName("feature").setDescription("Feature name").setRequired(true).setAutocomplete(true)
      )
      .addStringOption((o) =>
        o.setName("stage").setDescription("Target stage").setRequired(true).addChoices(...stageChoices)
      )
      .addStringOption((o) =>
        o.setName("version").setDescription("Version label, e.g. 1.2.0").setRequired(false)
      )
      .addStringOption((o) =>
        o.setName("notes").setDescription("Reason or rollout note").setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("version")
      .setDescription("Update feature version.")
      .addStringOption((o) =>
        o.setName("feature").setDescription("Feature name").setRequired(true).setAutocomplete(true)
      )
      .addStringOption((o) =>
        o.setName("value").setDescription("Version value").setRequired(true)
      )
      .addStringOption((o) =>
        o.setName("notes").setDescription("Optional note").setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("notes")
      .setDescription("Update feature rollout notes.")
      .addStringOption((o) =>
        o.setName("feature").setDescription("Feature name").setRequired(true).setAutocomplete(true)
      )
      .addStringOption((o) =>
        o.setName("value").setDescription("Notes").setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub.setName("audit").setDescription("View recent stage audit entries.")
  );

async function autocomplete(interaction) {
  const focused = interaction.options.getFocused(true);
  if (focused.name !== "feature") {
    return interaction.respond([]);
  }

  const q = String(focused.value || "").toLowerCase();

  const choices = getAvailableFeatures()
    .filter((feature) => feature.toLowerCase().includes(q))
    .slice(0, 25)
    .map((feature) => ({
      name: feature,
      value: feature,
    }));

  return interaction.respond(choices);
}

async function executeAdmin(interaction) {
  const sub = interaction.options.getSubcommand();
  const actor = `${interaction.user.tag} (${interaction.user.id})`;

  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ flags: 64 });
    }
  } catch (err) {
    console.error("Failed to defer stage interaction:", err);
    return;
  }

  try {
    if (sub === "status") {
      const feature = interaction.options.getString("feature", true);
      const data = getFeatureStage(feature);

      return interaction.editReply({
        embeds: [buildFeatureEmbed(feature, data)],
      });
    }

    if (sub === "list") {
      const items = listFeatureStages();

      return interaction.editReply({
        embeds: [buildListEmbed(items)],
      });
    }

    if (sub === "set") {
      const feature = interaction.options.getString("feature", true);
      const stage = interaction.options.getString("stage", true);
      const version = interaction.options.getString("version");
      const notes = interaction.options.getString("notes") || "";

      const data = setFeatureStage(feature, stage, actor, notes, version);

      await sendAlert(interaction.client, {
        title: `${feature} moved to ${stage}`,
        description: `The **${feature}** feature stage was updated by **${interaction.user.tag}**.`,
        severity: stage === "live" ? "success" : stage === "frozen" ? "warning" : "info",
        fields: [
          { name: "Feature", value: feature, inline: true },
          { name: "Stage", value: stage, inline: true },
          { name: "Version", value: data.version || "Unknown", inline: true },
          { name: "Notes", value: (notes || "None").slice(0, 1024), inline: false },
        ],
      }).catch(() => {});

      return interaction.editReply({
        embeds: [buildFeatureEmbed(feature, data)],
      });
    }

    if (sub === "version") {
      const feature = interaction.options.getString("feature", true);
      const value = interaction.options.getString("value", true);
      const notes = interaction.options.getString("notes") || "";

      const data = setFeatureVersion(feature, value, actor, notes);

      return interaction.editReply({
        embeds: [buildFeatureEmbed(feature, data)],
      });
    }

    if (sub === "notes") {
      const feature = interaction.options.getString("feature", true);
      const value = interaction.options.getString("value", true);

      const data = setFeatureNotes(feature, value, actor);

      return interaction.editReply({
        embeds: [buildFeatureEmbed(feature, data)],
      });
    }

    if (sub === "audit") {
      const entries = getRecentAudit(10);

      return interaction.editReply({
        embeds: [buildAuditEmbed(entries)],
      });
    }

    return interaction.editReply({
      content: "Unknown stage action.",
    });
  } catch (err) {
    console.error("[STAGE COMMAND ERROR]", err);

    return interaction.editReply({
      content: `❌ Stage command failed: ${err.message}`,
    });
  }
}

module.exports = {
  adminData,
  autocomplete,
  executeAdmin,
};