const fs = require("fs");
const path = require("path");
const { ChannelType, Events } = require("discord.js");

// Permanent join-to-create VC
const GAMING_VC_ID = "1488947979611013381";

// Category where Gaming VC and all temporary VCs are located
const LFG_CATEGORY_ID = "1305329362115235952";

// Initial name before the member uses @asktoplay
const DEFAULT_VC_NAME = "GAMING";

// Persistent ownership storage
const DATA_DIRECTORY = path.join(__dirname, "data");
const SESSION_FILE = path.join(DATA_DIRECTORY, "voiceSessions.json");

const voiceSessions = new Map();
const ignoredMoves = new Map();
const createCooldowns = new Map();
const creatingUsers = new Set();
const deleteChecks = new Set();

/* =========================
   STORAGE
   ========================= */

function ensureSessionFile() {
  if (!fs.existsSync(DATA_DIRECTORY)) {
    fs.mkdirSync(DATA_DIRECTORY, { recursive: true });
  }

  if (!fs.existsSync(SESSION_FILE)) {
    fs.writeFileSync(SESSION_FILE, "{}\n", "utf8");
  }
}

function loadVoiceSessions() {
  ensureSessionFile();
  voiceSessions.clear();

  try {
    const raw = fs.readFileSync(SESSION_FILE, "utf8");
    const parsed = JSON.parse(raw || "{}");

    for (const [channelId, record] of Object.entries(parsed)) {
      if (!record || typeof record !== "object") continue;

      voiceSessions.set(channelId, {
        guildId: String(record.guildId || ""),
        ownerId: String(record.ownerId || ""),
        createdAt: Number(record.createdAt || Date.now()),
        game: String(record.game || ""),
      });
    }
  } catch (error) {
    console.error("[VoiceHub] Could not load voice sessions:", error);
  }
}

function saveVoiceSessions() {
  ensureSessionFile();

  try {
    const output = Object.fromEntries(voiceSessions);
    const temporaryFile = `${SESSION_FILE}.tmp`;

    fs.writeFileSync(
      temporaryFile,
      `${JSON.stringify(output, null, 2)}\n`,
      "utf8"
    );

    fs.renameSync(temporaryFile, SESSION_FILE);
  } catch (error) {
    console.error("[VoiceHub] Could not save voice sessions:", error);
  }
}

function removeVoiceSession(channelId) {
  if (!voiceSessions.has(channelId)) return;

  voiceSessions.delete(channelId);
  saveVoiceSessions();
}

loadVoiceSessions();

/* =========================
   NAME CLEANING
   ========================= */

function cleanName(value, maximumLength) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\|/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximumLength);
}

function makeSafeUsername(username) {
  return cleanName(username, 20) || "Host";
}

function makeSafeGameName(game, maximumLength) {
  return cleanName(game, maximumLength);
}

/* =========================
   CHANNEL CHECKS
   ========================= */

function isGamingHub(channelId) {
  return channelId === GAMING_VC_ID;
}

function isManagedTemporaryVC(channel) {
  if (!channel) return false;
  if (channel.type !== ChannelType.GuildVoice) return false;
  if (channel.id === GAMING_VC_ID) return false;
  if (channel.parentId !== LFG_CATEGORY_ID) return false;

  return voiceSessions.has(channel.id);
}

/* =========================
   MOVE PROTECTION
   ========================= */

function markIgnoredMove(userId, milliseconds = 2500) {
  ignoredMoves.set(userId, Date.now() + milliseconds);
}

function shouldIgnoreMove(userId) {
  const until = ignoredMoves.get(userId);

  if (!until) return false;

  if (Date.now() >= until) {
    ignoredMoves.delete(userId);
    return false;
  }

  return true;
}

function markCreateCooldown(userId, milliseconds = 5000) {
  createCooldowns.set(userId, Date.now() + milliseconds);
}

function isOnCreateCooldown(userId) {
  const until = createCooldowns.get(userId);

  if (!until) return false;

  if (Date.now() >= until) {
    createCooldowns.delete(userId);
    return false;
  }

  return true;
}

/* =========================
   TEMPORARY VC DELETION
   ========================= */

async function deleteTemporaryVCIfEmpty(channel) {
  if (!channel || deleteChecks.has(channel.id)) return;

  deleteChecks.add(channel.id);

  try {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const freshChannel = await channel.guild.channels
        .fetch(channel.id)
        .catch(() => null);

      if (!freshChannel) {
        removeVoiceSession(channel.id);
        return;
      }

      if (!isManagedTemporaryVC(freshChannel)) {
        return;
      }

      if (freshChannel.members.size === 0) {
        try {
          await freshChannel.delete(
            "Automatically deleting empty temporary Gaming VC"
          );
        } catch (error) {
          // Unknown Channel means another delete check already removed it.
          if (error?.code !== 10003) {
            console.error("[VoiceHub] Delete failed:", error);
            return;
          }
        }

        removeVoiceSession(channel.id);
        return;
      }
    }
  } finally {
    deleteChecks.delete(channel.id);
  }
}

/* =========================
   STARTUP CLEANUP
   ========================= */

async function cleanupSavedVoiceSessions(client) {
  let changed = false;

  for (const [channelId, record] of voiceSessions.entries()) {
    const guild = client.guilds.cache.get(record.guildId);

    if (!guild) {
      voiceSessions.delete(channelId);
      changed = true;
      continue;
    }

    const channel = await guild.channels.fetch(channelId).catch(() => null);

    if (!channel) {
      voiceSessions.delete(channelId);
      changed = true;
      continue;
    }

    // Remove old records from the previous multi-category system
    // without deleting those unrelated channels.
    if (
      channel.type !== ChannelType.GuildVoice ||
      channel.parentId !== LFG_CATEGORY_ID ||
      channel.id === GAMING_VC_ID
    ) {
      voiceSessions.delete(channelId);
      changed = true;
      continue;
    }

    if (channel.members.size === 0) {
      try {
        await channel.delete(
          "Removing empty temporary Gaming VC during startup"
        );
      } catch (error) {
        if (error?.code !== 10003) {
          console.error("[VoiceHub] Startup cleanup failed:", error);
          continue;
        }
      }

      voiceSessions.delete(channelId);
      changed = true;
    }
  }

  if (changed) {
    saveVoiceSessions();
  }
}

/* =========================
   LFG GAME RENAME
   ========================= */

/**
 * Renames the temporary VC using the game entered in @asktoplay.
 *
 * Examples:
 * Fortnite | Moss
 * The Division 2 | Moss
 * Lethal Company | Moss
 *
 * Activity is not included.
 *
 * The LFG post still works when this returns false.
 * It silently refuses to rename:
 * - a permanent VC;
 * - another member's temporary VC;
 * - when the member is not in voice.
 */
async function renameManagedVcFromLfg({ guild, userId, game }) {
  if (!guild || !userId || !game) {
    console.warn("[VoiceHub] Rename skipped: missing required information.");
    return false;
  }

  const member = await guild.members.fetch(userId).catch(() => null);
  const voiceChannel = member?.voice?.channel;

  if (!member || !voiceChannel) {
    console.warn(
      `[VoiceHub] Rename skipped: user ${userId} is not in voice.`
    );
    return false;
  }

  if (
    voiceChannel.type !== ChannelType.GuildVoice ||
    voiceChannel.id === GAMING_VC_ID ||
    voiceChannel.parentId !== LFG_CATEGORY_ID
  ) {
    console.warn(
      `[VoiceHub] Rename skipped: ${voiceChannel.name} is not a temporary LFG VC.`
    );
    return false;
  }

  const safeUsername = makeSafeUsername(member.user.username);

  // Reload the saved records in case PM2 restarted.
  loadVoiceSessions();

  let session = voiceSessions.get(voiceChannel.id);

  // Recover the ownership record from the original VC name.
  if (!session) {
    const originalOwnerName =
      `${DEFAULT_VC_NAME} | ${safeUsername}`.slice(0, 100);

    if (voiceChannel.name !== originalOwnerName) {
      console.warn(
        `[VoiceHub] Rename skipped: no ownership record for ${voiceChannel.id}.`
      );
      return false;
    }

    session = {
      guildId: guild.id,
      ownerId: String(userId),
      createdAt: Date.now(),
      game: "",
    };

    voiceSessions.set(voiceChannel.id, session);
    saveVoiceSessions();

    console.log(
      `[VoiceHub] Recovered ownership for ${voiceChannel.name}.`
    );
  }

  if (String(session.ownerId) !== String(userId)) {
    console.warn(
      `[VoiceHub] Rename skipped: user ${userId} does not own ${voiceChannel.id}.`
    );
    return false;
  }

  const maximumGameLength = Math.max(
    1,
    100 - safeUsername.length - 3
  );

  const safeGame = makeSafeGameName(game, maximumGameLength);

  if (!safeGame) {
    console.warn("[VoiceHub] Rename skipped: empty game name.");
    return false;
  }

  const desiredName =
    `${safeGame} | ${safeUsername}`.slice(0, 100);

  try {
    await voiceChannel.setName(
      desiredName,
      "Updated from Ask-to-Play game entry"
    );

    session.game = safeGame;

    voiceSessions.set(voiceChannel.id, session);
    saveVoiceSessions();

    console.log(
      `[VoiceHub] Renamed "${voiceChannel.name}" to "${desiredName}".`
    );

    return true;
  } catch (error) {
    console.error("[VoiceHub] LFG rename failed:", error);
    return false;
  }
}

/* =========================
   VOICE HUB SYSTEM
   ========================= */

function setupVoiceHubs(client) {
  client.once(Events.ClientReady, async () => {
    await cleanupSavedVoiceSessions(client);

    console.log(
      "✅ Single Gaming VC join-to-create system online"
    );
  });

  client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    const member = newState.member || oldState.member;

    if (!member || member.user.bot) return;

    const oldChannelId = oldState.channelId;
    const newChannelId = newState.channelId;

    if (oldChannelId === newChannelId) return;

    // Always check whether the temporary VC they left is now empty.
    if (
      oldState.channel &&
      isManagedTemporaryVC(oldState.channel)
    ) {
      deleteTemporaryVCIfEmpty(oldState.channel).catch((error) => {
        console.error("[VoiceHub] Delete check failed:", error);
      });
    }

    // Ignore the follow-up event caused by the bot moving the member.
    if (shouldIgnoreMove(member.id)) {
      return;
    }

    // Only Gaming VC creates temporary channels.
    if (!isGamingHub(newChannelId)) {
      return;
    }

    if (
      creatingUsers.has(member.id) ||
      isOnCreateCooldown(member.id)
    ) {
      return;
    }

    creatingUsers.add(member.id);
    markCreateCooldown(member.id);

    let createdChannel = null;

    try {
      // Confirm they are still inside Gaming VC.
      if (
        !newState.channel ||
        newState.channel.id !== GAMING_VC_ID ||
        member.voice.channelId !== GAMING_VC_ID
      ) {
        return;
      }

      const safeUsername = makeSafeUsername(member.user.username);
      const temporaryName =
        `${DEFAULT_VC_NAME} | ${safeUsername}`.slice(0, 100);

      createdChannel = await newState.guild.channels.create({
        name: temporaryName,
        type: ChannelType.GuildVoice,
        parent: LFG_CATEGORY_ID,
        userLimit: 0,
        reason: "Join-to-create from Gaming VC",
      });

      voiceSessions.set(createdChannel.id, {
        guildId: newState.guild.id,
        ownerId: member.id,
        createdAt: Date.now(),
        game: "",
      });

      saveVoiceSessions();

      // They may have disconnected while Discord created the VC.
      if (member.voice.channelId !== GAMING_VC_ID) {
        await createdChannel
          .delete("Member left before temporary VC was ready")
          .catch(() => {});

        removeVoiceSession(createdChannel.id);
        return;
      }

      markIgnoredMove(member.id);

      await member.voice.setChannel(
        createdChannel,
        "Moving member into their temporary Gaming VC"
      );
    } catch (error) {
      console.error("[VoiceHub] Create or move failed:", error);

      if (createdChannel) {
        await createdChannel
          .delete("Cleaning up after failed temporary VC creation")
          .catch(() => {});

        removeVoiceSession(createdChannel.id);
      }
    } finally {
      creatingUsers.delete(member.id);
    }
  });
}

module.exports = {
  setupVoiceHubs,
  renameManagedVcFromLfg,
};
