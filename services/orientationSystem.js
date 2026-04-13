const fs = require("fs");
const path = require("path");
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

const DATA_PATH = path.join(__dirname, "..", "data", "recruits.json");

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
  chatChannelId: (process.env.ORIENTATION_CHAT_CHANNEL_ID || "").trim(),

  vcCategoryId: (process.env.ORIENTATION_VC_CATEGORY_ID || "").trim(),
  minVcMinutes: Number(process.env.ORIENTATION_MIN_VC_MINUTES || 10),
  deadlineDays: Number(process.env.ORIENTATION_DEADLINE_DAYS || 7),
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

// key = `${guildId}:${recruitId}:${supervisorId}:${channelId}`
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
  const now = Date.now();
  const deadlineAt = new Date(
    now + CONFIG.deadlineDays * 24 * 60 * 60 * 1000
  ).toISOString();

  return {
    userId,
    guideRead: false,
    lawsRead: false,
    divisionsRead: false,
    deploymentComplete: false,
    aarSubmitted: false,

    promotionRequested: false,
    promoted: false,

    joinedAt: new Date(now).toISOString(),
    deadlineAt,
    overdueAlertSent: false,

    deploymentCompletedAt: null,
    aarSubmittedAt: null,
    promotionRequestedAt: null,
    promotedAt: null,
    promotedBy: null,

    lastSupervisorId: null,
    lastDeploymentChannelId: null,

    monitorMessageId: null,
    monitorChannelId: null,
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
  const db = loadDb();
  return db[userId] || null;
}

function updateRecruit(userId, updates = {}) {
  const db = loadDb();
  if (!db[userId]) db[userId] = defaultRecruitRecord(userId);
  db[userId] = { ...db[userId], ...updates };
  saveDb(db);
  return db[userId];
}

function markField(userId, field, value = true) {
  return updateRecruit(userId, { [field]: value });
}

function markGuideRead(userId) {
  return markField(userId, "guideRead", true);
}

function markLawsRead(userId) {
  return markField(userId, "lawsRead", true);
}

function markDivisionsRead(userId) {
  return markField(userId, "divisionsRead", true);
}

function markAAR(userId) {
  const recruit = ensureRecruit(userId);
  if (recruit.aarSubmitted) return recruit;

  return updateRecruit(userId, {
    aarSubmitted: true,
    aarSubmittedAt: new Date().toISOString(),
  });
}

function markDeployment(userId, supervisorId, channelId) {
  const recruit = ensureRecruit(userId);
  if (recruit.deploymentComplete) return recruit;

  return updateRecruit(userId, {
    deploymentComplete: true,
    deploymentCompletedAt: new Date().toISOString(),
    lastSupervisorId: supervisorId || null,
    lastDeploymentChannelId: channelId || null,
  });
}

function isComplete(userId) {
  const r = ensureRecruit(userId);
  return Boolean(
    r.guideRead &&
      r.lawsRead &&
      r.divisionsRead &&
      r.deploymentComplete &&
      r.aarSubmitted
  );
}

function getMissingSteps(userId) {
  const r = ensureRecruit(userId);
  const missing = [];

  if (!r.guideRead) missing.push("Read the Server Guide");
  if (!r.lawsRead) missing.push("Review the Community Laws");
  if (!r.divisionsRead) missing.push("Review the Divisions");
  if (!r.deploymentComplete) {
    missing.push(
      "Complete a deployment with a Sergeant, Senior Officer, Strike Captain, High Command, or Vanguard Prime"
    );
  }
  if (!r.aarSubmitted) missing.push("Submit an AAR with /run");

  return missing;
}

function progressCount(userId) {
  const r = ensureRecruit(userId);
  const total = 5;
  const done = [
    r.guideRead,
    r.lawsRead,
    r.divisionsRead,
    r.deploymentComplete,
    r.aarSubmitted,
  ].filter(Boolean).length;

  return { done, total };
}

/* =========================
   ROLE CHECKS
   ========================= */
function hasAnyRole(member, roleIds = []) {
  if (!member?.roles?.cache) return false;
  return roleIds.some((id) => id && member.roles.cache.has(id));
}

function isRecruitMember(member) {
  return Boolean(CONFIG.recruitRoleId && member?.roles?.cache?.has(CONFIG.recruitRoleId));
}

function isSupervisor(member) {
  return hasAnyRole(member, CONFIG.supervisorRoleIds);
}

function isApprover(member) {
  return hasAnyRole(member, CONFIG.approverRoleIds);
}

/* =========================
   UI BUILDERS
   ========================= */
function buildChecklistEmbed() {
  return new EmbedBuilder()
    .setTitle("⭐ Recruit Orientation Checklist")
    .setDescription(
      [
        "Welcome, Diver.",
        "",
        "To become a true member of the Vanguard, you must complete Recruit Orientation.",
        "",
        "Recruits observe. Troopers deploy.",
        "",
        "Complete the following in any order:",
        "",
        "⬜ Read the Vanguard Field Manual",
        "⬜ Review the Community Laws",
        "⬜ Review the Vanguard Divisions",
        "⬜ Complete a deployment with a Sergeant, Senior Officer, Strike Captain, High Command, or Vanguard Prime",
        "⬜ Submit an After Action Report (AAR) using /run",
        "",
        "Once all stages are complete, your promotion request will be sent automatically.",
      ].join("\n")
    )
    .setFooter({ text: "Use the buttons below for the first three steps." });
}

function buildChecklistButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("orientation_guide")
        .setLabel("📘 Guide Read")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("orientation_laws")
        .setLabel("📜 Laws Reviewed")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("orientation_divisions")
        .setLabel("⚔ Divisions Reviewed")
        .setStyle(ButtonStyle.Secondary)
    ),
  ];
}

function buildProgressText(userId) {
  const r = ensureRecruit(userId);
  const p = progressCount(userId);

  return [
    `**Your Progress:** ${p.done}/${p.total}`,
    "",
    `${r.guideRead ? "✅" : "⬜"} Server Guide`,
    `${r.lawsRead ? "✅" : "⬜"} Community Laws`,
    `${r.divisionsRead ? "✅" : "⬜"} Divisions`,
    `${r.deploymentComplete ? "✅" : "⬜"} Deployment with qualified Vanguard member`,
    `${r.aarSubmitted ? "✅" : "⬜"} AAR submitted`,
  ].join("\n");
}

function buildPromotionRequestEmbed(member) {
  const r = ensureRecruit(member.id);

  return new EmbedBuilder()
    .setTitle("⭐ Trooper Promotion Review")
    .setDescription(
      [
        `Recruit: ${member}`,
        `Guide: ${r.guideRead ? "✅" : "⬜"}`,
        `Laws: ${r.lawsRead ? "✅" : "⬜"}`,
        `Divisions: ${r.divisionsRead ? "✅" : "⬜"}`,
        `Deployment: ${r.deploymentComplete ? "✅" : "⬜"}`,
        `AAR: ${r.aarSubmitted ? "✅" : "⬜"}`,
        r.lastSupervisorId ? `Supervisor: <@${r.lastSupervisorId}>` : "Supervisor: Not recorded",
      ].join("\n")
    );
}

function buildPromotionButtons(userId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`orientation_approve_${userId}`)
        .setLabel("Approve Promotion")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`orientation_more_training_${userId}`)
        .setLabel("Needs More Training")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`orientation_deny_${userId}`)
        .setLabel("Deny")
        .setStyle(ButtonStyle.Danger)
    ),
  ];
}

function buildMonitorButtons(userId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`orientation_promote_now_${userId}`)
        .setLabel("⭐ Promote Now")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`orientation_kick_${userId}`)
        .setLabel("❌ Kick Recruit")
        .setStyle(ButtonStyle.Danger)
    ),
  ];
}

function formatRelativeStatus(deadlineAt, promoted) {
  if (promoted) return "✅ Promoted";

  const now = Date.now();
  const end = new Date(deadlineAt).getTime();

  if (Number.isNaN(end)) return "Unknown";
  if (now > end) {
    const days = Math.max(1, Math.floor((now - end) / (1000 * 60 * 60 * 24)));
    return `❌ Overdue by ${days} day(s)`;
  }

  const hours = Math.floor((end - now) / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  if (days >= 1) return `⏳ ${days} day(s) remaining`;
  return `⏳ ${hours} hour(s) remaining`;
}

function buildRecruitMonitorEmbed(member) {
  const r = ensureRecruit(member.id);

  const overdue = !r.promoted && Date.now() > new Date(r.deadlineAt).getTime();
  const color = r.promoted ? 0x2ecc71 : overdue ? 0xe74c3c : 0xf1c40f;

  return new EmbedBuilder()
    .setColor(color)
    .setTitle("🪖 Recruit Orientation Status")
    .setDescription(
      [
        `Recruit: ${member}`,
        `Joined: <t:${Math.floor(new Date(r.joinedAt).getTime() / 1000)}:D>`,
        `Deadline: <t:${Math.floor(new Date(r.deadlineAt).getTime() / 1000)}:D>`,
        `Status: ${formatRelativeStatus(r.deadlineAt, r.promoted)}`,
        "",
        `${r.guideRead ? "✅" : "⬜"} Guide`,
        `${r.lawsRead ? "✅" : "⬜"} Laws`,
        `${r.divisionsRead ? "✅" : "⬜"} Divisions`,
        `${r.deploymentComplete ? "✅" : "⬜"} Deployment`,
        `${r.aarSubmitted ? "✅" : "⬜"} AAR`,
        "",
        r.lastSupervisorId
          ? `Supervisor: <@${r.lastSupervisorId}>`
          : "Supervisor: Not recorded",
      ].join("\n")
    )
    .setFooter({ text: "The Golden Vanguard — Recruit Monitor" });
}

/* =========================
   CHANNEL HELPERS
   ========================= */
async function sendToChannel(client, channelId, payload) {
  if (!channelId) return null;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased?.()) return null;

  return channel.send(payload).catch((err) => {
    console.error("[orientationSystem] sendToChannel error:", err);
    return null;
  });
}

async function logOrientation(client, message) {
  return sendToChannel(client, CONFIG.orientationLogChannelId, { content: message });
}

async function createOrUpdateMonitorCard(member) {
  if (!CONFIG.recruitMonitorChannelId) return null;

  const channel = await member.client.channels.fetch(CONFIG.recruitMonitorChannelId).catch(() => null);
  if (!channel?.isTextBased?.()) return null;

  const recruit = ensureRecruit(member.id);

  if (recruit.monitorMessageId) {
    const msg = await channel.messages.fetch(recruit.monitorMessageId).catch(() => null);
    if (msg) {
      await msg.edit({
        embeds: [buildRecruitMonitorEmbed(member)],
        components: buildMonitorButtons(member.id),
      }).catch(console.error);
      return msg;
    }
  }

  const sent = await channel.send({
    embeds: [buildRecruitMonitorEmbed(member)],
    components: buildMonitorButtons(member.id),
  }).catch(() => null);

  if (sent) {
    updateRecruit(member.id, {
      monitorMessageId: sent.id,
      monitorChannelId: channel.id,
    });
  }

  return sent;
}

async function announcePromotion(client, member, approverMember) {
  if (!CONFIG.promotionAnnounceChannelId) return null;

  return sendToChannel(client, CONFIG.promotionAnnounceChannelId, {
    content: [
      "🪖 **WELCOME TO THE GOLDEN VANGUARD**",
      "",
      `${member} has completed Recruit Orientation and has been promoted to **Trooper**.`,
      "",
      "Recruits observe. Troopers deploy.",
      "",
      `Approved by: ${approverMember}`,
    ].join("\n"),
    allowedMentions: { users: [member.id] },
  });
}

/* =========================
   PUBLIC HELPERS
   ========================= */
async function sendChecklistPanel(client) {
  if (!CONFIG.checklistChannelId) return null;

  const channel = await client.channels.fetch(CONFIG.checklistChannelId).catch(() => null);
  if (!channel?.isTextBased?.()) return null;

  return channel.send({
    embeds: [buildChecklistEmbed()],
    components: buildChecklistButtons(),
  });
}

async function sendChatOrientationMessage(member) {
  if (!CONFIG.chatChannelId) return null;

  return sendToChannel(member.client, CONFIG.chatChannelId, {
    content: [
      `🪖 Welcome to The Golden Vanguard, ${member}.`,
      "",
      "To become a true member of the Vanguard, you must complete your orientation.",
      "",
      "Recruits observe. Troopers deploy.",
      "",
      `Report to <#${CONFIG.checklistChannelId}> to begin.`,
      `You have ${CONFIG.deadlineDays} days to complete your training.`,
      "",
      "Deploy well, Diver.",
    ].join("\n"),
    allowedMentions: { users: [member.id] },
  });
}

async function sendOrientationDM(member) {
  return member.send(
    [
      "🪖 Welcome to The Golden Vanguard.",
      "",
      "You are now a Recruit.",
      "",
      `To become a true member of the Vanguard, you must complete your orientation within ${CONFIG.deadlineDays} days.`,
      "",
      "Recruits observe. Troopers deploy.",
      "",
      `Report to <#${CONFIG.checklistChannelId}> to begin.`,
      "",
      "You must complete:",
      "• Read the Vanguard Field Manual",
      "• Review the Community Laws",
      "• Review the Divisions",
      "• Complete a deployment with a Sergeant, Senior Officer, Strike Captain, High Command, or Vanguard Prime",
      "• Submit an After Action Report using /run",
      "",
      "Once complete, your promotion request will be reviewed.",
      "",
      "Now earn your place in the Vanguard.",
    ].join("\n")
  ).catch(() => null);
}

async function logNewRecruit(member) {
  const recruit = ensureRecruit(member.id);

  if (!recruit.deadlineAt) {
    updateRecruit(member.id, {
      deadlineAt: new Date(
        Date.now() + CONFIG.deadlineDays * 24 * 60 * 60 * 1000
      ).toISOString(),
    });
  }

  await createOrUpdateMonitorCard(member);
  await sendChatOrientationMessage(member);
  await sendOrientationDM(member);
}

async function logProgress(member, label) {
  const progress = progressCount(member.id);

  await createOrUpdateMonitorCard(member);
  await logOrientation(
    member.client,
    [
      "📈 **Recruit Progress Update**",
      `Diver: ${member}`,
      `Update: ${label}`,
      `Progress: ${progress.done}/${progress.total}`,
    ].join("\n")
  );
}

async function sendPromotionRequest(member) {
  const userId = member.id;
  const recruit = ensureRecruit(userId);

  if (recruit.promoted) return { ok: false, reason: "already_promoted" };
  if (!isComplete(userId)) return { ok: false, reason: "incomplete" };
  if (recruit.promotionRequested) return { ok: false, reason: "already_requested" };

  updateRecruit(userId, {
    promotionRequested: true,
    promotionRequestedAt: new Date().toISOString(),
  });

  const sent = await sendToChannel(member.client, CONFIG.promotionRequestsChannelId, {
    embeds: [buildPromotionRequestEmbed(member)],
    components: buildPromotionButtons(userId),
  });

  await logOrientation(
    member.client,
    `⭐ **Promotion Requested**\nDiver: ${member}\nStatus: Awaiting approval`
  );

  await createOrUpdateMonitorCard(member);
  return { ok: Boolean(sent) };
}

async function autoRequestPromotionIfComplete(member) {
  if (!member) return false;

  const recruit = ensureRecruit(member.id);
  if (recruit.promoted) return false;
  if (recruit.promotionRequested) return false;
  if (!isComplete(member.id)) return false;

  const result = await sendPromotionRequest(member);
  return Boolean(result?.ok);
}

/* =========================
   APPROVAL ACTIONS
   ========================= */
async function approvePromotion(guild, targetUserId, approverMember, interaction = null) {
  const member = await guild.members.fetch(targetUserId).catch(() => null);
  if (!member) return { ok: false, reason: "member_not_found" };

  const recruit = ensureRecruit(targetUserId);
  if (recruit.promoted) return { ok: false, reason: "already_promoted" };

  if (CONFIG.recruitRoleId && member.roles.cache.has(CONFIG.recruitRoleId)) {
    await member.roles.remove(CONFIG.recruitRoleId).catch(console.error);
  }

  if (CONFIG.trooperRoleId && !member.roles.cache.has(CONFIG.trooperRoleId)) {
    await member.roles.add(CONFIG.trooperRoleId).catch(console.error);
  }

  updateRecruit(targetUserId, {
    promoted: true,
    promotedAt: new Date().toISOString(),
    promotedBy: approverMember.id,
  });

  await logOrientation(
    guild.client,
    [
      "✅ **Recruit Promoted**",
      `Diver: ${member}`,
      `Approved by: ${approverMember}`,
      "Rank: Trooper",
    ].join("\n")
  );

  await announcePromotion(guild.client, member, approverMember).catch(console.error);
  await createOrUpdateMonitorCard(member);

  if (interaction) {
    if (interaction.message?.embeds?.length) {
      const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
        .setFooter({ text: `Approved by ${approverMember.displayName}` });

      await interaction.update({
        embeds: [updatedEmbed],
        components: [],
      }).catch(console.error);
    } else {
      await interaction.reply({
        content: `✅ ${member} has been promoted to **Trooper**.`,
        ephemeral: true,
      }).catch(() => null);
    }
  }

  await member.send(
    "Welcome to the Vanguard, Diver.\n\nYou have been promoted to **Trooper** and are now cleared for deployment."
  ).catch(() => null);

  return { ok: true };
}

async function moreTraining(guild, targetUserId, approverMember, interaction = null) {
  const member = await guild.members.fetch(targetUserId).catch(() => null);
  if (!member) return { ok: false, reason: "member_not_found" };

  await logOrientation(
    guild.client,
    [
      "⚠️ **Orientation Returned For More Training**",
      `Diver: ${member}`,
      `Reviewed by: ${approverMember}`,
    ].join("\n")
  );

  if (interaction) {
    const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0] || new EmbedBuilder())
      .setFooter({ text: `Returned for more training by ${approverMember.displayName}` });

    await interaction.update({
      embeds: [updatedEmbed],
      components: [],
    }).catch(console.error);
  }

  await member.send(
    "Your orientation review has been returned for additional training. Deploy again with the Vanguard and speak to Sergeant, Senior Officer, Strike Captain, High Command, or Vanguard Prime."
  ).catch(() => null);

  return { ok: true };
}

async function denyPromotion(guild, targetUserId, approverMember, interaction = null) {
  const member = await guild.members.fetch(targetUserId).catch(() => null);
  if (!member) return { ok: false, reason: "member_not_found" };

  await logOrientation(
    guild.client,
    [
      "❌ **Promotion Denied**",
      `Diver: ${member}`,
      `Reviewed by: ${approverMember}`,
    ].join("\n")
  );

  if (interaction) {
    const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0] || new EmbedBuilder())
      .setFooter({ text: `Denied by ${approverMember.displayName}` });

    await interaction.update({
      embeds: [updatedEmbed],
      components: [],
    }).catch(console.error);
  }

  await member.send(
    "Your Trooper promotion request was denied. Speak to Sergeant, Senior Officer, Strike Captain, High Command, or Vanguard Prime if you need help completing orientation."
  ).catch(() => null);

  return { ok: true };
}

async function kickRecruit(guild, targetUserId, approverMember, interaction = null) {
  const member = await guild.members.fetch(targetUserId).catch(() => null);
  if (!member) return { ok: false, reason: "member_not_found" };

  await logOrientation(
    guild.client,
    [
      "❌ **Recruit Removed**",
      `Diver: ${member.user.tag}`,
      `Removed by: ${approverMember}`,
    ].join("\n")
  );

  try {
    await member.send(
      "You have been removed from The Golden Vanguard due to incomplete recruit orientation."
    ).catch(() => null);

    await guild.members.kick(
      member.id,
      `Recruit removed by ${approverMember.user.tag} - orientation action`
    );
  } catch (err) {
    console.error("[orientationSystem] kickRecruit error:", err);

    if (interaction) {
      await interaction.reply({
        content: "I could not remove that recruit. Check permissions.",
        ephemeral: true,
      }).catch(() => null);
    }

    return { ok: false, reason: "kick_failed" };
  }

  if (interaction) {
    await interaction.reply({
      content: `❌ ${member.user.tag} has been removed.`,
      ephemeral: true,
    }).catch(() => null);
  }

  return { ok: true };
}

/* =========================
   BUTTON HANDLER
   ========================= */
async function handleOrientationButton(interaction) {
  if (!interaction.isButton()) return false;

  const { customId, member, guild } = interaction;
  if (!guild || !member) return false;

  if (
    customId !== "orientation_guide" &&
    customId !== "orientation_laws" &&
    customId !== "orientation_divisions" &&
    !customId.startsWith("orientation_approve_") &&
    !customId.startsWith("orientation_more_training_") &&
    !customId.startsWith("orientation_deny_") &&
    !customId.startsWith("orientation_promote_now_") &&
    !customId.startsWith("orientation_kick_")
  ) {
    return false;
  }

  if (customId.startsWith("orientation_promote_now_")) {
    if (!isApprover(member)) {
      await interaction.reply({
        content: "You do not have permission to manage recruits.",
        ephemeral: true,
      });
      return true;
    }

    const targetUserId = customId.split("_").pop();
    await approvePromotion(guild, targetUserId, member, interaction);
    return true;
  }

  if (customId.startsWith("orientation_kick_")) {
    if (!isApprover(member)) {
      await interaction.reply({
        content: "You do not have permission to manage recruits.",
        ephemeral: true,
      });
      return true;
    }

    const targetUserId = customId.split("_").pop();
    await kickRecruit(guild, targetUserId, member, interaction);
    return true;
  }

  if (
    customId.startsWith("orientation_approve_") ||
    customId.startsWith("orientation_more_training_") ||
    customId.startsWith("orientation_deny_")
  ) {
    if (!isApprover(member)) {
      await interaction.reply({
        content:
          "Only Sergeants, Senior Officers, Strike Captains, High Command, or Vanguard Prime can approve or review recruit promotions.",
        ephemeral: true,
      });
      return true;
    }

    const targetUserId = customId.split("_").pop();
    if (!targetUserId) {
      await interaction.reply({ content: "Invalid promotion target.", ephemeral: true });
      return true;
    }

    if (customId.startsWith("orientation_approve_")) {
      await approvePromotion(guild, targetUserId, member, interaction);
      return true;
    }

    if (customId.startsWith("orientation_more_training_")) {
      await moreTraining(guild, targetUserId, member, interaction);
      return true;
    }

    if (customId.startsWith("orientation_deny_")) {
      await denyPromotion(guild, targetUserId, member, interaction);
      return true;
    }
  }

  ensureRecruit(member.id);

  if (!isRecruitMember(member)) {
    await interaction.reply({
      content: "This orientation panel is for Recruits only.",
      ephemeral: true,
    });
    return true;
  }

  if (customId === "orientation_guide") {
    markGuideRead(member.id);
    await logProgress(member, "Guide reviewed");
    await autoRequestPromotionIfComplete(member);

    await interaction.reply({
      content: `✅ Marked as complete.\n\n${buildProgressText(member.id)}`,
      ephemeral: true,
    });
    return true;
  }

  if (customId === "orientation_laws") {
    markLawsRead(member.id);
    await logProgress(member, "Community laws reviewed");
    await autoRequestPromotionIfComplete(member);

    await interaction.reply({
      content: `✅ Marked as complete.\n\n${buildProgressText(member.id)}`,
      ephemeral: true,
    });
    return true;
  }

  if (customId === "orientation_divisions") {
    markDivisionsRead(member.id);
    await logProgress(member, "Divisions reviewed");
    await autoRequestPromotionIfComplete(member);

    await interaction.reply({
      content: `✅ Marked as complete.\n\n${buildProgressText(member.id)}`,
      ephemeral: true,
    });
    return true;
  }

  return false;
}

/* =========================
   VOICE TRACKING
   ========================= */
function shouldTrackVoiceChannel(channel) {
  if (!channel || channel.type !== 2) return false;
  if (!CONFIG.vcCategoryId) return true;
  return channel.parentId === CONFIG.vcCategoryId;
}

function getVoiceKey(guildId, recruitId, supervisorId, channelId) {
  return `${guildId}:${recruitId}:${supervisorId}:${channelId}`;
}

async function maybeCompleteSession(guild, session) {
  if (!guild || !session || session.completed) return false;

  const durationMs = Date.now() - session.startedAt;
  const enoughTime = durationMs >= CONFIG.minVcMinutes * 60 * 1000;
  if (!enoughTime) return false;

  const recruitRecord = ensureRecruit(session.recruitId);
  if (recruitRecord.deploymentComplete) {
    session.completed = true;
    return false;
  }

  markDeployment(session.recruitId, session.supervisorId, session.channelId);

  const recruitMember =
    guild.members.cache.get(session.recruitId) ||
    (await guild.members.fetch(session.recruitId).catch(() => null));

  if (recruitMember) {
    await logProgress(
      recruitMember,
      `Deployment detected with <@${session.supervisorId}>`
    ).catch(console.error);

    await autoRequestPromotionIfComplete(recruitMember).catch(console.error);
  }

  session.completed = true;
  return true;
}

async function scanVoiceSessions(guild) {
  if (!guild) return;

  const currentKeys = new Set();

  const voiceChannels = guild.channels.cache.filter((c) => shouldTrackVoiceChannel(c));

  for (const [, channel] of voiceChannels) {
    const members = [...channel.members.values()];
    const recruits = members.filter((m) => isRecruitMember(m));
    const supervisors = members.filter((m) => isSupervisor(m));

    if (!recruits.length || !supervisors.length) continue;

    for (const recruit of recruits) {
      for (const supervisor of supervisors) {
        if (recruit.id === supervisor.id) continue;

        const key = getVoiceKey(guild.id, recruit.id, supervisor.id, channel.id);
        currentKeys.add(key);

        if (!activeVcSessions.has(key)) {
          activeVcSessions.set(key, {
            guildId: guild.id,
            recruitId: recruit.id,
            supervisorId: supervisor.id,
            channelId: channel.id,
            startedAt: Date.now(),
            completed: false,
          });
        } else {
          const session = activeVcSessions.get(key);
          await maybeCompleteSession(guild, session);
          activeVcSessions.set(key, session);
        }
      }
    }
  }

  for (const [key, session] of activeVcSessions.entries()) {
    if (session.guildId !== guild.id) continue;
    if (currentKeys.has(key)) continue;
    activeVcSessions.delete(key);
  }
}

function handleVoiceStateUpdate(oldState, newState) {
  const guild = newState?.guild || oldState?.guild;
  if (!guild) return;
  scanVoiceSessions(guild).catch(console.error);
}

async function scanAllTrackedGuilds(client) {
  if (!client?.guilds?.cache) return;

  for (const guild of client.guilds.cache.values()) {
    await scanVoiceSessions(guild).catch(console.error);
  }
}

/* =========================
   AAR SUPPORT
   ========================= */
async function maybeAutoLogAAR(member) {
  if (!member || !isRecruitMember(member)) return false;

  const before = getRecruit(member.id);
  markAAR(member.id);
  const after = getRecruit(member.id);

  if (!before?.aarSubmitted && after?.aarSubmitted) {
    await logProgress(member, "AAR submitted");
    await autoRequestPromotionIfComplete(member);
  }

  return true;
}

/* =========================
   OVERDUE CHECK
   ========================= */
async function checkOverdueRecruits(client) {
  const db = loadDb();
  const now = Date.now();

  for (const userId of Object.keys(db)) {
    const recruit = db[userId];
    if (!recruit?.deadlineAt) continue;
    if (recruit.promoted) continue;

    const deadline = new Date(recruit.deadlineAt).getTime();
    if (Number.isNaN(deadline)) continue;
    if (now <= deadline) continue;

    const guilds = client.guilds.cache.values();

    for (const guild of guilds) {
      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member) continue;

      await createOrUpdateMonitorCard(member);

      if (!recruit.overdueAlertSent) {
        const pingText =
          [
            CONFIG.sergeantRoleId && `<@&${CONFIG.sergeantRoleId}>`,
            CONFIG.seniorOfficerRoleId && `<@&${CONFIG.seniorOfficerRoleId}>`,
            CONFIG.strikeCaptainRoleId && `<@&${CONFIG.strikeCaptainRoleId}>`,
            CONFIG.highCommandRoleId && `<@&${CONFIG.highCommandRoleId}>`,
            CONFIG.vanguardPrimeRoleId && `<@&${CONFIG.vanguardPrimeRoleId}>`,
          ]
            .filter(Boolean)
            .join(" ") || "Staff";

        await sendToChannel(client, CONFIG.recruitMonitorChannelId, {
          content: `⚠️ ${pingText} Recruit ${member} has exceeded the ${CONFIG.deadlineDays}-day orientation deadline.`,
          allowedMentions: {
            roles: [
              CONFIG.sergeantRoleId,
              CONFIG.seniorOfficerRoleId,
              CONFIG.strikeCaptainRoleId,
              CONFIG.highCommandRoleId,
              CONFIG.vanguardPrimeRoleId,
            ].filter(Boolean),
            users: [member.id],
          },
        });

        updateRecruit(userId, { overdueAlertSent: true });
      }
    }
  }
}

async function refreshAllMonitorCards(client) {
  if (!client?.guilds?.cache) return;

  const db = loadDb();

  for (const userId of Object.keys(db)) {
    for (const guild of client.guilds.cache.values()) {
      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member) continue;

      await createOrUpdateMonitorCard(member).catch(console.error);
      break;
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

  markGuideRead,
  markLawsRead,
  markDivisionsRead,
  markAAR,
  markDeployment,

  isComplete,
  getMissingSteps,
  progressCount,

  buildChecklistEmbed,
  buildChecklistButtons,
  buildProgressText,

  sendChecklistPanel,
  sendPromotionRequest,
  autoRequestPromotionIfComplete,

  handleOrientationButton,
  handleVoiceStateUpdate,
  scanAllTrackedGuilds,

  maybeAutoLogAAR,
  logNewRecruit,
  createOrUpdateMonitorCard,
  checkOverdueRecruits,
  refreshAllMonitorCards,

  isRecruitMember,
  isSupervisor,
  isApprover,
};