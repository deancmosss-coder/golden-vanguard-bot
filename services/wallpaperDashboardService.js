// =========================
// services/wallpaperDashboardService.js
// Golden Vanguard Wallpaper Dashboard API
// =========================

const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");

const DASHBOARD_PORT = Number(process.env.DASHBOARD_PORT || 3050);
const DASHBOARD_GUILD_ID = (process.env.DASHBOARD_GUILD_ID || "").trim();

const MEMBER_TRACKING_FILE = path.join(
  __dirname,
  "../data/memberTracking.json"
);

function getTargetGuild(client) {
  if (DASHBOARD_GUILD_ID) {
    return client.guilds.cache.get(DASHBOARD_GUILD_ID) || null;
  }

  return client.guilds.cache.first() || null;
}

function countOnlineMembers(guild) {
  let online = 0;

  guild.presences.cache.forEach((presence) => {
    if (!presence?.userId) return;
    if (presence.status === "offline") return;
    online++;
  });

  return online;
}

function getVoiceStats(guild) {
  const activeVoiceChannels = guild.channels.cache.filter((channel) => {
    return channel.isVoiceBased?.() && channel.members && channel.members.size > 0;
  });

  let usersInVoice = 0;

  activeVoiceChannels.forEach((channel) => {
    usersInVoice += channel.members.filter((member) => !member.user.bot).size;
  });

  return {
    usersInVoice,
    activeVoiceChannels: activeVoiceChannels.size,
  };
}

function buildAskToPlayStats(sessions, askToPlayService) {
  if (!sessions || !askToPlayService) {
    return {
      activeSessions: 0,
      playersLooking: 0,
      games: [],
    };
  }

  const gameMap = new Map();
  let playersLooking = 0;

  for (const session of sessions.values()) {
    const config =
      typeof askToPlayService.getSessionConfig === "function"
        ? askToPlayService.getSessionConfig(session)
        : null;

    const gameName =
      session.customGame ||
      config?.displayName ||
      session.gameKey ||
      "Unknown Game";

    const rosterSize = session.roster?.size || 1;

    playersLooking += rosterSize;

    const existing = gameMap.get(gameName) || {
      game: gameName,
      sessions: 0,
      players: 0,
    };

    existing.sessions += 1;
    existing.players += rosterSize;

    gameMap.set(gameName, existing);
  }

  return {
    activeSessions: sessions.size,
    playersLooking,
    games: [...gameMap.values()].slice(0, 3),
  };
}

function buildActivityFeed() {
  try {
    if (!fs.existsSync(MEMBER_TRACKING_FILE)) {
      return [
        "Nexus activity feed waiting for server events",
        "No recent community activity found",
        "Ask-To-Play system online",
        "Golden Vanguard systems standing by",
      ];
    }

    const store = JSON.parse(fs.readFileSync(MEMBER_TRACKING_FILE, "utf8"));
    const events = Array.isArray(store.events) ? store.events : [];

    const latest = events
      .slice(-8)
      .reverse()
      .map((event) => {
        const name =
          event.displayName ||
          event.username ||
          event.tag ||
          "Someone";

        if (event.type === "join") {
          return event.returning
            ? `Returning member ${name} joined the server`
            : `${name} joined the server`;
        }

        if (event.type === "leave") {
          return `${name} left the server`;
        }

        return `${name} created community activity`;
      })
      .slice(0, 4);

    if (!latest.length) {
      return [
        "Nexus activity feed waiting for server events",
        "No recent community activity found",
        "Ask-To-Play system online",
        "Golden Vanguard systems standing by",
      ];
    }

    return latest;
  } catch (err) {
    console.error("❌ Failed to build activity feed:", err);

    return [
      "Activity feed temporarily unavailable",
      "Nexus API still online",
      "Community systems standing by",
      "Golden Vanguard monitoring active",
    ];
  }
}

function startWallpaperDashboardService(client, options = {}) {
  const { sessions, askToPlayService } = options;

  const app = express();

  app.use(cors());

  app.get("/", (req, res) => {
    res.json({
      ok: true,
      service: "Golden Vanguard Wallpaper Dashboard API",
      endpoint: "/dashboard",
    });
  });

  app.get("/dashboard", async (req, res) => {
    try {
      const guild = getTargetGuild(client);

      if (!guild) {
        return res.status(503).json({
          ok: false,
          error: "Guild not available yet",
        });
      }

      const freshGuild = await guild.fetch().catch(() => guild);

      const totalMembers = freshGuild.memberCount || guild.memberCount || 0;
      const onlineMembers = countOnlineMembers(guild);
      const voiceStats = getVoiceStats(guild);
      const askToPlay = buildAskToPlayStats(sessions, askToPlayService);
      const activity = buildActivityFeed();

      res.json({
        ok: true,
        updatedAt: new Date().toISOString(),
        community: {
          totalMembers,
          onlineMembers,
          usersInVoice: voiceStats.usersInVoice,
        },
        voiceNetwork: {
          usersInVoice: voiceStats.usersInVoice,
          activeVoiceChannels: voiceStats.activeVoiceChannels,
        },
        askToPlay,
        activity,
      });
    } catch (err) {
      console.error("❌ Wallpaper dashboard API failed:", err);

      res.status(500).json({
        ok: false,
        error: "Dashboard API failed",
      });
    }
  });

  app.listen(DASHBOARD_PORT, "0.0.0.0", () => {
    console.log(`✅ Wallpaper dashboard API running on port ${DASHBOARD_PORT}`);
  });
}

module.exports = {
  startWallpaperDashboardService,
};
