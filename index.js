// =========================
// index.js
// CLEAN CORE ENTRY POINT
// Multi-game Ask-to-Play ready
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
  setupMemberTracker,
} = require("./services/memberTracker");

const {
  setupInviteTracker,
} = require("./services/inviteTracker");

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

const WELCOME_CHANNEL_ID =
  (process.env.WELCOME_CHANNEL_ID || "").trim() || null;

const TRIGGER_TEXT =
  (process.env.ASK_TO_PLAY_TRIGGER || "@ask to play")
    .trim()
    .toLowerCase();

if (!TOKEN) {
  console.error("❌ Missing DISCORD_TOKEN in .env");
  process.exit(1);
}

if (!ASK_ROLE_ID) {
  console.warn(
    "⚠️ PING_ROLE_ID is not set. Old/global Ask-to-Play role mention trigger will not work. Multi-game config pings will still work."
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
setupMemberTracker(client);
setupInviteTracker(client);

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
// These wrappers keep old and new handler call styles safe.
// =========================

async function updateAskMessage(...args) {
  const session = args.length === 2 ? args[1] : args[0];

  return askToPlayService.updateAskMessage(
    client,
    session
  );
}

async function renameHostVcFromSession(...args) {
  const session = args.length === 3 ? args[1] : args[0];
  const guild = args.length === 3 ? args[2] : args[1];

  return askToPlayService.renameHostVcFromSession(
    client,
    session,
    guild
  );
}

// =========================
// HANDLERS
// =========================

registerInteractionHandler(client, commands, sessions, {
  FACTION_SELECT_ID: askToPlayService.FACTION_SELECT_ID,
  DIFFICULTY_SELECT_ID: askToPlayService.DIFFICULTY_SELECT_ID,
  ACTIVITY_SELECT_ID: askToPlayService.ACTIVITY_SELECT_ID,
  updateAskMessage,
  renameHostVcFromSession,
});

registerMessageHandler(client, {
  ASK_ROLE_ID,
  TRIGGER_TEXT,
  buildAskEmbed: askToPlayService.buildAskEmbed,
  buildAskComponents: askToPlayService.buildAskComponents,
  syncRosterFromVc: askToPlayService.syncRosterFromVc,
  findGameConfigByChannel:
    askToPlayService.findGameConfigByChannel,
  getDisplayVcName:
    askToPlayService.getDisplayVcName,
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
