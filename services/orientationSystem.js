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

// Strike Captain and higher can approve.
CONFIG.approverRoleIds = [
  CONFIG.strikeCaptainRoleId,
  CONFIG.highCommandRoleId,
  CONFIG.vanguardPrimeRoleId,
].filter(Boolean);

// Strike Captain and higher can supervise missions.
CONFIG.supervisorRoleIds = [
  CONFIG.strikeCaptainRoleId,
  CONFIG.highCommandRoleId,
  CONFIG.vanguardPrimeRoleId,
].filter(Boolean);

// key = `${guildId}:${recruitId}:${supervisorId}:${channelId}`
const activeVcSessions = new Map();

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
  if (!r.deploymentComplete) missing.push("Complete a deployment with Strike Captain or higher");
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

function buildChecklistEmbed() {
  return new EmbedBuilder()
    .setTitle("⭐ Recruit Orientation Checklist")
    .setDescription(
      [
        "Welcome, Diver.",
        "",
        "Before becoming a **Trooper**, recruits must complete the following:",
        "",
        "⬜ Read the **Vanguard Field Manual**",
        "⬜ Review the **Community Laws**",
        "⬜ Review the **Vanguard Divisions**",
        "⬜ Complete a deployment with a **Strike Captain or higher**",
        "⬜ Submit an **After Action Report (AAR)** using `/run`",
        "",
        "Once complete, you may request promotion to **Trooper**.",
      ].join("\n")
    )
    .setFooter({ text: "Use the buttons below to confirm the first three steps." });
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
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("orientation_request_promotion")
        .setLabel("⭐ Request Promotion")
        .setStyle(ButtonStyle.Primary)
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
    `${r.deploymentComplete ? "✅" : "⬜"} Deployment with Strike Captain+`,
    `${r.aarSubmitted ? "✅" : "⬜"} AAR submitted`,
  ].join("\n");
}

async function sendChecklistPanel(client) {
  if (!CONFIG.checklistChannelId) return null;
  const channel = await client.channels.fetch(CONFIG.checklistChannelId).catch(() => null);
  if (!channel?.isTextBased?.()) return null;

  return channel.send({
    embeds: [buildChecklistEmbed()],
    components: buildChecklistButtons(),
  });
}

async function sendToChannel(client, channelId, payload) {
  if (!channelId) return null;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased?.()) return null;
  return channel.send(payload).catch((err) => {
    console.error("[orientationSystem] sendToChannel error:", err);
    return null;
  });
}

async function logRecruitMonitor(client, message) {
  return sendToChannel(client, CONFIG.recruitMonitorChannelId, { content: message });
}

async function logOrientation(client, message) {
  return sendToChannel(client, CONFIG.orientationLogChannelId, { content: message });
}

async function announcePromotion(client, member, approverMember) {
  if (!CONFIG.promotionAnnounceChannelId) return null;

  return sendToChannel(client, CONFIG.promotionAnnounceChannelId, {
    content: [
      "🪖 **WELCOME TO THE GOLDEN VANGUARD**",
      "",
      `${member} has completed Recruit Orientation and has been promoted to **Trooper**.`,
      "",
      "Welcome to the Vanguard, Diver.",
      "Deploy together. Reinforce together. Win together.",
      "",
      `Approved by: ${approverMember}`,
    ].join("\n"),
    allowedMentions: { users: [member.id] },
  });
}

async function logNewRecruit(member) {
  ensureRecruit(member.id);
  await logRecruitMonitor(
    member.client,
    [
      "🪖 **New Recruit Registered**",
      `Diver: ${member}`,
      `Progress: 0/5`,
      `Status: Orientation started`,
    ].join("\n")
  );
}

async function logProgress(member, label) {
  const p = progressCount(member.id);
  await logRecruitMonitor(
    member.client,
    [
      "📈 **Recruit Progress Update**",
      `Diver: ${member}`,
      `Update: ${label}`,
      `Progress: ${p.done}/${p.total}`,
    ].join("\n")
  );
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

  return { ok: Boolean(sent) };
}

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
      `Rank: Trooper`,
    ].join("\n")
  );

  await announcePromotion(guild.client, member, approverMember).catch(console.error);

  if (interaction) {
    const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0] || new EmbedBuilder())
      .setFooter({ text: `Approved by ${approverMember.displayName}` });

    await interaction.update({
      embeds: [updatedEmbed],
      components: [],
    }).catch(console.error);
  }

  await member
    .send(
      "Welcome to the Vanguard, Diver.\n\nYou have been promoted to **Trooper** and are now cleared for deployment."
    )
    .catch(() => null);

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

  await member
    .send(
      "Your orientation review has been returned for additional training. Deploy again with the Vanguard and speak to Strike Captain or higher."
    )
    .catch(() => null);

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

  await member
    .send(
      "Your Trooper promotion request was denied. Speak to Strike Captain or higher if you need help completing orientation."
    )
    .catch(() => null);

  return { ok: true };
}

async function handleOrientationButton(interaction) {
  if (!interaction.isButton()) return false;

  const { customId, member, guild } = interaction;
  if (!guild || !member) return false;

  if (
    customId !== "orientation_guide" &&
    customId !== "orientation_laws" &&
    customId !== "orientation_divisions" &&
    customId !== "orientation_request_promotion" &&
    !customId.startsWith("orientation_approve_") &&
    !customId.startsWith("orientation_more_training_") &&
    !customId.startsWith("orientation_deny_")
  ) {
    return false;
  }

  if (
    customId.startsWith("orientation_approve_") ||
    customId.startsWith("orientation_more_training_") ||
    customId.startsWith("orientation_deny_")
  ) {
    if (!isApprover(member)) {
      await interaction.reply({
        content: "Only Strike Captain or higher can approve or review recruit promotions.",
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
    await interaction.reply({
      content: `✅ Marked as complete.\n\n${buildProgressText(member.id)}`,
      ephemeral: true,
    });
    return true;
  }

  if (customId === "orientation_laws") {
    markLawsRead(member.id);
    await logProgress(member, "Community laws reviewed");
    await interaction.reply({
      content: `✅ Marked as complete.\n\n${buildProgressText(member.id)}`,
      ephemeral: true,
    });
    return true;
  }

  if (customId === "orientation_divisions") {
    markDivisionsRead(member.id);
    await logProgress(member, "Divisions reviewed");
    await interaction.reply({
      content: `✅ Marked as complete.\n\n${buildProgressText(member.id)}`,
      ephemeral: true,
    });
    return true;
  }

  if (customId === "orientation_request_promotion") {
    const recruit = ensureRecruit(member.id);

    if (recruit.promoted) {
      await interaction.reply({
        content: "You have already been promoted to Trooper.",
        ephemeral: true,
      });
      return true;
    }

    if (!isComplete(member.id)) {
      const missing = getMissingSteps(member.id)
        .map((x) => `• ${x}`)
        .join("\n");

      await interaction.reply({
        content: `You are not ready for promotion yet.\n\nMissing steps:\n${missing}\n\n${buildProgressText(member.id)}`,
        ephemeral: true,
      });
      return true;
    }

    if (recruit.promotionRequested) {
      await interaction.reply({
        content: "Your promotion request has already been sent for review.",
        ephemeral: true,
      });
      return true;
    }

    const result = await sendPromotionRequest(member);
    if (!result.ok) {
      await interaction.reply({
        content: "I could not send your promotion request.",
        ephemeral: true,
      });
      return true;
    }

    await interaction.reply({
      content: "⭐ Your promotion request has been sent for review.",
      ephemeral: true,
    });
    return true;
  }

  return false;
}

function shouldTrackVoiceChannel(channel) {
  if (!channel || channel.type !== 2) return false;
  if (!CONFIG.vcCategoryId) return true;
  return channel.parentId === CONFIG.vcCategoryId;
}

function getVoiceKey(guildId, recruitId, supervisorId, channelId) {
  return `${guildId}:${recruitId}:${supervisorId}:${channelId}`;
}

function scanVoiceSessions(guild) {
  if (!guild) return;

  const now = Date.now();
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
            startedAt: now,
            completed: false,
          });
        } else {
          const session = activeVcSessions.get(key);

          if (!session.completed) {
            const durationMs = now - session.startedAt;
            const enoughTime = durationMs >= CONFIG.minVcMinutes * 60 * 1000;

            if (enoughTime) {
              const recruitRecord = ensureRecruit(session.recruitId);

              if (!recruitRecord.deploymentComplete) {
                markDeployment(session.recruitId, session.supervisorId, session.channelId);

                const recruitMember = guild.members.cache.get(session.recruitId);
                if (recruitMember) {
                  logProgress(
                    recruitMember,
                    `Deployment detected with <@${session.supervisorId}>`
                  ).catch(console.error);
                }
              }

              session.completed = true;
              activeVcSessions.set(key, session);
            }
          }
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
  scanVoiceSessions(guild);
}

async function maybeAutoLogAAR(member) {
  if (!member || !isRecruitMember(member)) return false;

  const before = getRecruit(member.id);
  markAAR(member.id);
  const after = getRecruit(member.id);

  if (!before?.aarSubmitted && after?.aarSubmitted) {
    await logProgress(member, "AAR submitted");
  }

  return true;
}

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

  handleOrientationButton,
  handleVoiceStateUpdate,

  maybeAutoLogAAR,
  logNewRecruit,
};
