// =========================
// commands/review.js
// DISCOVERY + UPGRADE REVIEW COMMAND
// STRICT ADMIN ONLY
// PHASE 2: PROMOTION FLOW
// =========================

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require("discord.js");

const {
  getPendingReviews,
  getApprovedReviews,
  getDeclinedReviews,
  getStagingReviews,
  getLiveReviews,
  getAllReviews,
  getReview,
  getRecentAudit,
  buildReviewProgress,
  scanForReviews,
  approveReview,
  declineReview,
  promoteReviewToStaging,
  promoteReviewToLive,
} = require("../services/discoveryReviewService");

function relTime(iso) {
  if (!iso) return "Never";
  const unix = Math.floor(new Date(iso).getTime() / 1000);
  if (!Number.isFinite(unix)) return "Never";
  return `<t:${unix}:R>`;
}

function buildReviewListEmbed(title, items, color = 0xf1c40f) {
  const text = items.length
    ? items
        .map((item) => {
          const progress = buildReviewProgress(item);
          return [
            `**${item.reviewId}**`,
            `Feature: **${item.feature}**`,
            `Type: **${item.kind}**`,
            `Status: **${item.status}**`,
            `Source: **${item.detectedType}**`,
            `File: \`${item.filePath}\``,
            `Progress: ${progress.bar}`,
            `Updated: ${relTime(item.updatedAt || item.createdAt)}`,
            "",
          ].join("\n");
        })
        .join("\n")
        .slice(0, 4096)
    : "No items found.";

  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(text)
    .setFooter({ text: "Golden Vanguard Discovery Review" })
    .setTimestamp();
}

function buildSingleReviewEmbed(item) {
  const progress = buildReviewProgress(item);

  return new EmbedBuilder()
    .setColor(
      item.status === "live"
        ? 0x2ecc71
        : item.status === "staging"
        ? 0x3498db
        : item.status === "approved"
        ? 0x27ae60
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
      { name: "Staging", value: relTime(item.stagingAt), inline: true },
      { name: "Live", value: relTime(item.liveAt), inline: true },
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
    sub.setName("pending").setDescription("View items currently under review.")
  )
  .addSubcommand((sub) =>
    sub.setName("approved").setDescription("View all approved review items.")
  )
  .addSubcommand((sub) =>
    sub.setName("staging").setDescription("View all staging review items.")
  )
  .addSubcommand((sub) =>
    sub.setName("live").setDescription("View all live review items.")
  )
  .addSubcommand((sub) =>
    sub.setName("declined").setDescription("View all declined review items.")
  )
  .addSubcommand((sub) =>
    sub.setName("all").setDescription("View all review items.")
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
    sub
      .setName("promote-staging")
      .setDescription("Promote an approved review to staging.")
      .addStringOption((o) =>
        o.setName("review_id").setDescription("Review ID").setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("promote-live")
      .setDescription("Promote a staging review to live.")
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
      await scanForReviews(interaction.client, actor);

      return interaction.editReply({
        embeds: [buildReviewListEmbed("Items Under Review", getPendingReviews(), 0xf1c40f)],
      });
    }

    if (sub === "pending") {
      return interaction.editReply({
        embeds: [buildReviewListEmbed("Items Under Review", getPendingReviews(), 0xf1c40f)],
      });
    }

    if (sub === "approved") {
      return interaction.editReply({
        embeds: [buildReviewListEmbed("Approved Review Items", getApprovedReviews(), 0x27ae60)],
      });
    }

    if (sub === "staging") {
      return interaction.editReply({
        embeds: [buildReviewListEmbed("Staging Review Items", getStagingReviews(), 0x3498db)],
      });
    }

    if (sub === "live") {
      return interaction.editReply({
        embeds: [buildReviewListEmbed("Live Review Items", getLiveReviews(), 0x2ecc71)],
      });
    }

    if (sub === "declined") {
      return interaction.editReply({
        embeds: [buildReviewListEmbed("Declined Review Items", getDeclinedReviews(), 0xe74c3c)],
      });
    }

    if (sub === "all") {
      return interaction.editReply({
        embeds: [buildReviewListEmbed("All Review Items", getAllReviews(), 0x95a5a6)],
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

    if (sub === "promote-staging") {
      const reviewId = interaction.options.getString("review_id", true);
      const item = await promoteReviewToStaging(interaction.client, reviewId, actor);

      return interaction.editReply({
        embeds: [buildSingleReviewEmbed(item)],
      });
    }

    if (sub === "promote-live") {
      const reviewId = interaction.options.getString("review_id", true);
      const item = await promoteReviewToLive(interaction.client, reviewId, actor);

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

    if (action === "promote_staging") {
      const item = await promoteReviewToStaging(interaction.client, reviewId, actor);
      await interaction.editReply({
        embeds: [buildSingleReviewEmbed(item)],
      });
      return true;
    }

    if (action === "promote_live") {
      const item = await promoteReviewToLive(interaction.client, reviewId, actor);
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