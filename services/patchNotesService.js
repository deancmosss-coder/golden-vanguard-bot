// =========================
// services/patchNotesService.js
// FULL PATCH NOTES SYSTEM
// =========================

const fs = require("fs");
const path = require("path");

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
    fs.writeFileSync(DATA_PATH, JSON.stringify(defaultState(), null, 2));
  }
}

function read() {
  ensureFile();
  return JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
}

function write(data) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}

function bumpVersion(version) {
  const [major, minor, patch] = version.split(".").map(Number);
  return `${major}.${minor}.${patch + 1}`;
}

function addNewFeature(feature) {
  const data = read();
  if (!data.pending.new.includes(feature)) {
    data.pending.new.push(feature);
  }
  write(data);
}

function addUpdate(feature) {
  const data = read();
  if (!data.pending.updates.includes(feature)) {
    data.pending.updates.push(feature);
  }
  write(data);
}

function addRollback(feature) {
  const data = read();
  if (!data.pending.rollbacks.includes(feature)) {
    data.pending.rollbacks.push(feature);
  }
  write(data);
}

function buildPatchEmbed(data) {
  const { EmbedBuilder } = require("discord.js");

  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle("🦅 GOLDEN VANGUARD — SYSTEM UPDATE")
    .setDescription(
      [
        `📦 **Patch Version:** v${data.version}`,
        `🕒 **Released:** <t:${Math.floor(Date.now() / 1000)}:R>`,
        "",
        data.pending.new.length
          ? `✨ **NEW FEATURES**\n${data.pending.new.map(f => `• ${f}`).join("\n")}\n`
          : "",
        data.pending.updates.length
          ? `⚙️ **UPDATES**\n${data.pending.updates.map(f => `• ${f}`).join("\n")}\n`
          : "",
        data.pending.rollbacks.length
          ? `⚠️ **ROLLBACKS**\n${data.pending.rollbacks.map(f => `• ${f}`).join("\n")}\n`
          : "",
        "━━━━━━━━━━━━━━━━━━",
        "",
        "“Systems online. Continue the operation.”",
      ].join("\n")
    )
    .setFooter({ text: "Golden Vanguard Command" })
    .setTimestamp();

  return embed;
}

async function publishPatch(client, channelId) {
  const data = read();

  if (
    data.pending.new.length === 0 &&
    data.pending.updates.length === 0 &&
    data.pending.rollbacks.length === 0
  ) {
    return null;
  }

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased()) return null;

  const embed = buildPatchEmbed(data);

  await channel.send({ embeds: [embed] });

  data.releases.unshift({
    version: data.version,
    createdAt: new Date().toISOString(),
    ...data.pending,
  });

  data.version = bumpVersion(data.version);
  data.pending = { new: [], updates: [], rollbacks: [] };

  write(data);

  return true;
}

module.exports = {
  addNewFeature,
  addUpdate,
  addRollback,
  publishPatch,
};