// =========================
// index.js
// CLEAN CORE FILE
// Ask-to-Play moved to services/askToPlayService.js
// Scheduler extracted
// Tracker store extracted
// Interaction, message, voice, and guild member handlers modular
// =========================

require("dotenv").config();

const fs = require("fs");
const path = require("path");

const {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
} = require("discord.js");

const logger = require("./services/logger");

const {
  sendAlert,
  sendStartupAlert,
} = require("./services/alertService");

const { setupVoiceHubs } = require("./voiceHubs");

const {
  registerInteractionHandler,
} = require("./handlers/interactionHandler");

const {
  registerMessageHandler,
} = require("./handlers/messageHandler");

const {
  registerVoiceStateHandler,
} = require("./handlers/voiceStateHandler");

const {
  registerGuildMemberHandler,
} = require("./handlers/guildMemberHandler");

const askToPlayService = require("./services/askToPlayService");

const {
  startScheduler,
} = require("./jobs/scheduler");

// =========================
// ENV
// =========================

const TOKEN = process.env.DISCORD_TOKEN;

const ASK_ROLE_ID =
  (process.env.PING_ROLE_ID || "").trim();

const ALLOWED_CHANNEL_ID =
  (process.env.ALLOWED_CHANNEL_ID || "").trim() || null;

const WELCOME_CHANNEL_ID =
  (process.env.WELCOME_CHANNEL_ID || "").trim() || null;

const TRIGGER_TEXT = "@ask to play";

if (!TOKEN) {
  console.error("❌ Missing DISCORD_TOKEN in .env");
  process.exit(1);
}

if (!ASK_ROLE_ID) {
  console.warn(
    "⚠️ PING_ROLE_ID is not set. Autorole + role-mention trigger will not work."
  );
}

// =========================
// CLIENT
// =========================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.Channel],
});

// =========================
// SYSTEMS
// =========================

setupVoiceHubs(client);

// =========================
// COMMAND LOADER
// =========================

const commands = new Map();

const commandsPath = path.join(__dirname, "commands");

if (fs.existsSync(commandsPath)) {
  const files = fs
    .readdirSync(commandsPath)
    .filter((file) => file.endsWith(".js"));

  for (const file of files) {
    try {
      const mod = require(`./commands/${file}`);

      if (mod?.data?.name && typeof mod.execute === "function") {
        commands.set(mod.data.name, mod);
      }

      if (mod?.adminData?.name && typeof mod.executeAdmin === "function") {
        commands.set(mod.adminData.name, {
          execute: mod.executeAdmin,
        });
      }
    } catch (err) {
      logger.error("Failed to load command file", err, {
        location: "index.js -> command loader",
        file,
      });
    }
  }

  logger.info(`Loaded ${commands.size} slash command(s) from ./commands`);
}

// =========================
// ASK TO PLAY SESSIONS
// =========================

const sessions = new Map();

// =========================
// ASK TO PLAY WRAPPERS
// These keep old handler signatures working while the service owns the logic.
// =========================

async function updateAskMessage(session) {
  return askToPlayService.updateAskMessage(client, session);
}

async function renameHostVcFromSession(session, guild) {
  return askToPlayService.renameHostVcFromSession(client, session, guild);
}

// =========================
// REGISTER HANDLERS
// =========================

registerInteractionHandler(client, commands, sessions, {
  FACTION_SELECT_ID: askToPlayService.FACTION_SELECT_ID,
  DIFFICULTY_SELECT_ID: askToPlayService.DIFFICULTY_SELECT_ID,
  updateAskMessage,
  renameHostVcFromSession,
});

registerMessageHandler(client, {
  ASK_ROLE_ID,
  ALLOWED_CHANNEL_ID,
  TRIGGER_TEXT,
  buildAskEmbed: askToPlayService.buildAskEmbed,
  buildAskComponents: askToPlayService.buildAskComponents,
  syncRosterFromVc: askToPlayService.syncRosterFromVc,
  sessions,
});

registerVoiceStateHandler(client, {
  sessions,
  resolveHostVc: askToPlayService.resolveHostVc,
  syncRosterFromVc: askToPlayService.syncRosterFromVc,
  updateAskMessage,
});

registerGuildMemberHandler(client, {
  WELCOME_CHANNEL_ID,
});

// =========================
// READY
// =========================

client.once(Events.ClientReady, async () => {
  logger.info(`Logged in as ${client.user.tag}`, {
    botId: client.user.id,
  });

  await sendStartupAlert(
    client,
    `Golden Vanguard bot is now online as **${client.user.tag}**`
  );

  await startScheduler(client);
});

// =========================
// CLIENT WARN / ERROR
// =========================

client.on(Events.Error, async (err) => {
  logger.error("Discord Client Error", err, {
    location: "client.on(Events.Error)",
  });
});

client.on(Events.Warn, (warning) => {
  logger.warn("Discord Client Warning", {
    location: "client.on(Events.Warn)",
    warning,
  });
});

// =========================
// PROCESS HANDLERS
// =========================

process.on("unhandledRejection", async (reason) => {
  const err =
    reason instanceof Error
      ? reason
      : new Error(String(reason || "Unknown rejection"));

  logger.error("Unhandled Promise Rejection", err, {
    location: "process.on(unhandledRejection)",
  });
});

process.on("uncaughtException", async (err) => {
  logger.error("Uncaught Exception", err, {
    location: "process.on(uncaughtException)",
  });
});

// =========================
// CLEAN SHUTDOWN
// =========================

async function shutdown(signal) {
  logger.warn(`Shutdown signal received: ${signal}`, {
    location: "shutdown()",
  });

  try {
    if (client.isReady()) {
      await sendAlert(client, {
        title: "Bot Shutdown",
        description: `Golden Vanguard bot is shutting down after receiving **${signal}**.`,
        severity: "warning",
      });
    }
  } catch (err) {
    logger.error("Failed to send shutdown alert", err, {
      location: "shutdown()",
    });
  }

  try {
    client.destroy();
  } catch (err) {
    logger.error("Failed to destroy Discord client cleanly", err, {
      location: "shutdown()",
    });
  }

  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// =========================
// LOGIN
// =========================

client.login(TOKEN).catch((err) => {
  logger.error("Failed to login bot", err, {
    location: "client.login",
  });

  console.error("❌ Bot login failed:", err);
  process.exit(1);
});
