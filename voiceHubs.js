const { ChannelType, PermissionsBitField, Events } = require("discord.js");

// Category that contains your hub VCs + created squad VCs
const HUB_CATEGORY_ID = "1478464677783666778";

// Exact hub VC IDs
const HUBS = {
  "1478464785069637663": { tag: "MO", label: "Major Order" },
  "1478465018164150415": { tag: "BOTS", label: "Automaton" },
  "1478465229829570762": { tag: "BUGS", label: "Terminid" },
  "1478912834539622611": { tag: "SQUIDS", label: "Illuminate" },
  "1478465577294233601": { tag: "TRAIN", label: "Training" },
};

// In-memory tracker for channels created since current bot boot
const tempChannels = new Map();

// Prevent reacting to the bot's own move event
const ignoredMoves = new Map();

function makeSafeName(username) {
  return (username || "Host").replace(/[^\w\s-]/g, "").slice(0, 16);
}

function isHubChannelId(channelId) {
  return !!channelId && !!HUBS[channelId];
}

function isManagedSquadChannel(channel) {
  if (!channel) return false;
  if (channel.type !== ChannelType.GuildVoice) return false;
  if (channel.parentId !== HUB_CATEGORY_ID) return false;

  // Must NOT be one of the hub channels
  if (HUBS[channel.id]) return false;

  // Match created VC names like:
  // MO | Moss
  // BOTS | D10 | Moss
  // BUGS | Moss
  // SQUIDS | D9 | Moss
  // TRAIN | Moss
  return /^(MO|BOTS|BUGS|SQUIDS|TRAIN)\s\|/i.test(channel.name);
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

  // Let Discord finish updating member counts
  await new Promise((resolve) => setTimeout(resolve, 1200));

  const fresh = channel.guild.channels.cache.get(channel.id);
  if (!fresh) {
    tempChannels.delete(channel.id);
    return;
  }

  if (!isManagedSquadChannel(fresh)) {
    tempChannels.delete(channel.id);
    return;
  }

  if (fresh.members.size === 0) {
    try {
      await fresh.delete(reason);
    } catch (err) {
      console.error("[VoiceHubs] Delete failed:", err);
    } finally {
      tempChannels.delete(channel.id);
    }
  }
}

async function cleanupEmptySquadChannels(guild) {
  const candidates = guild.channels.cache.filter((ch) => isManagedSquadChannel(ch));

  for (const [, ch] of candidates) {
    if (ch.members.size === 0) {
      try {
        await ch.delete("Cleanup: empty squad VC on startup");
      } catch {}
      tempChannels.delete(ch.id);
    }
  }
}

function setupVoiceHubs(client) {
  client.once(Events.ClientReady, async () => {
    for (const guild of client.guilds.cache.values()) {
      await cleanupEmptySquadChannels(guild);
    }
    console.log("✅ Voice hubs online (Join-to-Create enabled).");
  });

  client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    const member = newState.member || oldState.member;
    if (!member || member.user.bot) return;

    const oldChannelId = oldState.channelId;
    const newChannelId = newState.channelId;

    if (oldChannelId === newChannelId) return;

    // Ignore the follow-up event caused by bot moving the user
    if (isIgnoredMove(member.id)) return;

    // 1) User joined one of the exact hub VCs
    if (isHubChannelId(newChannelId)) {
      const hub = HUBS[newChannelId];
      const hubChannel = newState.channel;

      if (!hubChannel || hubChannel.parentId !== HUB_CATEGORY_ID) return;

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

    // 2) Someone left a squad VC -> delete it if now empty
    if (oldChannelId) {
      const oldChannel = oldState.channel;
      if (isManagedSquadChannel(oldChannel)) {
        deleteIfEmpty(oldChannel).catch((err) => {
          console.error("[VoiceHubs] Delayed delete check failed:", err);
        });
      }
    }
  });
}

module.exports = { setupVoiceHubs };