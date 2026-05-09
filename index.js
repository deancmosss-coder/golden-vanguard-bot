// =========================
// index.js
// CLEAN CORE ENTRY POINT
// =========================

require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Partials,
} = require("discord.js");

const { setupVoiceHubs } = require("./voiceHubs");

const { loadCommands } = require("./loaders/commandLoader");

const askToPlayService = require("./services/askToPlayService");

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

const {
  registerReadyHandler,
} = require("./handlers/readyHandler");

const {
  registerErrorHandlers,
} = require("./handlers/errorHandler");

// =========================
// ENV
// =========================

const TOKEN = process.env.DISCORD_TOKEN;

const ASK_ROLE_ID = (process.env.PING_ROLE_ID || "").trim();

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
// LOADERS
// =========================

const commands = loadCommands();

// =========================
// SESSION STORES
// =========================

const sessions = new Map();

// =========================
// ASK-TO-PLAY WRAPPERS
// =========================

async function updateAskMessage(session) {
  return askToPlayService.updateAskMessage(client, session);
}

async function renameHostVcFromSession(session, guild) {
  return askToPlayService.renameHostVcFromSession(client, session, guild);
}

// =========================
// HANDLERS
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

registerReadyHandler(client);

registerErrorHandlers(client);

// =========================
// LOGIN
// =========================

client.login(TOKEN).catch((err) => {
  console.error("❌ Bot login failed:", err);
  process.exit(1);
});
