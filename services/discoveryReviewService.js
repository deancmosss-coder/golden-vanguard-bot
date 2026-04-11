// =========================
// services/discoveryReviewService.js
// AUTO DISCOVERY + UPGRADE REVIEW SYSTEM
// PHASE 4: VERSION HISTORY + HOTFIX + ROLLBACK VERSION
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

  const embed = new EmbedBuilder()
    .setColor(
      review.status === "live"
        ? 0x2ecc71
        : review.status === "staging"
        ? 0x3498db
        : review.status === "approved"