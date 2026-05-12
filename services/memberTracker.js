// =========================
// services/memberTracker.js
// MEMBER JOIN / LEAVE TRACKER
// =========================

const fs = require("fs");
const path = require("path");
const { Events, EmbedBuilder } = require("discord.js");

const DATA_DIR = path.join(__dirname, "..", "data");
const TRACKING_FILE = path.join(DATA_DIR, "memberTracking.json");

const MEMBER_TRACKING_ENABLED =
  (process.env.MEMBER_TRACKING_ENABLED || "false").toLowerCase() === "true";

const MEMBER_LOG_CHANNEL_ID =
  (process.env.MEMBER_LOG_CHANNEL_ID || "").trim() || null;

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(TRACKING_FILE)) {
    fs.writeFileSync(
      TRACKING_FILE,
      JSON.stringify(
        {
          members: {},
          events: [],
        },
        null,
        2
      )
    );
  }
}

function loadStore() {
  ensureStore();

  try {
    return JSON.parse(fs.readFileSync(TRACKING_FILE, "utf8"));
  } catch (err) {
    console.error("❌ Failed to read memberTracking.json:", err);

    return {
      members: {},
      events: [],
    };
  }
}

function saveStore(store) {
  ensureStore();
  fs.writeFileSync(TRACKING_FILE, JSON.stringify(store, null, 2));
}

function formatDuration(ms) {
  if (!ms || ms < 0) return "Unknown";

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const remainingHours = hours % 24;
  const remainingMinutes = minutes % 60;

  if (days > 0) return `${days} day(s), ${remainingHours} hour(s)`;
  if (hours > 0) return `${hours} hour(s), ${remainingMinutes} minute(s)`;
  if (minutes > 0) return `${minutes} minute(s)`;

  return `${seconds} second(s)`;
}

function formatUserName(member) {
  return (
    member?.displayName ||
    member?.user?.globalName ||
    member?.user?.username ||
    member?.user?.tag ||
    "Unknown User"
  );
}

function getAccountAge(user) {
  return formatDuration(Date.now() - user.createdAt.getTime());
}

function getMemberRoles(member) {
  if (!member.roles || !member.roles.cache) return ["Unable to read roles"];

  const roles = member.roles.cache
    .filter((role) => role.id !== member.guild.id)
    .sort((a, b) => b.position - a.position)
    .map((role) => role.name);

  return roles.length ? roles : ["No roles"];
}

function getStatusFromStay(joinedAt, leftAt, roles = [], wasBackfilled = false) {
  const stayedMs = new Date(leftAt).getTime() - new Date(joinedAt).getTime();
  const stayedHours = stayedMs / 1000 / 60 / 60;

  const lowerRoles = roles.map((role) => role.toLowerCase());

  if (wasBackfilled) return "Existing member left";
  if (lowerRoles.includes("recruit")) return "Left during recruit stage";
  if (stayedHours < 1) return "Very early leave";
  if (stayedHours < 24) return "Left within 24 hours";
  if (stayedHours < 168) return "Left within first week";

  return "Established member left";
}

async function sendLog(client, embed) {
  if (!MEMBER_LOG_CHANNEL_ID) return;

  try {
    const channel = await client.channels.fetch(MEMBER_LOG_CHANNEL_ID);

    if (!channel || !channel.isTextBased()) {
      console.warn("⚠️ MEMBER_LOG_CHANNEL_ID is not a text channel.");
      return;
    }

    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error("❌ Failed to send member tracker log:", err);
  }
}

async function backfillCurrentMembers(client) {
  const store = loadStore();
  let added = 0;

  for (const guild of client.guilds.cache.values()) {
    try {
      const members = await guild.members.fetch();

      members.forEach((member) => {
        if (member.user.bot) return;

        const existingRecord = store.members[member.id];

        if (existingRecord) {
          store.members[member.id] = {
            ...existingRecord,
            isInServer: true,
            lastSeenAt: new Date().toISOString(),
          };

          return;
        }

        store.members[member.id] = {
          userId: member.id,
          username: member.user.username,
          tag: member.user.tag,
          displayName: formatUserName(member),
          joinedAt: member.joinedAt
            ? member.joinedAt.toISOString()
            : new Date().toISOString(),
          accountCreatedAt: member.user.createdAt.toISOString(),
          lastSeenAt: new Date().toISOString(),
          lastLeftAt: null,
          leaveCount: 0,
          joinCount: 1,
          isInServer: true,
          rolesAtLeave: [],
          backfilled: true,
        };

        added++;
      });
    } catch (err) {
      console.error(`❌ Failed to backfill members for ${guild.name}:`, err);
    }
  }

  saveStore(store);

  console.log(`✅ Member tracker backfill complete. Added ${added} existing member(s).`);
}

function setupMemberTracker(client) {
  if (!MEMBER_TRACKING_ENABLED) {
    console.log("ℹ️ Member tracker disabled.");
    return;
  }

  if (!MEMBER_LOG_CHANNEL_ID) {
    console.warn(
      "⚠️ MEMBER_TRACKING_ENABLED is true but MEMBER_LOG_CHANNEL_ID is missing."
    );
  }

  ensureStore();

  client.once(Events.ClientReady, async () => {
    await backfillCurrentMembers(client);
  });

  client.on(Events.GuildMemberAdd, async (member) => {
    if (member.user.bot) return;

    const store = loadStore();
    const now = new Date();

    const existingRecord = store.members[member.id];
    const isReturning = Boolean(existingRecord && existingRecord.leaveCount > 0);

    const displayName = formatUserName(member);

    store.members[member.id] = {
      userId: member.id,
      username: member.user.username,
      tag: member.user.tag,
      displayName,
      joinedAt: now.toISOString(),
      accountCreatedAt: member.user.createdAt.toISOString(),
      lastSeenAt: now.toISOString(),
      leaveCount: existingRecord?.leaveCount || 0,
      joinCount: (existingRecord?.joinCount || 0) + 1,
      isInServer: true,
      rolesAtLeave: existingRecord?.rolesAtLeave || [],
      lastLeftAt: existingRecord?.lastLeftAt || null,
      backfilled: false,
    };

    store.events.push({
      type: "join",
      userId: member.id,
      username: member.user.username,
      tag: member.user.tag,
      displayName,
      joinedAt: now.toISOString(),
      returning: isReturning,
    });

    saveStore(store);

    const embed = new EmbedBuilder()
      .setColor(isReturning ? 0xf1c40f : 0x2ecc71)
      .setTitle(isReturning ? "🔁 Returning Member Joined" : "✅ New Member Joined")
      .setDescription(`**${displayName}** has joined the server.`)
      .addFields(
        { name: "User", value: displayName, inline: true },
        { name: "Username", value: member.user.username, inline: true },
        { name: "User ID", value: member.id, inline: false },
        { name: "Account Age", value: getAccountAge(member.user), inline: true },
        {
          name: "Join Count",
          value: String(store.members[member.id].joinCount),
          inline: true,
        },
        {
          name: "Previous Leaves",
          value: String(store.members[member.id].leaveCount),
          inline: true,
        },
        {
          name: "Joined At",
          value: `<t:${Math.floor(now.getTime() / 1000)}:F>`,
          inline: false,
        }
      )
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
      .setTimestamp();

    await sendLog(client, embed);
  });

  client.on(Events.GuildMemberRemove, async (member) => {
    if (member.user.bot) return;

    const store = loadStore();
    const now = new Date();

    const existingRecord = store.members[member.id];
    const displayName = formatUserName(member);

    const joinedAt =
      existingRecord?.joinedAt ||
      member.joinedAt?.toISOString() ||
      now.toISOString();

    const rolesAtLeave = getMemberRoles(member);

    const stayedFor = formatDuration(
      now.getTime() - new Date(joinedAt).getTime()
    );

    const status = getStatusFromStay(
      joinedAt,
      now.toISOString(),
      rolesAtLeave,
      existingRecord?.backfilled || false
    );

    store.members[member.id] = {
      userId: member.id,
      username: member.user.username,
      tag: member.user.tag,
      displayName,
      joinedAt,
      accountCreatedAt: member.user.createdAt.toISOString(),
      lastSeenAt: now.toISOString(),
      lastLeftAt: now.toISOString(),
      leaveCount: (existingRecord?.leaveCount || 0) + 1,
      joinCount: existingRecord?.joinCount || 1,
      isInServer: false,
      rolesAtLeave,
      stayedFor,
      status,
      backfilled: existingRecord?.backfilled || false,
    };

    store.events.push({
      type: "leave",
      userId: member.id,
      username: member.user.username,
      tag: member.user.tag,
      displayName,
      joinedAt,
      leftAt: now.toISOString(),
      stayedFor,
      rolesAtLeave,
      status,
      wasPreviouslyTracked: Boolean(existingRecord),
    });

    saveStore(store);

    const embed = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle("🚪 Member Left Server")
      .setDescription(`**${displayName}** has left the server.`)
      .addFields(
        { name: "User", value: displayName, inline: true },
        { name: "Username", value: member.user.username, inline: true },
        { name: "User ID", value: member.id, inline: false },
        { name: "Stayed For", value: stayedFor, inline: true },
        { name: "Status", value: status, inline: true },
        {
          name: "Joined At",
          value: `<t:${Math.floor(new Date(joinedAt).getTime() / 1000)}:F>`,
          inline: false,
        },
        {
          name: "Left At",
          value: `<t:${Math.floor(now.getTime() / 1000)}:F>`,
          inline: false,
        },
        {
          name: "Roles At Leave",
          value: rolesAtLeave.join(", ").slice(0, 1024),
          inline: false,
        },
        {
          name: "Total Leaves",
          value: String(store.members[member.id].leaveCount),
          inline: true,
        }
      )
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
      .setTimestamp();

    await sendLog(client, embed);
  });

  console.log("✅ Member tracker loaded.");
}

module.exports = {
  setupMemberTracker,
};