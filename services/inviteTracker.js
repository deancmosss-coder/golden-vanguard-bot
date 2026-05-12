// =========================
// services/inviteTracker.js
// INVITE TRACKER
// =========================

const { Events } = require("discord.js");

const inviteCache = new Map();

// =========================
// CACHE INVITES
// =========================

async function cacheGuildInvites(guild) {
  try {
    const invites = await guild.invites.fetch();

    const mapped = new Map();

    invites.forEach((invite) => {
      mapped.set(invite.code, {
        code: invite.code,
        uses: invite.uses || 0,
        inviterId: invite.inviter?.id || null,
        inviterName:
          invite.inviter?.globalName ||
          invite.inviter?.username ||
          "Unknown",
        channelId: invite.channel?.id || null,
        channelName: invite.channel?.name || "Unknown",
      });
    });

    inviteCache.set(guild.id, mapped);

    console.log(
      `✅ Cached ${mapped.size} invite(s) for guild: ${guild.name}`
    );
  } catch (err) {
    console.error(
      `❌ Failed to cache invites for guild ${guild.name}:`,
      err
    );
  }
}

// =========================
// FIND USED INVITE
// =========================

async function resolveUsedInvite(member) {
  try {
    const guild = member.guild;

    const oldInvites = inviteCache.get(guild.id);

    const newInvites = await guild.invites.fetch();

    let usedInvite = null;

    for (const invite of newInvites.values()) {
      const oldInvite = oldInvites?.get(invite.code);

      const oldUses = oldInvite?.uses || 0;
      const newUses = invite.uses || 0;

      if (newUses > oldUses) {
        usedInvite = invite;
        break;
      }
    }

    // Refresh cache
    await cacheGuildInvites(guild);

    if (!usedInvite) {
      return {
        code: "Unknown",
        uses: 0,
        inviterId: null,
        inviterName: "Unknown",
        channelName: "Unknown",
      };
    }

    return {
      code: usedInvite.code,
      uses: usedInvite.uses || 0,
      inviterId: usedInvite.inviter?.id || null,
      inviterName:
        usedInvite.inviter?.globalName ||
        usedInvite.inviter?.username ||
        "Unknown",
      channelName: usedInvite.channel?.name || "Unknown",
    };
  } catch (err) {
    console.error("❌ Failed to resolve used invite:", err);

    return {
      code: "Unknown",
      uses: 0,
      inviterId: null,
      inviterName: "Unknown",
      channelName: "Unknown",
    };
  }
}

// =========================
// SETUP
// =========================

function setupInviteTracker(client) {
  client.once(Events.ClientReady, async () => {
    console.log("📨 Initialising invite tracker...");

    for (const guild of client.guilds.cache.values()) {
      await cacheGuildInvites(guild);
    }

    console.log("✅ Invite tracker ready.");
  });

  client.on(Events.InviteCreate, async (invite) => {
    await cacheGuildInvites(invite.guild);
  });

  client.on(Events.InviteDelete, async (invite) => {
    await cacheGuildInvites(invite.guild);
  });
}

module.exports = {
  setupInviteTracker,
  resolveUsedInvite,
};