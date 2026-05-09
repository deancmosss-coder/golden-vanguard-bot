// =========================
// index.js
// CLEAN CORE FILE
// =========================

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const cron = require("node-cron");

const {
  Client,
  GatewayIntentBits,
  Partials,
  ActionRowBuilder,
  Events,
  StringSelectMenuBuilder,
} = require("discord.js");

const logger = require("./services/logger");

const {
  sendAlert,
  sendErrorAlert,
  sendStartupAlert,
} = require("./services/alertService");

const githubDeployService = require("./services/githubDeployService");

const registry = require("./services/featureRegistry");

const { runProtected } = require("./services/featureGuard");

const { setupVoiceHubs } = require("./voiceHubs");

const { refreshWarBoard } = require("./jobs/refreshWarBoard");

const orientationSystem = require("./services/orientationSystem");

const playerStats = require("./services/playerStats");

const {
  scanForReviews,
} = require("./services/discoveryReviewService");

const {
  registerInteractionHandler,
} = require("./handlers/interactionHandler");

const {
  registerVoiceHandler,
} = require("./handlers/voiceStateHandler");

const {
  registerGuildMemberHandler,
} = require("./handlers/guildMemberHandler");
