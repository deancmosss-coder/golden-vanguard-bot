// =========================
// services/discoveryReviewService.js
// AUTO DISCOVERY + UPGRADE REVIEW SYSTEM
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

const STATE_PATH = path.join(__dirname, "..", "data", "discoveryReviewState.json");

const BOT_STATUS_CHANNEL_ID = (process.env.BOT_STATUS_CHANNEL_ID || "").trim();

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
    id: `DISC-${Date.now()}`,
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

function getPendingReviews() {
  const state = readState();

  return Object.values(state.reviews)
    .filter((r) => r.status === "pending")
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function progressBar(percent) {
  const value = Math.max(0, Math.min(Number(percent) || 0, 100));
  const total = 10;
  const filled = Math.round((value / 100) * total);
  return `${"█".repeat(filled)}${"░".repeat(total - filled)} ${value}%`;
}

function buildReviewProgress(item) {
  const steps = [
    item.detectedAt ? 1 : 0,
    item.status === "approved" ? 1 : 0,
    item.registeredAt ? 1 : 0,
    item.stageCreatedAt ? 1 : 0,
    item.deployReadyAt ? 1 : 0,
  ];

  const done = steps.reduce((a, b) => a + b, 0);
  const total = steps.length;
  const percent = Math.round((done / total) * 100);

  return {
    done,
    total,
    percent,
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

  const excluded = [
    "/node_modules/",
    "/data/",
  ];

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

  return {
    title:
      review.kind === "new_feature"
        ? `🆕 Feature Review — ${review.feature}`
        : `⬆️ Upgrade Review — ${review.feature}`,
    description: [
      `**Feature:** ${review.feature}`,
      `**Type:** ${review.kind === "new_feature" ? "New Feature" : "Upgrade"}`,
      `**Detected From:** ${review.detectedType}`,
      `**File:** \`${review.filePath}\``,
      `**Status:** ${review.status}`,
      `**Progress:** ${progress.bar}`,
      "",
      `**Current Stage:** ${review.stage || "dev"}`,
      `**Enabled By Default:** No`,
      `**Notes:** ${review.notes || "Auto-detected review pending approval."}`,
    ].join("\n"),
  };
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

  const embed = new EmbedBuilder()
    .setColor(
      review.status === "approved"
        ? 0x2ecc71
        : review.status === "declined"
        ? 0xe74c3c
        : 0xf1c40f
    )
    .setTitle(card.title)
    .setDescription(card.description)
    .setFooter({ text: "Golden Vanguard Discovery Review" })
    .setTimestamp(new Date(review.updatedAt || review.createdAt || Date.now()));

  const components =
    review.status === "pending"
      ? [
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
        ]
      : [];

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
    "1.0.0"
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

module.exports = {
  BOT_STATUS_CHANNEL_ID,
  getReview,
  getPendingReviews,
  getRecentAudit,
  buildReviewProgress,
  scanForReviews,
  approveReview,
  declineReview,
};