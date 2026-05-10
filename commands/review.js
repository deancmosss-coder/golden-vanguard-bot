// =========================
// commands/review.js
// DISCOVERY + UPGRADE REVIEW COMMAND
// STRICT ADMIN ONLY
// PHASE 4: VERSION HISTORY + HOTFIX + VERSION ROLLBACK
// FIXED: safe expired button handling
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
  getFrozenReviews,
  getAllReviews,
  getReview,
  getRecentAudit,
  buildReviewProgress,
  scanForReviews,
  approveReview,
  declineReview,
  promoteReviewToStaging,
  promoteReviewToLive,
  hotfixReviewToLive,
  rollbackReviewToStaging,
  rollbackReviewToApproved,
  rollbackReviewToPreviousVersion,
  freezeReview,
  unfreezeReview,
} = require("../services/discoveryReviewService");

const featureVersions = require("../services/featureVersionService");

function relTime(iso) {
  if (!iso) return "Never";

  const unix = Math.floor(new Date(iso).getTime() / 1000);

  if (!Number.isFinite(unix)) return "Never";

  return `<t:${unix}:R>`;
}

function isUnknownInteractionError(err) {
  return (
    err?.code === 10062 ||
    String(err?.message || "").includes("Unknown interaction") ||
    String(err?.rawError?.message || "").includes("Unknown interaction")
  );
}

function friendlyReviewErrorMessage(err) {
  const message = String(err?.message || "Unknown review error");

  if (message.includes("Only approved reviews can be promoted to staging")) {
    return "This review must be **approved** before it can be promoted to **staging**.";
  }

  if (message.includes("Only staging reviews can be promoted to live")) {
    return "This review must be in **staging** before it can be promoted to **live**.";
  }

  if (message.includes("Only live reviews can be rolled back to staging")) {
    return "This review must be **live** before it can be rolled back to **staging**.";
  }

  if (message.includes("Only staging reviews can be rolled back to approved")) {
    return "This review must be in **staging** before it can be rolled back to **approved**.";
  }

  if (message.includes("Review not found")) {
    return "Review not found. It may have been removed or already processed.";
  }

  return message;
}

async function safeDeferInteraction(interaction) {
  try {
    if (interaction.deferred || interaction.replied) return true;

    await interaction.deferReply({ flags: 64 });
    return true;
  } catch (err) {
    if (isUnknownInteractionError(err)) {
      console.warn("[REVIEW] Interaction expired before deferReply.");
      return false;
    }

    throw err;
  }
}

async function safeInteractionReply(interaction, payload) {
  try {
    if (interaction.deferred || interaction.replied) {
      return await interaction.editReply(payload);
    }

    if (typeof payload === "string") {
      return await interaction.reply({
        content: payload,
        flags: 64,
      });
    }

    return await interaction.reply({
      ...payload,
      flags: payload.flags ?? 64,
    });
  } catch (err) {
    if (isUnknownInteractionError(err)) {
      console.warn("[REVIEW] Interaction expired before reply could be sent.");
      return null;
    }

    console.error("[REVIEW SAFE REPLY ERROR]", err);
    return null;
  }
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
            `Frozen: **${item.frozen ? "Yes" : "No"}**`,
            `Current Version: **${featureVersions.getCurrentVersion(item.feature)}**`,
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
  const currentVersion = featureVersions.getCurrentVersion(item.feature);

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
        : item.status === "frozen"
        ? 0x95a5a6
        : 0xf1c40f
    )
    .setTitle(`${item.kind === "new_feature" ? "🆕" : "⬆️"} Review — ${item.feature}`)
    .addFields(
      { name: "Review ID", value: item.reviewId, inline: true },
      { name: "Status", value: item.status, inline: true },
      { name: "Type", value: item.kind, inline: true },
      { name: "Frozen", value: item.frozen ? "Yes" : "No", inline: true },
      { name: "Current Version", value: currentVersion, inline: true },
      { name: "Detected From", value: item.detectedType, inline: true },
      { name: "File", value: `\`${item.filePath}\``, inline: false },
      { name: "Progress", value: progress.bar, inline: false },
      { name: "Detected", value: relTime(item.detectedAt), inline: true },
      { name: "Approved", value: relTime(item.approvedAt), inline: true },
      { name: "Staging", value: relTime(item.stagingAt), inline: true },
      { name: "Live", value: relTime(item.liveAt), inline: true },
      { name: "Hotfix", value: relTime(item.hotfixAt), inline: true },
      { name: "Rollback", value: relTime(item.rollbackAt), inline: true },
      { name: "Rollback Target", value: item.rollbackTarget || "None", inline: true },
      { name: "Rollback Version", value: item.rollbackVersion || "None", inline: true },
      { name: "Declined", value: relTime(item.declinedAt), inline: true },
      { name: "Frozen At", value: relTime(item.frozenAt), inline: true }
    )
    .setFooter({ text: "Golden Vanguard Discovery Review" })
    .setTimestamp();
}

function buildVersionsEmbed(feature) {
  const current = featureVersions.getCurrentVersion(feature);
  const history = featureVersions.getFeatureHistory(feature, 10);

  const body = history.length
    ? history
        .map((item) =>
          [
            `**${item.version}**`,
            `Stage: ${item.stage || "unknown"}`,
            `Source: ${item.sourceAction || "manual"}`,
            `Actor: ${item.actor || "Unknown"}`,
            `Review ID: ${item.reviewId || "None"}`,
            `When: ${relTime(item.createdAt)}`,
            item.notes ? `Notes: ${item.notes}` : null,
            "",
          ]
            .filter(Boolean)
            .join("\n")
        )
        .join("\n")
    : "No version history found.";

  return new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle(`Feature Versions — ${feature}`)
    .setDescription(`**Current Version:** ${current}\n\n${body}`.slice(0, 4096))
    .setFooter({ text: "Golden Vanguard Version History" })
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
            entry.version ? `Version: ${entry.version}` : null,
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
    sub.setName("frozen").setDescription("View all frozen review items.")
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
      .setName("versions")
      .setDescription("View version history for a feature from a review.")
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
    sub
      .setName("hotfix")
      .setDescription("Apply a hotfix and promote straight to live.")
      .addStringOption((o) =>
        o.setName("review_id").setDescription("Review ID").setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("rollback-staging")
      .setDescription("Rollback a live review to staging.")
      .addStringOption((o) =>
        o.setName("review_id").setDescription("Review ID").setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("rollback-approved")
      .setDescription("Rollback a staging review to approved/dev.")
      .addStringOption((o) =>
        o.setName("review_id").setDescription("Review ID").setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("rollback-version")
      .setDescription("Rollback a live review to the previous live version.")
      .addStringOption((o) =>
        o.setName("review_id").setDescription("Review ID").setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("freeze")
      .setDescription("Freeze a review.")
      .addStringOption((o) =>
        o.setName("review_id").setDescription("Review ID").setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("unfreeze")
      .setDescription("Unfreeze a review.")
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

  const deferred = await safeDeferInteraction(interaction);
  if (!deferred) return;

  try {
    if (sub === "scan") {
      await scanForReviews(interaction.client, actor);
      return safeInteractionReply(interaction, {
        embeds: [buildReviewListEmbed("Items Under Review", getPendingReviews(), 0xf1c40f)],
      });
    }

    if (sub === "pending") {
      return safeInteractionReply(interaction, {
        embeds: [buildReviewListEmbed("Items Under Review", getPendingReviews(), 0xf1c40f)],
      });
    }

    if (sub === "approved") {
      return safeInteractionReply(interaction, {
        embeds: [buildReviewListEmbed("Approved Review Items", getApprovedReviews(), 0x27ae60)],
      });
    }

    if (sub === "staging") {
      return safeInteractionReply(interaction, {
        embeds: [buildReviewListEmbed("Staging Review Items", getStagingReviews(), 0x3498db)],
      });
    }

    if (sub === "live") {
      return safeInteractionReply(interaction, {
        embeds: [buildReviewListEmbed("Live Review Items", getLiveReviews(), 0x2ecc71)],
      });
    }

    if (sub === "frozen") {
      return safeInteractionReply(interaction, {
        embeds: [buildReviewListEmbed("Frozen Review Items", getFrozenReviews(), 0x95a5a6)],
      });
    }

    if (sub === "declined") {
      return safeInteractionReply(interaction, {
        embeds: [buildReviewListEmbed("Declined Review Items", getDeclinedReviews(), 0xe74c3c)],
      });
    }

    if (sub === "all") {
      return safeInteractionReply(interaction, {
        embeds: [buildReviewListEmbed("All Review Items", getAllReviews(), 0x95a5a6)],
      });
    }

    if (sub === "status") {
      const reviewId = interaction.options.getString("review_id", true);
      const item = getReview(reviewId);

      if (!item) return safeInteractionReply(interaction, "Review not found.");

      return safeInteractionReply(interaction, {
        embeds: [buildSingleReviewEmbed(item)],
      });
    }

    if (sub === "versions") {
      const reviewId = interaction.options.getString("review_id", true);
      const item = getReview(reviewId);

      if (!item) return safeInteractionReply(interaction, "Review not found.");

      return safeInteractionReply(interaction, {
        embeds: [buildVersionsEmbed(item.feature)],
      });
    }

    if (sub === "approve") {
      const reviewId = interaction.options.getString("review_id", true);
      const item = await approveReview(interaction.client, reviewId, actor);
      return safeInteractionReply(interaction, { embeds: [buildSingleReviewEmbed(item)] });
    }

    if (sub === "decline") {
      const reviewId = interaction.options.getString("review_id", true);
      const item = await declineReview(interaction.client, reviewId, actor);
      return safeInteractionReply(interaction, { embeds: [buildSingleReviewEmbed(item)] });
    }

    if (sub === "promote-staging") {
      const reviewId = interaction.options.getString("review_id", true);
      const item = await promoteReviewToStaging(interaction.client, reviewId, actor);
      return safeInteractionReply(interaction, { embeds: [buildSingleReviewEmbed(item)] });
    }

    if (sub === "promote-live") {
      const reviewId = interaction.options.getString("review_id", true);
      const item = await promoteReviewToLive(interaction.client, reviewId, actor);
      return safeInteractionReply(interaction, { embeds: [buildSingleReviewEmbed(item)] });
    }

    if (sub === "hotfix") {
      const reviewId = interaction.options.getString("review_id", true);
      const item = await hotfixReviewToLive(interaction.client, reviewId, actor);
      return safeInteractionReply(interaction, { embeds: [buildSingleReviewEmbed(item)] });
    }

    if (sub === "rollback-staging") {
      const reviewId = interaction.options.getString("review_id", true);
      const item = await rollbackReviewToStaging(interaction.client, reviewId, actor);
      return safeInteractionReply(interaction, { embeds: [buildSingleReviewEmbed(item)] });
    }

    if (sub === "rollback-approved") {
      const reviewId = interaction.options.getString("review_id", true);
      const item = await rollbackReviewToApproved(interaction.client, reviewId, actor);
      return safeInteractionReply(interaction, { embeds: [buildSingleReviewEmbed(item)] });
    }

    if (sub === "rollback-version") {
      const reviewId = interaction.options.getString("review_id", true);
      const item = await rollbackReviewToPreviousVersion(interaction.client, reviewId, actor);
      return safeInteractionReply(interaction, { embeds: [buildSingleReviewEmbed(item)] });
    }

    if (sub === "freeze") {
      const reviewId = interaction.options.getString("review_id", true);
      const item = await freezeReview(interaction.client, reviewId, actor);
      return safeInteractionReply(interaction, { embeds: [buildSingleReviewEmbed(item)] });
    }

    if (sub === "unfreeze") {
      const reviewId = interaction.options.getString("review_id", true);
      const item = await unfreezeReview(interaction.client, reviewId, actor);
      return safeInteractionReply(interaction, { embeds: [buildSingleReviewEmbed(item)] });
    }

    if (sub === "audit") {
      return safeInteractionReply(interaction, {
        embeds: [buildAuditEmbed(getRecentAudit(10))],
      });
    }

    return safeInteractionReply(interaction, "Unknown review action.");
  } catch (err) {
    console.error("[REVIEW COMMAND ERROR]", err);
    return safeInteractionReply(
      interaction,
      `❌ Review command failed: ${friendlyReviewErrorMessage(err)}`
    );
  }
}

async function handleButton(interaction) {
  const parts = String(interaction.customId || "").split(":");
  if (parts[0] !== "review") return false;

  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await safeInteractionReply(interaction, "Admin only.");
    return true;
  }

  const action = parts[1];
  const reviewId = parts[2];
  const actor = `${interaction.user.tag} (${interaction.user.id})`;

  const deferred = await safeDeferInteraction(interaction);
  if (!deferred) return true;

  try {
    let item = null;

    if (action === "approve") {
      item = await approveReview(interaction.client, reviewId, actor);
    } else if (action === "decline") {
      item = await declineReview(interaction.client, reviewId, actor);
    } else if (action === "promote_staging") {
      item = await promoteReviewToStaging(interaction.client, reviewId, actor);
    } else if (action === "promote_live") {
      item = await promoteReviewToLive(interaction.client, reviewId, actor);
    } else if (action === "hotfix_live") {
      item = await hotfixReviewToLive(interaction.client, reviewId, actor);
    } else if (action === "rollback_staging") {
      item = await rollbackReviewToStaging(interaction.client, reviewId, actor);
    } else if (action === "rollback_approved") {
      item = await rollbackReviewToApproved(interaction.client, reviewId, actor);
    } else if (action === "rollback_version") {
      item = await rollbackReviewToPreviousVersion(interaction.client, reviewId, actor);
    } else if (action === "freeze") {
      item = await freezeReview(interaction.client, reviewId, actor);
    } else if (action === "unfreeze") {
      item = await unfreezeReview(interaction.client, reviewId, actor);
    } else {
      await safeInteractionReply(interaction, "Unknown review button action.");
      return true;
    }

    await safeInteractionReply(interaction, {
      embeds: [buildSingleReviewEmbed(item)],
    });

    return true;
  } catch (err) {
    console.error("[REVIEW BUTTON ERROR]", err);

    await safeInteractionReply(
      interaction,
      `❌ Review action failed: ${friendlyReviewErrorMessage(err)}`
    );

    return true;
  }
}

module.exports = {
  adminData,
  executeAdmin,
  handleButton,
};
