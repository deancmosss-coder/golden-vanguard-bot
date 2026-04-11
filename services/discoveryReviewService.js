// =========================
// services/discoveryReviewService.js
// AUTO DISCOVERY + UPGRADE REVIEW SYSTEM
// PHASE 4: VERSION HISTORY + HOTFIX + VERSION ROLLBACK
// =========================

const fs = require("fs");
const path = require("path");

const {
  addManagedFeature,
  hasManagedFeature,
  getManagedFeature,
  sanitiseFeatureName,
} = require("./managedFeatureStore");

const registry = require("./featureRegistry");
const stagingService = require("./stagingService");
const patchNotes = require("./patchNotesService");
const featureVersions = require("./featureVersionService");

const STATE_PATH = path.join(__dirname, "..", "data", "discoveryReviewState.json");

const BOT_STATUS_CHANNEL_ID = (process.env.BOT_STATUS_CHANNEL_ID || "").trim();
const BOT_RELEASE_CHANNEL_ID = (process.env.BOT_RELEASE_CHANNEL_ID || "").trim();

function createDefaultState() {
  return {
    files: {},
    reviews: {},
    audit: [],
  };
}

function ensureFile() {
  if (!fs.existsSync(STATE_PATH)) {
    fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
    fs.writeFileSync(STATE_PATH, JSON.stringify(createDefaultState(), null, 2), "utf8");
  }
}

function readState() {
  ensureFile();

  try {
    const raw = fs.readFileSync(STATE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    const base = createDefaultState();

    return {
      ...base,
      ...(parsed || {}),
      files: parsed?.files || {},
      reviews: parsed?.reviews || {},
      audit: Array.isArray(parsed?.audit) ? parsed.audit : [],
    };
  } catch {
    return createDefaultState();
  }
}

function writeState(state) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), "utf8");
}

function addAuditEntry(state, entry) {
  state.audit.unshift({
    id: `DISC-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    createdAt: new Date().toISOString(),
    ...entry,
  });

  state.audit = state.audit.slice(0, 250);
}

function getRecentAudit(limit = 10) {
  const state = readState();
  const max = Math.max(1, Math.min(Number(limit) || 10, 25));
  return state.audit.slice(0, max);
}

function getReview(reviewId) {
  const state = readState();
  return state.reviews[reviewId] || null;
}

function getAllReviews() {
  const state = readState();

  return Object.values(state.reviews).sort(
    (a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)
  );
}

function getReviewsByStatus(status) {
  const wanted = String(status || "").trim().toLowerCase();

  return getAllReviews().filter(
    (review) => String(review.status || "").trim().toLowerCase() === wanted
  );
}

function getPendingReviews() {
  return getReviewsByStatus("pending");
}

function getApprovedReviews() {
  return getReviewsByStatus("approved");
}

function getDeclinedReviews() {
  return getReviewsByStatus("declined");
}

function getStagingReviews() {
  return getReviewsByStatus("staging");
}

function getLiveReviews() {
  return getReviewsByStatus("live");
}

function getFrozenReviews() {
  return getReviewsByStatus("frozen");
}

function progressBar(percent) {
  const value = Math.max(0, Math.min(Number(percent) || 0, 100));
  const total = 10;
  const filled = Math.round((value / 100) * total);
  return `${"█".repeat(filled)}${"░".repeat(total - filled)} ${value}%`;
}

function buildReviewProgress(item) {
  let percent = 20;
  let label = "Detected";

  if (item.status === "pending") {
    percent = 20;
    label = "Pending Review";
  }

  if (item.status === "approved") {
    percent = 40;
    label = "Approved";
  }

  if (item.status === "staging") {
    percent = 70;
    label = "In Staging";
  }

  if (item.status === "live") {
    percent = 100;
    label = "Live";
  }

  if (item.status === "declined") {
    percent = 0;
    label = "Declined";
  }

  if (item.status === "frozen") {
    percent = 10;
    label = "Frozen";
  }

  return {
    percent,
    label,
    bar: progressBar(percent),
  };
}

function inferFeatureName(filePath) {
  const base = path.basename(filePath, ".js");

  let name = base
    .replace(/^refresh/i, "")
    .replace(/System$/i, "")
    .replace(/Service$/i, "")
    .replace(/Board$/i, "")
    .replace(/Manager$/i, "")
    .replace(/Controller$/i, "");

  if (/^run$/i.test(name)) name = "tracker";
  if (/^enlistment$/i.test(name)) name = "enlistment";
  if (/^deploy$/i.test(name)) name = "registry";
  if (/^stage$/i.test(name)) name = "registry";
  if (/^orientation$/i.test(name)) name = "orientation";
  if (/^playerStats$/i.test(name)) name = "playerStats";
  if (/^voiceHubs$/i.test(name)) name = "askToPlay";
  if (/^warSync$/i.test(name)) name = "warboard";
  if (/^operationsBoard$/i.test(name)) name = "warboard";
  if (/^review$/i.test(name)) name = "registry";
  if (/^patch$/i.test(name)) name = "registry";

  name = name.charAt(0).toLowerCase() + name.slice(1);
  return sanitiseFeatureName(name);
}

function detectType(filePath) {
  const normal = filePath.replace(/\\/g, "/");

  if (normal.includes("/commands/")) return "command";
  if (normal.includes("/services/")) return "service";
  if (normal.includes("/jobs/")) return "job";
  return "file";
}

function getScanTargets(rootDir) {
  return [
    path.join(rootDir, "commands"),
    path.join(rootDir, "services"),
    path.join(rootDir, "jobs"),
  ];
}

function shouldIncludeFile(filePath) {
  const normal = filePath.replace(/\\/g, "/");
  if (!normal.endsWith(".js")) return false;

  const excluded = ["/node_modules/", "/data/"];
  if (excluded.some((part) => normal.includes(part))) return false;

  const fileName = path.basename(normal);

  if (fileName === "deploy-commands.js") return false;
  if (fileName === "index.js") return false;

  return true;
}

function walkJsFiles(dir, bucket = []) {
  if (!fs.existsSync(dir)) return bucket;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      walkJsFiles(full, bucket);
      continue;
    }

    if (entry.isFile() && shouldIncludeFile(full)) {
      bucket.push(full);
    }
  }

  return bucket;
}

function fileSignature(filePath) {
  const stat = fs.statSync(filePath);
  return `${stat.size}:${Math.floor(stat.mtimeMs)}`;
}

function makeRelative(rootDir, filePath) {
  return path.relative(rootDir, filePath).replace(/\\/g, "/");
}

function createReviewCard(review) {
  const progress = buildReviewProgress(review);
  const currentVersion = featureVersions.getCurrentVersion(review.feature);

  return {
    title:
      review.kind === "new_feature"
        ? `🆕 Feature Review — ${review.feature}`
        : `⬆️ Upgrade Review — ${review.feature}`,
    description: [
      `**Review ID:** ${review.reviewId}`,
      `**Feature:** ${review.feature}`,
      `**Type:** ${review.kind === "new_feature" ? "New Feature" : "Upgrade"}`,
      `**Detected From:** ${review.detectedType}`,
      `**File:** \`${review.filePath}\``,
      `**Status:** ${review.status}`,
      `**Progress:** ${progress.bar}`,
      `**Pipeline:** ${progress.label}`,
      "",
      `**Current Stage:** ${review.stage || "dev"}`,
      `**Current Version:** ${currentVersion}`,
      `**Enabled By Default:** No`,
      `**Frozen:** ${review.frozen ? "Yes" : "No"}`,
      `**Notes:** ${review.notes || "Auto-detected review pending approval."}`,
    ].join("\n"),
  };
}

async function sendReleaseAnnouncement(client, payload) {
  if (!BOT_RELEASE_CHANNEL_ID) return null;

  const channel = await client.channels.fetch(BOT_RELEASE_CHANNEL_ID).catch(() => null);
  if (!channel?.isTextBased?.()) return null;

  return channel.send(payload).catch(() => null);
}

async function postOrUpdateReviewCard(client, reviewId) {
  if (!BOT_STATUS_CHANNEL_ID) return null;

  const state = readState();
  const review = state.reviews[reviewId];
  if (!review) return null;

  const channel = await client.channels.fetch(BOT_STATUS_CHANNEL_ID).catch(() => null);
  if (!channel?.isTextBased?.()) return null;

  const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

  const card = createReviewCard(review);

  let color = 0xf1c40f;
  if (review.status === "live") color = 0x2ecc71;
  else if (review.status === "staging") color = 0x3498db;
  else if (review.status === "approved") color = 0x27ae60;
  else if (review.status === "declined") color = 0xe74c3c;
  else if (review.status === "frozen") color = 0x95a5a6;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(card.title)
    .setDescription(card.description)
    .setFooter({ text: "Golden Vanguard Discovery Review" })
    .setTimestamp(new Date(review.updatedAt || review.createdAt || Date.now()));

  let components = [];

  if (review.status === "pending") {
    components = [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`review:approve:${review.reviewId}`)
          .setLabel("Approve")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`review:decline:${review.reviewId}`)
          .setLabel("Decline")
          .setStyle(ButtonStyle.Danger)
      ),
    ];
  }

  if (review.status === "approved" && !review.frozen) {
    components = [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`review:promote_staging:${review.reviewId}`)
          .setLabel("Promote to Staging")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`review:hotfix_live:${review.reviewId}`)
          .setLabel("Hotfix to Live")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`review:freeze:${review.reviewId}`)
          .setLabel("Freeze")
          .setStyle(ButtonStyle.Secondary)
      ),
    ];
  }

  if (review.status === "staging" && !review.frozen) {
    components = [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`review:promote_live:${review.reviewId}`)
          .setLabel("Promote to Live")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`review:rollback_approved:${review.reviewId}`)
          .setLabel("Rollback to Approved")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`review:hotfix_live:${review.reviewId}`)
          .setLabel("Hotfix to Live")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`review:freeze:${review.reviewId}`)
          .setLabel("Freeze")
          .setStyle(ButtonStyle.Secondary)
      ),
    ];
  }

  if (review.status === "live" && !review.frozen) {
    components = [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`review:rollback_staging:${review.reviewId}`)
          .setLabel("Rollback to Staging")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`review:rollback_version:${review.reviewId}`)
          .setLabel("Rollback Version")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`review:hotfix_live:${review.reviewId}`)
          .setLabel("Hotfix to Live")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`review:freeze:${review.reviewId}`)
          .setLabel("Freeze")
          .setStyle(ButtonStyle.Secondary)
      ),
    ];
  }

  if (review.frozen || review.status === "frozen") {
    components = [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`review:unfreeze:${review.reviewId}`)
          .setLabel("Unfreeze")
          .setStyle(ButtonStyle.Success)
      ),
    ];
  }

  let message = null;

  if (review.messageId) {
    message = await channel.messages.fetch(review.messageId).catch(() => null);
  }

  if (!message) {
    message = await channel.send({ embeds: [embed], components }).catch(() => null);

    if (message) {
      review.messageId = message.id;
      review.channelId = channel.id;
      review.updatedAt = new Date().toISOString();
      writeState(state);
    }

    return message;
  }

  await message.edit({
    embeds: [embed],
    components,
  }).catch(() => null);

  return message;
}

function upsertReview(state, payload) {
  const existingPending = Object.values(state.reviews).find(
    (r) =>
      r.feature === payload.feature &&
      r.filePath === payload.filePath &&
      r.kind === payload.kind &&
      r.status === "pending"
  );

  if (existingPending) {
    existingPending.updatedAt = new Date().toISOString();
    existingPending.signature = payload.signature;
    existingPending.notes = payload.notes || existingPending.notes;
    return existingPending;
  }

  const reviewId = `REV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  state.reviews[reviewId] = {
    reviewId,
    feature: payload.feature,
    kind: payload.kind,
    filePath: payload.filePath,
    detectedType: payload.detectedType,
    signature: payload.signature,
    status: "pending",
    stage: "dev",
    notes: payload.notes || "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    detectedAt: new Date().toISOString(),
    messageId: null,
    channelId: null,
    registeredAt: null,
    stageCreatedAt: null,
    deployReadyAt: null,
    approvedAt: null,
    approvedBy: null,
    declinedAt: null,
    declinedBy: null,
    stagingAt: null,
    stagingBy: null,
    liveAt: null,
    liveBy: null,
    hotfixAt: null,
    hotfixBy: null,
    rollbackAt: null,
    rollbackBy: null,
    rollbackTarget: null,
    rollbackVersion: null,
    frozen: false,
    frozenAt: null,
    frozenBy: null,
  };

  return state.reviews[reviewId];
}

async function scanForReviews(client, actor = "Unknown") {
  const rootDir = path.join(__dirname, "..");
  const state = readState();

  const files = [];
  for (const dir of getScanTargets(rootDir)) {
    walkJsFiles(dir, files);
  }

  const created = [];

  for (const fullPath of files) {
    const relativePath = makeRelative(rootDir, fullPath);
    const signature = fileSignature(fullPath);
    const detectedType = detectType(relativePath);
    const feature = inferFeatureName(relativePath);

    if (!feature) continue;

    const previous = state.files[relativePath];
    const approvedFeature = hasManagedFeature(feature);
    const featureMeta = getManagedFeature(feature);

    if (!previous) {
      state.files[relativePath] = {
        feature,
        signature,
        lastSeenAt: new Date().toISOString(),
      };

      if (!approvedFeature) {
        const review = upsertReview(state, {
          feature,
          kind: "new_feature",
          filePath: relativePath,
          detectedType,
          signature,
          notes: `Detected new candidate feature from ${relativePath}`,
        });

        created.push(review.reviewId);

        addAuditEntry(state, {
          action: "detected_new_feature",
          actor,
          feature,
          filePath: relativePath,
        });
      }

      continue;
    }

    if (previous.signature !== signature) {
      const isUpgrade = approvedFeature || featureMeta?.approved;

      state.files[relativePath] = {
        feature,
        signature,
        lastSeenAt: new Date().toISOString(),
      };

      if (isUpgrade) {
        const review = upsertReview(state, {
          feature,
          kind: "upgrade",
          filePath: relativePath,
          detectedType,
          signature,
          notes: `Detected file change in approved feature from ${relativePath}`,
        });

        created.push(review.reviewId);

        addAuditEntry(state, {
          action: "detected_upgrade",
          actor,
          feature,
          filePath: relativePath,
        });
      } else {
        const review = upsertReview(state, {
          feature,
          kind: "new_feature",
          filePath: relativePath,
          detectedType,
          signature,
          notes: `Detected new candidate feature from ${relativePath}`,
        });

        created.push(review.reviewId);

        addAuditEntry(state, {
          action: "detected_new_feature",
          actor,
          feature,
          filePath: relativePath,
        });
      }

      continue;
    }

    state.files[relativePath].lastSeenAt = new Date().toISOString();
  }

  writeState(state);

  for (const reviewId of created) {
    await postOrUpdateReviewCard(client, reviewId).catch(() => null);
  }

  return created.map((id) => getReview(id)).filter(Boolean);
}

async function approveReview(client, reviewId, actor = "Unknown") {
  const state = readState();
  const review = state.reviews[reviewId];

  if (!review) throw new Error("Review not found.");
  if (review.status !== "pending") throw new Error("Review is no longer pending.");
  if (review.frozen) throw new Error("Review is frozen.");

  review.status = "approved";
  review.approvedAt = new Date().toISOString();
  review.approvedBy = actor;
  review.updatedAt = new Date().toISOString();

  addManagedFeature(review.feature, {
    source: "discovery-review",
    notes: `Approved from ${review.kind} review`,
    detectedFrom: review.filePath,
    detectedType: review.detectedType,
  });

  review.registeredAt = new Date().toISOString();

  stagingService.setFeatureStage(
    review.feature,
    "dev",
    actor,
    `Auto-created from approved ${review.kind} review`,
    featureVersions.getCurrentVersion(review.feature)
  );

  review.stageCreatedAt = new Date().toISOString();

  registry.disableFeature(review.feature, "Approved into registry in disabled dev state.");
  review.deployReadyAt = new Date().toISOString();

  addAuditEntry(state, {
    action: "approved_review",
    actor,
    feature: review.feature,
    reviewId,
    kind: review.kind,
  });

  writeState(state);
  await postOrUpdateReviewCard(client, reviewId).catch(() => null);

  return review;
}

async function declineReview(client, reviewId, actor = "Unknown") {
  const state = readState();
  const review = state.reviews[reviewId];

  if (!review) throw new Error("Review not found.");
  if (review.status !== "pending") throw new Error("Review is no longer pending.");

  review.status = "declined";
  review.declinedAt = new Date().toISOString();
  review.declinedBy = actor;
  review.updatedAt = new Date().toISOString();

  addAuditEntry(state, {
    action: "declined_review",
    actor,
    feature: review.feature,
    reviewId,
    kind: review.kind,
  });

  writeState(state);
  await postOrUpdateReviewCard(client, reviewId).catch(() => null);

  return review;
}

async function promoteReviewToStaging(client, reviewId, actor = "Unknown") {
  const state = readState();
  const review = state.reviews[reviewId];

  if (!review) throw new Error("Review not found.");
  if (review.status !== "approved") throw new Error("Only approved reviews can be promoted to staging.");
  if (review.frozen) throw new Error("Review is frozen.");

  review.status = "staging";
  review.stage = "staging";
  review.stagingAt = new Date().toISOString();
  review.stagingBy = actor;
  review.updatedAt = new Date().toISOString();

  stagingService.setFeatureStage(
    review.feature,
    "staging",
    actor,
    `Promoted to staging from review ${reviewId}`,
    featureVersions.getCurrentVersion(review.feature)
  );

  registry.disableFeature(review.feature, "Feature is in staging and not yet live.");

  addAuditEntry(state, {
    action: "promoted_to_staging",
    actor,
    feature: review.feature,
    reviewId,
    kind: review.kind,
  });

  writeState(state);
  await postOrUpdateReviewCard(client, reviewId).catch(() => null);

  return review;
}

async function promoteReviewToLive(client, reviewId, actor = "Unknown", options = {}) {
  const state = readState();
  const review = state.reviews[reviewId];

  if (!review) throw new Error("Review not found.");
  if (review.status !== "staging") throw new Error("Only staging reviews can be promoted to live.");
  if (review.frozen) throw new Error("Review is frozen.");

  const nextVersion =
    options.version || stagingService.getFeatureStage(review.feature).version || "1.0.0";

  review.status = "live";
  review.stage = "live";
  review.liveAt = new Date().toISOString();
  review.liveBy = actor;
  review.updatedAt = new Date().toISOString();

  stagingService.setFeatureVersion(
    review.feature,
    nextVersion,
    actor,
    `Live release from review ${reviewId}`
  );

  stagingService.setFeatureStage(
    review.feature,
    "live",
    actor,
    `Promoted to live from review ${reviewId}`,
    nextVersion
  );

  registry.enableFeature(review.feature);

  featureVersions.createSnapshot({
    feature: review.feature,
    version: nextVersion,
    stage: "live",
    reviewId,
    actor,
    notes: options.notes || `Promoted to live from review ${reviewId}`,
    sourceAction: options.sourceAction || "promote_live",
  });

  if (review.kind === "new_feature") {
    patchNotes.addNewFeature(review.feature);
  } else {
    patchNotes.addUpdate(review.feature);
  }

  addAuditEntry(state, {
    action: options.sourceAction || "promoted_to_live",
    actor,
    feature: review.feature,
    reviewId,
    kind: review.kind,
    version: nextVersion,
  });

  writeState(state);
  await postOrUpdateReviewCard(client, reviewId).catch(() => null);

  await sendReleaseAnnouncement(client, {
    content: [
      "🚀 **FEATURE PROMOTED LIVE**",
      "",
      `Feature: **${review.feature}**`,
      `Version: **${nextVersion}**`,
      `Review ID: **${review.reviewId}**`,
      `Type: **${review.kind}**`,
      `Promoted by: **${actor}**`,
      "",
      "Status: **LIVE**",
    ].join("\n"),
  });

  await patchNotes.publishPatch(client, BOT_RELEASE_CHANNEL_ID);

  return review;
}

async function hotfixReviewToLive(client, reviewId, actor = "Unknown") {
  const state = readState();
  const review = state.reviews[reviewId];

  if (!review) throw new Error("Review not found.");
  if (review.frozen) throw new Error("Review is frozen.");
  if (!["approved", "staging", "live"].includes(review.status)) {
    throw new Error("Hotfix is only allowed from approved, staging, or live.");
  }

  const hotfixVersion = stagingService.bumpFeaturePatchVersion(
    review.feature,
    actor,
    `Hotfix version bump for review ${reviewId}`
  ).version;

  review.status = "live";
  review.stage = "live";
  review.hotfixAt = new Date().toISOString();
  review.hotfixBy = actor;
  review.liveAt = new Date().toISOString();
  review.liveBy = actor;
  review.updatedAt = new Date().toISOString();

  writeState(state);

  if (review.status !== "staging") {
    stagingService.setFeatureStage(
      review.feature,
      "staging",
      actor,
      `Temporary staging step for hotfix review ${reviewId}`,
      hotfixVersion
    );
  }

  return promoteReviewToLive(client, reviewId, actor, {
    version: hotfixVersion,
    notes: `Hotfix promoted live from review ${reviewId}`,
    sourceAction: "hotfix_live",
  });
}

async function rollbackReviewToStaging(client, reviewId, actor = "Unknown") {
  const state = readState();
  const review = state.reviews[reviewId];

  if (!review) throw new Error("Review not found.");
  if (review.status !== "live") throw new Error("Only live reviews can be rolled back to staging.");

  review.status = "staging";
  review.stage = "staging";
  review.rollbackAt = new Date().toISOString();
  review.rollbackBy = actor;
  review.rollbackTarget = "staging";
  review.updatedAt = new Date().toISOString();

  stagingService.setFeatureStage(
    review.feature,
    "staging",
    actor,
    `Rolled back to staging from live review ${reviewId}`,
    featureVersions.getCurrentVersion(review.feature)
  );

  registry.disableFeature(review.feature, "Rolled back from live to staging.");
  patchNotes.addRollback(review.feature);

  addAuditEntry(state, {
    action: "rollback_to_staging",
    actor,
    feature: review.feature,
    reviewId,
    kind: review.kind,
  });

  writeState(state);
  await postOrUpdateReviewCard(client, reviewId).catch(() => null);

  await sendReleaseAnnouncement(client, {
    content: [
      "⚠️ **FEATURE ROLLED BACK**",
      "",
      `Feature: **${review.feature}**`,
      `Review ID: **${review.reviewId}**`,
      `Rolled back by: **${actor}**`,
      "",
      "Rollback target: **STAGING**",
    ].join("\n"),
  });

  await patchNotes.publishPatch(client, BOT_RELEASE_CHANNEL_ID);

  return review;
}

async function rollbackReviewToApproved(client, reviewId, actor = "Unknown") {
  const state = readState();
  const review = state.reviews[reviewId];

  if (!review) throw new Error("Review not found.");
  if (review.status !== "staging") throw new Error("Only staging reviews can be rolled back to approved.");

  review.status = "approved";
  review.stage = "dev";
  review.rollbackAt = new Date().toISOString();
  review.rollbackBy = actor;
  review.rollbackTarget = "approved";
  review.updatedAt = new Date().toISOString();

  stagingService.setFeatureStage(
    review.feature,
    "dev",
    actor,
    `Rolled back to approved/dev state from staging review ${reviewId}`,
    featureVersions.getCurrentVersion(review.feature)
  );

  registry.disableFeature(review.feature, "Rolled back from staging to approved/dev.");
  patchNotes.addRollback(review.feature);

  addAuditEntry(state, {
    action: "rollback_to_approved",
    actor,
    feature: review.feature,
    reviewId,
    kind: review.kind,
  });

  writeState(state);
  await postOrUpdateReviewCard(client, reviewId).catch(() => null);

  await sendReleaseAnnouncement(client, {
    content: [
      "⚠️ **FEATURE ROLLED BACK**",
      "",
      `Feature: **${review.feature}**`,
      `Review ID: **${review.reviewId}**`,
      `Rolled back by: **${actor}**`,
      "",
      "Rollback target: **APPROVED / DEV**",
    ].join("\n"),
  });

  await patchNotes.publishPatch(client, BOT_RELEASE_CHANNEL_ID);

  return review;
}

async function rollbackReviewToPreviousVersion(client, reviewId, actor = "Unknown") {
  const state = readState();
  const review = state.reviews[reviewId];

  if (!review) throw new Error("Review not found.");
  if (review.status !== "live") throw new Error("Version rollback is only allowed from live.");

  const previousLive = featureVersions.getPreviousLiveSnapshot(review.feature);
  if (!previousLive) throw new Error("No previous live version snapshot found.");

  review.status = "live";
  review.stage = "live";
  review.rollbackAt = new Date().toISOString();
  review.rollbackBy = actor;
  review.rollbackTarget = "previous_version";
  review.rollbackVersion = previousLive.version;
  review.updatedAt = new Date().toISOString();

  stagingService.setFeatureVersion(
    review.feature,
    previousLive.version,
    actor,
    `Rolled back to previous live version ${previousLive.version}`
  );

  stagingService.setFeatureStage(
    review.feature,
    "live",
    actor,
    `Rolled back to previous live version ${previousLive.version}`,
    previousLive.version
  );

  registry.enableFeature(review.feature);

  featureVersions.createSnapshot({
    feature: review.feature,
    version: previousLive.version,
    stage: "live",
    reviewId,
    actor,
    notes: `Rolled back to previous live version ${previousLive.version}`,
    sourceAction: "rollback_previous_version",
  });

  patchNotes.addRollback(review.feature);

  addAuditEntry(state, {
    action: "rollback_previous_version",
    actor,
    feature: review.feature,
    reviewId,
    kind: review.kind,
    version: previousLive.version,
  });

  writeState(state);
  await postOrUpdateReviewCard(client, reviewId).catch(() => null);

  await sendReleaseAnnouncement(client, {
    content: [
      "⚠️ **FEATURE VERSION ROLLBACK**",
      "",
      `Feature: **${review.feature}**`,
      `Review ID: **${review.reviewId}**`,
      `Rolled back by: **${actor}**`,
      `Restored version: **${previousLive.version}**`,
      "",
      "Status: **LIVE**",
    ].join("\n"),
  });

  await patchNotes.publishPatch(client, BOT_RELEASE_CHANNEL_ID);

  return review;
}

async function freezeReview(client, reviewId, actor = "Unknown") {
  const state = readState();
  const review = state.reviews[reviewId];

  if (!review) throw new Error("Review not found.");
  if (review.frozen) throw new Error("Review is already frozen.");

  review.frozen = true;
  review.frozenAt = new Date().toISOString();
  review.frozenBy = actor;
  review.updatedAt = new Date().toISOString();

  if (review.status === "pending") {
    review.status = "frozen";
  }

  try {
    stagingService.setFeatureNotes(review.feature, `Frozen by ${actor} at ${review.frozenAt}`);
  } catch {}

  addAuditEntry(state, {
    action: "freeze_review",
    actor,
    feature: review.feature,
    reviewId,
    kind: review.kind,
  });

  writeState(state);
  await postOrUpdateReviewCard(client, reviewId).catch(() => null);

  return review;
}

async function unfreezeReview(client, reviewId, actor = "Unknown") {
  const state = readState();
  const review = state.reviews[reviewId];

  if (!review) throw new Error("Review not found.");
  if (!review.frozen) throw new Error("Review is not frozen.");

  review.frozen = false;
  review.updatedAt = new Date().toISOString();

  if (review.status === "frozen") {
    review.status = "pending";
  }

  addAuditEntry(state, {
    action: "unfreeze_review",
    actor,
    feature: review.feature,
    reviewId,
    kind: review.kind,
  });

  writeState(state);
  await postOrUpdateReviewCard(client, reviewId).catch(() => null);

  return review;
}

module.exports = {
  BOT_STATUS_CHANNEL_ID,
  BOT_RELEASE_CHANNEL_ID,
  getReview,
  getAllReviews,
  getReviewsByStatus,
  getPendingReviews,
  getApprovedReviews,
  getDeclinedReviews,
  getStagingReviews,
  getLiveReviews,
  getFrozenReviews,
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
  postOrUpdateReviewCard,
};