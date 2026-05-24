const { ChannelType, Events } = require("discord.js");

const HUBS = {
  // HELLDIVERS
  "1497970074756321362": {
    tag: "MO",
    label: "Major Order",
    categoryId: "1478464677783666778",
  },
  "1483928217701060638": {
    tag: "BOTS",
    label: "Automaton",
    categoryId: "1478464677783666778",
  },
  "1483928278116077800": {
    tag: "BUGS",
    label: "Terminid",
    categoryId: "1478464677783666778",
  },
  "1483928332373332019": {
    tag: "SQUIDS",
    label: "Illuminate",
    categoryId: "1478464677783666778",
  },
  "1483928397275988139": {
    tag: "DANGER",
    label: "Danger Room",
    categoryId: "1478464677783666778",
  },

  // GTA — replace IDs
  "1505315362512572650": {
    tag: "OPS",
    label: "Criminal Operations",
    categoryId: "1505309836345344210",
  },
  "1505315445635547279": {
    tag: "HEIST",
    label: "Heist Team Alpha",
    categoryId: "1505309836345344210",
  },
  "1505315508566622218": {
    tag: "FREEROAM",
    label: "Free Roam Ops",
    categoryId: "1505309836345344210",
  },
  "1505315571560878142": {
    tag: "CREW",
    label: "Crew Command",
    categoryId: "1505309836345344210",
  },

  // INDIE / PARTY — replace IDs
  "1505317203514228876": {
    tag: "LETHAL",
    label: "Lethal Company",
    categoryId: "1505316630052344029",
  },
  "1505317260233801929": {
    tag: "REPO",
    label: "R.E.P.O",
    categoryId: "1505316630052344029",
  },
  "1505317338361237514": {
    tag: "RV",
    label: "RV There Yet?",
    categoryId: "1505316630052344029",
  },
  "1505317389447991409": {
    tag: "PARTY",
    label: "Let's Party",
    categoryId: "1505316630052344029",
  },

  // BATTLEFIELD
  "1505642842255523900": {
    tag: "ASSAULT",
    label: "Assault",
    categoryId: "1505639128845258976",
  },
  "1505643123584532631": {
    tag: "MEDIC",
    label: "Medic",
    categoryId: "1505639128845258976",
  },
  "1505647933532410077": {
    tag: "ENGINEER",
    label: "Engineer",
    categoryId: "1505639128845258976",
  },
  "1505648284050657310": {
    tag: "RECON",
    label: "Recon",
    categoryId: "1505639128845258976",
  }, 

  // OTHER
  "1488947979611013381": {
    tag: "GAMING", 
    label: "Gaming VC", 
    categoryId: "1305329362115235952", 
  },

  // ARC RAIDERS
  "1507760365965021404": {
    tag: "SURFACE",
    label: "Surface Operation",
    categoryId: "1507760365965021404",
  },
  "1507760410185564322": {
    tag: "EXTRACTION",
    label: "Extraction Point",
    categoryId: "1507760365965021404",
  },
  "1507760457165836510": {
    tag: "HIGH RISK",
    label: "High Risk Zone",
    categoryId: "1507760365965021404",
  }, 
  "1507760500983730197": {
    tag: "SALVAGE",
    label: "Salvage Teams",
    categoryId: "1507760365965021404",
  },

  // Minecraft
  "1507868614705811578": {
    tag: "SURVIVAL",
    label: "Survival Realm",
    categoryId: "1507865338312790137",
  },
  "1507868714979033108": {
    tag: "BUILDER",
    label: "Builder's Guild",
    categoryId: "1507865338312790137",
  },
  "1507868791437004881": {
    tag: "OVERWORLD",
    label: "Overworld Expedition",
    categoryId: "1507865338312790137",
  }, 
  "1507868864774668368": {
    tag: "RESOURCE",
    label: "Resource Gathering",
    categoryId: "1507865338312790137",
  },
};

const ignoredMoves = new Map();
const createCooldown = new Map();

function makeSafeName(username) {
  return (username || "Host").replace(/[^\w\s-]/g, "").slice(0, 16);
}

function isHub(channelId) {
  return !!channelId && HUBS[channelId] !== undefined;
}

function getManagedTagsRegex() {
  const tags = [...new Set(Object.values(HUBS).map((h) => h.tag))]
    .map((tag) => tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");

  return new RegExp(`^(${tags})\\s\\|`, "i");
}

function isManagedVC(channel) {
  if (!channel) return false;
  if (channel.type !== ChannelType.GuildVoice) return false;
  if (HUBS[channel.id]) return false;

  const tagRegex = getManagedTagsRegex();
  return tagRegex.test(channel.name);
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

    console.log("✅ Multi-game voice hubs online");
  });

  client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    const member = newState.member || oldState.member;
    if (!member || member.user.bot) return;

    const oldId = oldState.channelId;
    const newId = newState.channelId;

    if (oldId === newId) return;
    if (isIgnored(member.id)) return;

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
          parent: hub.categoryId,
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
