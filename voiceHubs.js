const { ChannelType, Events } = require("discord.js");

const HUB_CATEGORY_ID = "1478464677783666778";

const HUBS = {
  "1483530247809929286": { tag: "MO", label: "Major Order" },
  "1483530198119878831": { tag: "BOTS", label: "Automaton" },
  "1483530099914702948": { tag: "BUGS", label: "Terminid" },
  "1478912834539622611": { tag: "SQUIDS", label: "Illuminate" },
  "1478465577294233601": { tag: "DANGER", label: "Danger Room" },
};

const ignoredMoves = new Map();
const createCooldown = new Map();

function makeSafeName(username) {
  return (username || "Host").replace(/[^\w\s-]/g, "").slice(0, 16);
}

function isHub(channelId) {
  return !!channelId && HUBS[channelId] !== undefined;
}

function isManagedVC(channel) {
  if (!channel) return false;
  if (channel.type !== ChannelType.GuildVoice) return false;
  if (channel.parentId !== HUB_CATEGORY_ID) return false;
  if (HUBS[channel.id]) return false;
  return /^(MO|BOTS|BUGS|SQUIDS|DANGER)\s\|/i.test(channel.name);
}

function markIgnored(userId, ms = 3000) {
  ignoredMoves.set(userId, Date.now() + ms);
}

function isIgnored(userId) {
  const until = ignoredMoves.get(userId);
  if (!until) return false;

  if (Date.now() > until) {
    ignoredMoves.delete(userId);
    return false;
  }

  return true;
}

function onCreateCooldown(userId) {
  const until = createCooldown.get(userId);
  if (!until) return false;

  if (Date.now() > until) {
    createCooldown.delete(userId);
    return false;
  }

  return true;
}

function markCreateCooldown(userId, ms = 4000) {
  createCooldown.set(userId, Date.now() + ms);
}

async function deleteIfEmpty(channel) {
  if (!channel) return;

  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const fresh = channel.guild.channels.cache.get(channel.id);
    if (!fresh) return;
    if (!isManagedVC(fresh)) return;

    if (fresh.members.size === 0) {
      try {
        await fresh.delete("Auto delete empty squad VC");
      } catch (err) {
        console.error("[VoiceHub] Delete failed:", err);
      }
      return;
    }
  }
}

async function cleanupOrphans(guild) {
  const channels = guild.channels.cache.filter((c) => isManagedVC(c));

  for (const [, ch] of channels) {
    if (ch.members.size === 0) {
      try {
        await ch.delete("Startup cleanup");
      } catch (err) {
        console.error("[VoiceHub] Cleanup delete failed:", err);
      }
    }
  }
}

function setupVoiceHubs(client) {
  client.once(Events.ClientReady, async () => {
    for (const guild of client.guilds.cache.values()) {
      await cleanupOrphans(guild);
    }
    console.log("✅ Voice hubs online (clean upgraded mode)");
  });

  client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    const member = newState.member || oldState.member;
    if (!member || member.user.bot) return;

    const oldId = oldState.channelId;
    const newId = newState.channelId;

    if (oldId === newId) return;
    if (isIgnored(member.id)) return;

    // User joined a hub
    if (isHub(newId)) {
      if (onCreateCooldown(member.id)) return;
      markCreateCooldown(member.id);

      if (!newState.channel || newState.channel.id !== newId) return;

      const hub = HUBS[newId];
      const safeName = makeSafeName(member.user.username);
      const vcName = `${hub.tag} | ${safeName}`;

      try {
        const created = await newState.guild.channels.create({
          name: vcName,
          type: ChannelType.GuildVoice,
          parent: HUB_CATEGORY_ID,
          userLimit: 0,
          reason: `Join to create from ${hub.label}`,
        });

        markIgnored(member.id);
        await member.voice.setChannel(created);
      } catch (err) {
        console.error("[VoiceHub] Create failed:", err);
      }

      return;
    }

    // User left a managed VC
    if (oldId) {
      const oldChannel = oldState.channel;
      if (isManagedVC(oldChannel)) {
        deleteIfEmpty(oldChannel).catch((err) => {
          console.error("[VoiceHub] Delete check error:", err);
        });
      }
    }
  });
}

module.exports = { setupVoiceHubs };