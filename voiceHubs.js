const { ChannelType, PermissionsBitField, Events } = require("discord.js");

// Category that contains your hub VCs + created squad VCs
const HUB_CATEGORY_ID = "1478464677783666778";

// Hub VC channel IDs -> tag/label
const HUBS = {
  "1478464785069637663": { tag: "MO", label: "Major Order" },
  "1478465018164150415": { tag: "BOTS", label: "Automaton" },
  "1478465229829570762": { tag: "BUGS", label: "Terminid" },
  "1478912834539622611": { tag: "SQUIDS", label: "Illuminate" },
  "1478465577294233601": { tag: "TRAIN", label: "Training" },
};

// Track created squad channels since bot start
const tempChannels = new Map();

function makeSafeName(username) {
  return (username || "Host").replace(/[^\w\s-]/g, "").slice(0, 16);
}

function isCreatedSquadChannel(ch) {
  if (!ch) return false;
  if (ch.type !== ChannelType.GuildVoice) return false;
  if (ch.parentId !== HUB_CATEGORY_ID) return false;
  return /^(MO|BOTS|BUGS|ILL|TRAIN)\s\|/i.test(ch.name);
}

async function cleanupEmptySquadChannels(guild) {
  // On startup, delete empty created squad channels (prevents clutter after restarts)
  const channels = guild.channels.cache.filter((ch) => isCreatedSquadChannel(ch));

  for (const [, ch] of channels) {
    if (ch.members.size === 0) {
      try {
        await ch.delete("Cleanup: empty squad VC on startup");
      } catch {}
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
    const member = newState.member;
    if (!member) return;

    // ============================
    // 1) JOINED or SWITCHED into a hub VC
    // ============================
    // (This is more reliable than "joined from nothing" only)
    if (newState.channelId && oldState.channelId !== newState.channelId) {
      const hub = HUBS[newState.channelId];
      if (hub) {
        // extra safety: hub must be inside the correct category
        if (newState.channel?.parentId !== HUB_CATEGORY_ID) return;

        const safeName = makeSafeName(member.user.username);
        const channelName = `${hub.tag} | ${safeName}`;

        try {
          const created = await newState.guild.channels.create({
            name: channelName,
            type: ChannelType.GuildVoice,
            parent: HUB_CATEGORY_ID,
            userLimit: 0, // set 0 for unlimited
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

          tempChannels.set(created.id, true);

          // Move member into created VC
          await member.voice.setChannel(created);
        } catch (err) {
          console.error("[VoiceHubs] Create/move failed:", err);
        }
        return;
      }
    }

    // ============================
    // 2) LEFT a created squad VC -> if empty, delete it
    // ============================
    if (oldState.channelId && oldState.channelId !== newState.channelId) {
      const ch = oldState.channel;
      if (!ch) return;

      // Delete if it's one we created (either tracked in memory OR matches naming pattern)
      const shouldManage =
        tempChannels.has(oldState.channelId) || isCreatedSquadChannel(ch);

      if (!shouldManage) return;

      if (ch.members.size === 0) {
        try {
          await ch.delete("Auto-delete empty squad VC");
        } catch (err) {
          console.error("[VoiceHubs] Delete failed:", err);
        } finally {
          tempChannels.delete(oldState.channelId);
        }
      }
    }
  });
}

module.exports = { setupVoiceHubs };