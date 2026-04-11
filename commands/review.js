// =========================
// commands/review.js
// DISCOVERY + UPGRADE REVIEW COMMAND
// STRICT ADMIN ONLY
// =========================

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require("discord.js");

const {
  getPendingReviews,
  getReview,
  getRecentAudit,
  buildReviewProgress,
  scanForReviews,
  approveReview,
  declineReview,
} = require("../services/discoveryReviewService");

function relTime(iso) {
  if (!iso) return "Never";
  const unix = Math.floor(new Date(iso).getTime() / 1000);
  if (!Number.isFinite(unix)) return "Never";
  return `<t:${unix}:R>`;
}

function buildPendingEmbed(items) {
  const text = items.length
    ? items
        .map((item) => {
          const progress = buildReviewProgress(item);
          return [
            `**${item.reviewId}**`,
            `Feature: **${item.feature}**`,
            `Type: **${item.kind}**`,
            `Source: **${item.detectedType}**`,
            `File: \`${item.filePath}\``,
            `Progress: ${progress.bar}`,
            `Detected: ${relTime(item.detectedAt)}`,
            "",
          ].join("\n");
        })
        .join("\n")
        .slice(0, 4096)
    : "No pending discovery reviews.";

  return new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle("Pending Discovery Reviews")
    .setDescription(text)
    .setFooter({ text: "Golden Vanguard Discovery Review" })
    .setTimestamp();
}

function buildSingleReviewEmbed(item) {
  const progress = buildReviewProgress(item);

  return new EmbedBuilder()
    .setColor(
      item.status === "approved"
        ? 0x2ecc71
        : item.status === "declined"
        ? 0xe74c3c
        : 0xf1c40f
    )
    .setTitle(`${item.kind === "new_feature" ? "🆕" : "⬆️"} Review — ${item.feature}`)
    .addFields(
      { name: "Review ID", value: item.reviewId, inline: true },
      { name: "Status", value: item.status, inline: true },
      { name: "Type", value: item.kind, inline: true },
      { name: "Detected From", value: item.detectedType, inline: true },
      { name: "File", value: `\`${item.filePath}\``, inline: false },
      { name: "Progress", value: progress.bar, inline: false },
      { name: "Detected", value: relTime(item.detectedAt), inline: true },
      { name: "Approved", value: relTime(item.approvedAt), inline: true },
      { name: "Declined", value: relTime(item.declinedAt), inline: true }
    )
    .setFooter({ text: "Golden Vanguard Discovery Review" })
    .setTimestamp();
}

function buildAuditEmbed(entries) {
  const text = entries.length
    ? entries
        .map((entry) =>
          [
            `**${entry.action}** — ${entry.feature || "Unknown"}`,
            `Actor: ${entry.actor || "Unknown"}`,
            entry.filePath ? `File: \`${entry.filePath}\`` : null,
            `When: ${relTime(entry.createdAt)}`,
            "",
          ]
            .filter(Boolean)
            .join("\n")
        )
        .join("\n")
        .slice(0, 4096)
    : "No discovery review audit entries yet.";

  return new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle("Discovery Review Audit")
    .setDescription(text)
    .setFooter({ text: "Golden Vanguard Discovery Review" })
    .setTimestamp();
}

const adminData = new SlashCommandBuilder()
  .setName("review")
  .setDescription("Discovery and upgrade review controls.")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((sub) =>
    sub.setName("scan").setDescription("Scan the bot for new features and upgrades.")
  )
  .addSubcommand((sub) =>
    sub.setName("pending").setDescription("View pending discovery reviews.")
  )
  .addSubcommand((sub) =>
    sub
      .setName("status")
      .setDescription("View one review card status.")
      .addStringOption((o) =>
        o.setName("review_id").setDescription("Review ID").setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("approve")
      .setDescription("Approve a pending review.")
      .addStringOption((o) =>
        o.setName("review_id").setDescription("Review ID").setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("decline")
      .setDescription("Decline a pending review.")
      .addStringOption((o) =>
        o.setName("review_id").setDescription("Review ID").setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub.setName("audit").setDescription("View discovery review audit.")
  );

async function executeAdmin(interaction) {
  const sub = interaction.options.getSubcommand();
  const actor = `${interaction.user.tag} (${interaction.user.id})`;

  await interaction.deferReply({ flags: 64 });

  try {
    if (sub === "scan") {
      const created = await scanForReviews(interaction.client, actor);

      if (!created.length) {
        return interaction.editReply("✅ Scan complete. No new discovery or upgrade reviews were created.");
      }

      return interaction.editReply({
        embeds: [buildPendingEmbed(getPendingReviews())],
      });
    }

    if (sub === "pending") {
      return interaction.editReply({
        embeds: [buildPendingEmbed(getPendingReviews())],
      });
    }

    if (sub === "status") {
      const reviewId = interaction.options.getString("review_id", true);
      const item = getReview(reviewId);

      if (!item) {
        return interaction.editReply("Review not found.");
      }

      return interaction.editReply({
        embeds: [buildSingleReviewEmbed(item)],
      });
    }

    if (sub === "approve") {
      const reviewId = interaction.options.getString("review_id", true);
      const item = await approveReview(interaction.client, reviewId, actor);

      return interaction.editReply({
        embeds: [buildSingleReviewEmbed(item)],
      });
    }

    if (sub === "decline") {
      const reviewId = interaction.options.getString("review_id", true);
      const item = await declineReview(interaction.client, reviewId, actor);

      return interaction.editReply({
        embeds: [buildSingleReviewEmbed(item)],
      });
    }

    if (sub === "audit") {
      return interaction.editReply({
        embeds: [buildAuditEmbed(getRecentAudit(10))],
      });
    }

    return interaction.editReply("Unknown review action.");
  } catch (err) {
    console.error("[REVIEW COMMAND ERROR]", err);
    return interaction.editReply(`❌ Review command failed: ${err.message}`);
  }
}

async function handleButton(interaction) {
  const parts = String(interaction.customId || "").split(":");
  if (parts[0] !== "review") return false;

  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({
      content: "Admin only.",
      flags: 64,
    });
    return true;
  }

  const action = parts[1];
  const reviewId = parts[2];
  const actor = `${interaction.user.tag} (${interaction.user.id})`;

  await interaction.deferReply({ flags: 64 });

  try {
    if (action === "approve") {
      const item = await approveReview(interaction.client, reviewId, actor);
      await interaction.editReply({
        embeds: [buildSingleReviewEmbed(item)],
      });
      return true;
    }

    if (action === "decline") {
      const item = await declineReview(interaction.client, reviewId, actor);
      await interaction.editReply({
        embeds: [buildSingleReviewEmbed(item)],
      });
      return true;
    }

    await interaction.editReply("Unknown review button action.");
    return true;
  } catch (err) {
    console.error("[REVIEW BUTTON ERROR]", err);
    await interaction.editReply(`❌ Review action failed: ${err.message}`);
    return true;
  }
}

module.exports = {
  adminData,
  executeAdmin,
  handleButton,
};