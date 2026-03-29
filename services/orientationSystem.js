const fs = require("fs");
const path = require("path");
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

const DATA_PATH = path.join(__dirname, "..", "data", "recruits.json");

/**
 * ENV expected:
 *
 * ORIENTATION_RECRUIT_ROLE_ID=
 * ORIENTATION_TROOPER_ROLE_ID=
 * ORIENTATION_SERGEANT_ROLE_ID=
 * ORIENTATION_SENIOR_OFFICER_ROLE_ID=
 * ORIENTATION_STRIKE_CAPTAIN_ROLE_ID=
 * ORIENTATION_HIGH_COMMAND_ROLE_ID=
 * ORIENTATION_VANGUARD_PRIME_ROLE_ID=
 *
 * ORIENTATION_RECRUIT_MONITOR_CHANNEL_ID=
 * ORIENTATION_PROMOTION_REQUESTS_CHANNEL_ID=
 * ORIENTATION_LOG_CHANNEL_ID=
 * ORIENTATION_CHECKLIST_CHANNEL_ID=
 * ORIENTATION_PROMOTION_ANNOUNCE_CHANNEL_ID=
 *
 * ORIENTATION_VC_CATEGORY_ID=
 * ORIENTATION_MIN_VC_MINUTES=10
 */

const CONFIG = {
  recruitRoleId: (process.env.ORIENTATION_RECRUIT_ROLE_ID || "").trim(),
  trooperRoleId: (process.env.ORIENTATION_TROOPER_ROLE_ID || "").trim(),

  sergeantRoleId: (process.env.ORIENTATION_SERGEANT_ROLE_ID || "").trim(),
  seniorOfficerRoleId: (process.env.ORIENTATION_SENIOR_OFFICER_ROLE_ID || "").trim(),
  strikeCaptainRoleId: (process.env.ORIENTATION_STRIKE_CAPTAIN_ROLE_ID || "").trim(),
  highCommandRoleId: (process.env.ORIENTATION_HIGH_COMMAND_ROLE_ID || "").trim(),
  vanguardPrimeRoleId: (process.env.ORIENTATION_VANGUARD_PRIME_ROLE_ID || "").trim(),

  recruitMonitorChannelId: (process.env.ORIENTATION_RECRUIT_MONITOR_CHANNEL_ID || "").trim(),
  promotionRequestsChannelId: (process.env.ORIENTATION_PROMOTION_REQUESTS_CHANNEL_ID || "").trim(),
  orientationLogChannelId: (process.env.ORIENTATION_LOG_CHANNEL_ID || "").trim(),
  checklistChannelId: (process.env.ORIENTATION_CHECKLIST_CHANNEL_ID || "").trim(),
  promotionAnnounceChannelId: (process.env.ORIENTATION_PROMOTION_ANNOUNCE_CHANNEL_ID || "").trim(),

  vcCategoryId: (process.env.ORIENTATION_VC_CATEGORY_ID || "").trim(),
  minVcMinutes: Number(process.env.ORIENTATION_MIN_VC_MINUTES || 10),
};

CONFIG.approverRoleIds = [
  CONFIG.sergeantRoleId,
  CONFIG.seniorOfficerRoleId,
  CONFIG.strikeCaptainRoleId,
  CONFIG.highCommandRoleId,
  CONFIG.vanguardPrimeRoleId,
].filter(Boolean);

CONFIG.supervisorRoleIds = [
  CONFIG.sergeantRoleId,
  CONFIG.seniorOfficerRoleId,
  CONFIG.strikeCaptainRoleId,
  CONFIG.highCommandRoleId,
  CONFIG.vanguardPrimeRoleId,
].filter(Boolean);

const activeVcSessions = new Map();

/* =========================
   FILE STORAGE
   ========================= */
function readJson(file, fallback = {}) {
  try {
    if (!fs.existsSync(file)) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(fallback, null, 2), "utf8");
      return fallback;
    }
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    console.error("[orientationSystem] readJson error:", err);
    return fallback;
  }
}

function writeJson(file, data) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error("[orientationSystem] writeJson error:", err);
  }
}

function loadDb() {
  return readJson(DATA_PATH, {});
}

function saveDb(db) {
  writeJson(DATA_PATH, db);
}

/* =========================
   RECRUIT MODEL
   ========================= */
function defaultRecruitRecord(userId) {
  return {
    userId,
    guideRead: false,
    lawsRead: false,
    divisionsRead: false,
    deploymentComplete: false,
    aarSubmitted: false,
    promotionRequested: false,
    promoted: false,
    joinedAt: new Date().toISOString(),
    deploymentCompletedAt: null,
    aarSubmittedAt: null,
    promotionRequestedAt: null,
    promotedAt: null,
    promotedBy: null,
    lastSupervisorId: null,
    lastDeploymentChannelId: null,
  };
}

function ensureRecruit(userId) {
  const db = loadDb();
  if (!db[userId]) {
    db[userId] = defaultRecruitRecord(userId);
    saveDb(db);
  }
  return db[userId];
}

function getRecruit(userId) {
  return loadDb()[userId] || null;
}

function updateRecruit(userId, updates = {}) {
  const db = loadDb();
  if (!db[userId]) db[userId] = defaultRecruitRecord(userId);
  db[userId] = { ...db[userId], ...updates };
  saveDb(db);
  return db[userId];
}

/* =========================
   ROLE CHECKS
   ========================= */
function hasAnyRole(member, roleIds = []) {
  return roleIds.some((id) => id && member.roles.cache.has(id));
}

function isRecruitMember(member) {
  return member.roles.cache.has(CONFIG.recruitRoleId);
}

function isSupervisor(member) {
  return hasAnyRole(member, CONFIG.supervisorRoleIds);
}

function isApprover(member) {
  return hasAnyRole(member, CONFIG.approverRoleIds);
}

/* =========================
   PROMOTION ANNOUNCE
   ========================= */
async function announcePromotion(client, member, approverMember) {
  if (!CONFIG.promotionAnnounceChannelId) return;

  const channel = await client.channels
    .fetch(CONFIG.promotionAnnounceChannelId)
    .catch(() => null);

  if (!channel?.isTextBased()) return;

  return channel.send({
    content: [
      "🪖 **WELCOME TO THE GOLDEN VANGUARD**",
      "",
      `${member} has been promoted to **Trooper**.`,
      "",
      "Deploy together. Reinforce together. Win together.",
      "",
      `Approved by: ${approverMember}`,
    ].join("\n"),
    allowedMentions: { users: [member.id] },
  });
}

/* =========================
   APPROVE PROMOTION
   ========================= */
async function approvePromotion(guild, targetUserId, approverMember, interaction = null) {
  const member = await guild.members.fetch(targetUserId).catch(() => null);

  if (!member) {
    if (interaction) {
      await interaction.editReply({
        content: "❌ Could not find that member.",
        components: [],
      }).catch(() => {});
    }
    return;
  }

  if (CONFIG.recruitRoleId) {
    await member.roles.remove(CONFIG.recruitRoleId).catch((err) => {
      console.error("[orientationSystem] Failed to remove recruit role:", err);
    });
  }

  if (CONFIG.trooperRoleId) {
    await member.roles.add(CONFIG.trooperRoleId).catch((err) => {
      console.error("[orientationSystem] Failed to add trooper role:", err);
    });
  }

  updateRecruit(targetUserId, {
    promoted: true,
    promotedAt: new Date().toISOString(),
    promotedBy: approverMember.id,
  });

  await announcePromotion(guild.client, member, approverMember).catch((err) => {
    console.error("[orientationSystem] Failed to announce promotion:", err);
  });

  if (interaction) {
    await interaction.editReply({
      content: `✅ ${member} has been approved and promoted to **Trooper**.`,
      components: [],
    }).catch((err) => {
      console.error("[orientationSystem] Failed to edit deferred interaction reply:", err);
    });
  }
}

/* =========================
   BUTTON HANDLER
   ========================= */
async function handleOrientationButton(interaction) {
  if (!interaction.isButton()) return false;

  const { customId, member, guild } = interaction;

  if (customId.startsWith("orientation_approve_")) {
    if (!isApprover(member)) {
      await interaction.reply({
        content: "Only Sergeant or higher can approve promotions.",
        ephemeral: true,
      }).catch((err) => {
        console.error("[orientationSystem] Failed to reply to non-approver:", err);
      });
      return true;
    }

    await interaction.deferUpdate().catch((err) => {
      console.error("[orientationSystem] Failed to defer button interaction:", err);
    });

    const targetUserId = customId.split("_").pop();
    await approvePromotion(guild, targetUserId, member, interaction);
    return true;
  }

  return false;
}

/* =========================
   VOICE TRACKING
   ========================= */
function handleVoiceStateUpdate(oldState, newState) {
  const guild = newState.guild || oldState.guild;
  if (!guild) return;

  const member = newState.member || oldState.member;
  if (!member || member.user?.bot) return;

  const oldChannel = oldState.channel;
  const newChannel = newState.channel;
  const now = Date.now();

  const session = activeVcSessions.get(member.id);

  const isTrackedChannel = (channel) => {
    if (!channel) return false;
    if (!CONFIG.vcCategoryId) return true;
    return channel.parentId === CONFIG.vcCategoryId;
  };

  if (!oldChannel && newChannel && isTrackedChannel(newChannel)) {
    activeVcSessions.set(member.id, {
      channelId: newChannel.id,
      joinedAt: now,
    });
    return;
  }

  if (oldChannel && !newChannel && session) {
    const minutes = Math.floor((now - session.joinedAt) / 60000);
    activeVcSessions.delete(member.id);

    if (minutes >= CONFIG.minVcMinutes) {
      const recruit = ensureRecruit(member.id);
      updateRecruit(member.id, {
        deploymentComplete: true,
        deploymentCompletedAt: new Date().toISOString(),
        lastDeploymentChannelId: oldChannel.id,
        lastSupervisorId: recruit.lastSupervisorId || null,
      });
    }
    return;
  }

  if (oldChannel && newChannel && oldChannel.id !== newChannel.id) {
    if (session) {
      const minutes = Math.floor((now - session.joinedAt) / 60000);

      if (minutes >= CONFIG.minVcMinutes && isTrackedChannel(oldChannel)) {
        const recruit = ensureRecruit(member.id);
        updateRecruit(member.id, {
          deploymentComplete: true,
          deploymentCompletedAt: new Date().toISOString(),
          lastDeploymentChannelId: oldChannel.id,
          lastSupervisorId: recruit.lastSupervisorId || null,
        });
      }
    }

    if (isTrackedChannel(newChannel)) {
      activeVcSessions.set(member.id, {
        channelId: newChannel.id,
        joinedAt: now,
      });
    } else {
      activeVcSessions.delete(member.id);
    }
  }
}

/* =========================
   EXPORT
   ========================= */
module.exports = {
  CONFIG,
  ensureRecruit,
  getRecruit,
  updateRecruit,
  handleOrientationButton,
  handleVoiceStateUpdate,
  isRecruitMember,
  isSupervisor,
  isApprover,
};