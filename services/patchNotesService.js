// =========================
// services/patchNotesService.js
// FULL PATCH NOTES SYSTEM
// =========================

const fs = require("fs");
const path = require("path");
const { EmbedBuilder } = require("discord.js");

const DATA_PATH = path.join(__dirname, "..", "data", "patchNotes.json");

function defaultState() {
  return {
    version: "1.0.0",
    releases: [],
    pending: {
      new: [],
      updates: [],
      rollbacks: [],
    },
  };
}

function ensureFile() {
  if (!fs.existsSync(DATA_PATH)) {
    fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
    fs.writeFileSync(DATA_PATH, JSON.stringify(defaultState(), null, 2), "utf8");
  }
}

function readState() {
  ensureFile();

  try {
    const raw = fs.readFileSync(DATA_PATH, "utf8");
    const parsed = JSON.parse(raw);
    const base = defaultState();

    return {
      ...base,
      ...(parsed || {}),
      releases: Array.isArray(parsed?.releases) ? parsed.releases : [],
      pending: {
        new: Array.isArray(parsed?.pending?.new) ? parsed.pending.new : [],
        updates: Array.isArray(parsed?.pending?.updates) ? parsed.pending.updates : [],
        rollbacks: Array.isArray(parsed?.pending?.rollbacks) ? parsed.pending.rollbacks : [],
      },
    };
  } catch {
    return defaultState();
  }
}

function writeState(state) {
  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify(state, null, 2), "utf8");
}

function sanitiseFeature(feature) {
  return String(feature || "").trim();
}

function uniqPush(list, value) {
  const clean = sanitiseFeature(value);
  if (!clean) return list;
  if (!list.includes(clean)) list.push(clean);
  return list;
}

function bumpVersion(version) {
  const parts = String(version || "1.0.0")
    .split(".")
    .map((n) => Number(n));

  const major = Number.isFinite(parts[0]) ? parts[0] : 1;
  const minor = Number.isFinite(parts[1]) ? parts[1] : 0;
  const patch = Number.isFinite(parts[2]) ? parts[2] : 0;

  return `${major}.${minor}.${patch + 1}`;
}

function addNewFeature(feature) {
  const state = readState();
  uniqPush(state.pending.new, feature);
  writeState(state);
  return state;
}

function addUpdate(feature) {
  const state = readState();
  uniqPush(state.pending.updates, feature);
  writeState(state);
  return state;
}

function addRollback(feature) {
  const state = readState();
  uniqPush(state.pending.rollbacks, feature);
  writeState(state);
  return state;
}

function clearPending() {
  const state = readState();
  state.pending = {
    new: [],
    updates: [],
    rollbacks: [],
  };
  writeState(state);
  return state;
}

function getPending() {
  const state = readState();
  return state.pending;
}

function getReleaseHistory(limit = 10) {
  const state = readState();
  const max = Math.max(1, Math.min(Number(limit) || 10, 25));
  return state.releases.slice(0, max);
}

function buildPatchEmbed(state) {
  const lines = [
    `📦 **Patch Version:** v${state.version}`,
    `🕒 **Released:** <t:${Math.floor(Date.now() / 1000)}:R>`,
    "",
  ];

  if (state.pending.new.length) {
    lines.push("✨ **NEW FEATURES**");
    lines.push(...state.pending.new.map((f) => `• ${f}`));
    lines.push("");
  }

  if (state.pending.updates.length) {
    lines.push("⚙️ **UPDATES**");
    lines.push(...state.pending.updates.map((f) => `• ${f}`));
    lines.push("");
  }

  if (state.pending.rollbacks.length) {
    lines.push("⚠️ **ROLLBACKS**");
    lines.push(...state.pending.rollbacks.map((f) => `• ${f}`));
    lines.push("");
  }

  lines.push("━━━━━━━━━━━━━━━━━━");
  lines.push("");
  lines.push("“Systems online. Continue the operation.”");

  return new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle("🦅 GOLDEN VANGUARD — SYSTEM UPDATE")
    .setDescription(lines.join("\n"))
    .setFooter({ text: "Golden Vanguard Command" })
    .setTimestamp();
}

async function publishPatch(client, channelId) {
  const state = readState();

  const hasPending =
    state.pending.new.length ||
    state.pending.updates.length ||
    state.pending.rollbacks.length;

  if (!hasPending) return null;
  if (!channelId) return null;

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased?.()) return null;

  const embed = buildPatchEmbed(state);
  await channel.send({ embeds: [embed] });

  state.releases.unshift({
    version: state.version,
    createdAt: new Date().toISOString(),
    new: [...state.pending.new],
    updates: [...state.pending.updates],
    rollbacks: [...state.pending.rollbacks],
  });

  state.releases = state.releases.slice(0, 100);
  state.version = bumpVersion(state.version);
  state.pending = {
    new: [],
    updates: [],
    rollbacks: [],
  };

  writeState(state);
  return true;
}

module.exports = {
  readState,
  writeState,
  addNewFeature,
  addUpdate,
  addRollback,
  clearPending,
  getPending,
  getReleaseHistory,
  buildPatchEmbed,
  publishPatch,
};