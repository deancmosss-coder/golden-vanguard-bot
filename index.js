// =========================
// index.js (FULL WORKING)
// =========================

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const cron = require("node-cron");

const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  Events,
  StringSelectMenuBuilder,
} = require("discord.js");

const { setupVoiceHubs } = require("./voiceHubs");
const { refreshWarBoard } = require("./jobs/refreshWarBoard");

// ⭐ ORIENTATION SYSTEM
const orientationSystem = require("./services/orientationSystem");


// ===== ENV =====
const TOKEN = process.env.DISCORD_TOKEN;

const ASK_ROLE_ID = (process.env.PING_ROLE_ID || "").trim();
const ALLOWED_CHANNEL_ID = (process.env.ALLOWED_CHANNEL_ID || "").trim() || null;
const WELCOME_CHANNEL_ID = (process.env.WELCOME_CHANNEL_ID || "").trim() || null;

const AAR_NAME = (process.env.AAR_CHANNEL_NAME || "after-action-reports").trim();
const LB_NAME = (process.env.LB_CHANNEL_NAME || "leaderboards").trim();
const ANN_NAME = (process.env.ANN_CHANNEL_NAME || "top-rankers").trim();


// ===== CLIENT =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});


// =========================
// BOT READY
// =========================

client.once(Events.ClientReady, async (client) => {

  console.log(`🟢 Bot ready as ${client.user.tag}`);

  // Setup VC hubs
  setupVoiceHubs(client);

  // Refresh war board every 10 minutes
  cron.schedule("*/10 * * * *", () => {
    refreshWarBoard(client);
  });

  // ⭐ POST RECRUIT CHECKLIST PANEL
  try {
    await orientationSystem.sendChecklistPanel(client);
    console.log("⭐ Orientation checklist panel posted");
  } catch (err) {
    console.error("Orientation panel failed:", err);
  }

});


// =========================
// MEMBER JOIN
// =========================

client.on(Events.GuildMemberAdd, async (member) => {

  try {

    if (!WELCOME_CHANNEL_ID) return;

    const channel = await member.guild.channels.fetch(WELCOME_CHANNEL_ID).catch(() => null);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle("🦅 Welcome to The Golden Vanguard")
      .setDescription(
        `Welcome ${member}.

This is a **chilled Helldivers community** built around teamwork and good missions.

Before deploying:

• Read the **Server Guide**
• Learn about the **Divisions**
• Join a squad in **#squad-lfg**

We deploy together. Reinforce together. Win together.`
      )
      .setColor(0xf1c40f);

    await channel.send({ embeds: [embed] });

    // ⭐ register recruit in orientation system
    await orientationSystem.logNewRecruit(member);

  } catch (err) {
    console.error("Member join error:", err);
  }

});


// =========================
// INTERACTIONS
// =========================

client.on(Events.InteractionCreate, async (interaction) => {

  try {

    // ⭐ ORIENTATION BUTTON HANDLER
    if (interaction.isButton()) {
      const handled = await orientationSystem.handleOrientationButton(interaction);
      if (handled) return;
    }

  } catch (err) {
    console.error("Interaction error:", err);
  }

});


// =========================
// VOICE STATE TRACKING
// =========================

client.on("voiceStateUpdate", (oldState, newState) => {

  try {

    orientationSystem.handleVoiceStateUpdate(oldState, newState);

  } catch (err) {

    console.error("Voice tracking error:", err);

  }

});


// =========================
// LOGIN
// =========================

client.login(TOKEN);
