const { ChannelType, PermissionsBitField, Events } = require("discord.js");

// Category that contains your 5 hub VCs + created squad VCs
const HUB_CATEGORY_ID = "1478464677783666778";

// Exact hub channels only
const HUBS = {
  "1478464785069637663": { tag: "MO", label: "Major Order" },
  "1478465018164150415": { tag: "BOTS", label: "Automaton" },
  "1478465229829570762": { tag: "BUGS", label: "Terminid" },
  "1478465444384997469": { tag: "ILL", label: "Illuminate" },
  "1478465577294233601": { tag: "TRAIN", label: "Training" },
};

// tempChannelId -> { ownerId, hubId, createdAt }
const tempChannels = new Map();

// userIds temporarily ignored after the bot moves them
const ignoredMoves = new Map();

function makeSafeName(username) {
  return (username || "Host").replace(/[^\w\s-]/g, "").slice(0, 16);
}

function isHubChannelId(channelId) {
  return !!channelId && !!HUBS[channelId];
}

function isManagedTempChannel(channel) {
  if (!channel) return false;
  return tempChannels.has(channel.id);
}

function markIgnoredMove(userId, ms = 3000) {
  ignoredMoves.set(userId, Date.now() + ms);
}

function isIgnoredMove(userId) {
  const until = ignoredMoves.get(userId);
  if (!until) return false;

  if (Date.now() > until) {
    ignoredMoves.delete(userId);
    return false;
  }

  return true;
}

async function deleteIfEmpty(channel, reason = "Auto-delete empty squad VC") {
  if (!channel) return;

  // Let Discord fully update membership first
  await new Promise((resolve) => setTimeout(resolve, 800));

  // Re-fetch from cache/guild if possible
  const fresh = channel.guild.channels.cache.get(channel.id);
  if (!fresh) {
    tempChannels.delete(channel.id);
    return;
  }

  if (fresh.type !== ChannelType.GuildVoice) return;
  if (!tempChannels.has(fresh.id)) return;

  if (fresh.members.size === 0) {
    try {
      await fresh.delete(reason);
    } catch (err) {
      console.error("[VoiceHubs] Delete failed:", err);
    } finally {
      tempChannels.delete(fresh.id);
    }
  }
}

async function cleanupEmptyTempChannels(guild) {
  for (const [channelId] of tempChannels) {
    const ch = guild.channels.cache.get(channelId);
    if (!ch) {
      tempChannels.delete(channelId);
      continue;
    }

    if (ch.type === ChannelType.GuildVoice && ch.members.size === 0) {
      try {
        await ch.delete("Cleanup: empty squad VC on startup");
      } catch {}
      tempChannels.delete(channelId);
    }
  }
}

function setupVoiceHubs(client) {
  client.once(Events.ClientReady, async () => {
    for (const guild of client.guilds.cache.values()) {
      await cleanupEmptyTempChannels(guild);
    }
    console.log("✅ Voice hubs online (Join-to-Create enabled).");
  });

  client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    const member = newState.member || oldState.member;
    if (!member || member.user.bot) return;

    const oldChannelId = oldState.channelId;
    const newChannelId = newState.channelId;

    // Ignore the follow-up event caused by the bot moving a user
    if (isIgnoredMove(member.id)) {
      return;
    }

    // No actual VC change
    if (oldChannelId === newChannelId) return;

    // ============================
    // 1) User joined one of the 5 hub channels
    // ============================
    if (isHubChannelId(newChannelId)) {
      const hub = HUBS[newChannelId];
      const hubChannel = newState.channel;

      if (!hubChannel) return;
      if (hubChannel.parentId !== HUB_CATEGORY_ID) return;

      const safeName = makeSafeName(member.user.username);
      const channelName = `${hub.tag} | ${safeName}`;

      try {
        const created = await newState.guild.channels.create({
          name: channelName,
          type: ChannelType.GuildVoice,
          parent: HUB_CATEGORY_ID,
          userLimit: 0, // unlimited
          reason: `Join-to-create from hub: ${hub.label}`,
          permissionOverwrites: [
            {
              id: member.id,
              allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.Connect,
                PermissionsBitField.Flags.Speak,
                PermissionsBitField.Flags.Stream,
                PermissionsBitField.Flags.UseVAD,
                PermissionsBitField.Flags.ManageChannels,
                PermissionsBitField.Flags.MoveMembers,
              ],
            },
          ],
        });

        tempChannels.set(created.id, {
          ownerId: member.id,
          hubId: newChannelId,
          createdAt: Date.now(),
        });

        markIgnoredMove(member.id);
        await member.voice.setChannel(created);
      } catch (err) {
        console.error("[VoiceHubs] Create/move failed:", err);
      }

      return;
    }

    // ============================
    // 2) Someone left one of our temp VCs
    // Check old channel after a delay and delete if empty
    // ============================
    if (oldChannelId) {
      const oldChannel = oldState.channel;
      if (isManagedTempChannel(oldChannel)) {
        deleteIfEmpty(oldChannel).catch((err) => {
          console.error("[VoiceHubs] Delayed delete check failed:", err);
        });
      }
    }
  });
}

module.exports = { setupVoiceHubs };
