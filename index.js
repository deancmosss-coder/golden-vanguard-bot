// =========================
// index.js
// CLEAN CORE FILE
// NO COMMAND LIST SYSTEM
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
  PermissionsBitField,
} = require("discord.js");

const { setupVoiceHubs } = require("./voiceHubs");
const { refreshWarBoard } = require("./jobs/refreshWarBoard");
const { postWarEffort } = require("./jobs/warEffortReport");
const { checkWarAlerts } = require("./jobs/highCommandAlerts");
const { postTopRankers } = require("./jobs/postTopRankers");
const { postMedalHall } = require("./jobs/postMedalHall");
const orientationSystem = require("./services/orientationSystem");

// ===== ENV =====
const TOKEN = process.env.DISCORD_TOKEN;

const ASK_ROLE_ID = (process.env.PING_ROLE_ID || "").trim();
const ALLOWED_CHANNEL_ID = (process.env.ALLOWED_CHANNEL_ID || "").trim() || null;
const WELCOME_CHANNEL_ID = (process.env.WELCOME_CHANNEL_ID || "").trim() || null;

const AAR_NAME = (process.env.AAR_CHANNEL_NAME || "after-action-reports").trim();
const LB_NAME = (process.env.LB_CHANNEL_NAME || "leaderboards").trim();
const ANN_NAME = (process.env.ANN_CHANNEL_NAME || "top-rankers").trim();

const TRACKER_TZ = process.env.TRACKER_TIMEZONE || "Europe/London";
const SUNDAY_ANNOUNCE_TIME = (process.env.SUNDAY_ANNOUNCE_TIME || "23:00").trim();
const MONDAY_RESET_TIME =
  (process.env.MONDAY_RESET_TIME || process.env.MONDAY_RESET || "00:00").trim();

const TRIGGER_TEXT = "@ask to play";
const MAX_SQUAD = 4;

const FACTION_SELECT_ID = "gv_faction";
const DIFFICULTY_SELECT_ID = "gv_difficulty";

const HUB_CATEGORY_ID = "1478464677783666778";
const COMMANDS_CHANNEL_ID = "1473714320293630178";

// ===== DIVISION ROLE IDS =====
const DIVISION_ROLE_IDS = {
  eclipse: "1474609575415255092",
  bastion: "1474610126693466202",
  purifier: "1474610277927354638",
  orbital: "1474609906580455495",
};

const ALL_DIVISION_ROLE_IDS = Object.values(DIVISION_ROLE_IDS);

if (!TOKEN) {
  console.error("❌ Missing DISCORD_TOKEN in .env");
  process.exit(1);
}

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

// VC system
setupVoiceHubs(client);

// ===== LOAD COMMANDS =====
const commands = new Map();
const commandsPath = path.join(__dirname, "commands");

if (fs.existsSync(commandsPath)) {
  const files = fs.readdirSync(commandsPath).filter((f) => f.endsWith(".js"));

  for (const file of files) {
    const mod = require(`./commands/${file}`);

    if (mod?.data?.name && typeof mod.execute === "function") {
      commands.set(mod.data.name, mod);
    }

    if (mod?.adminData?.name && typeof mod.executeAdmin === "function") {
      commands.set(mod.adminData.name, { execute: mod.executeAdmin });
    }
  }

  console.log(`✅ Loaded ${commands.size} slash command(s)`);
}

let enlistment = null;
try {
  enlistment = require("./commands/enlistment.js");
} catch {}

const sessions = new Map();

/* =========================
   INTERACTIONS (CLEAN)
   ========================= */
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const cmd = commands.get(interaction.commandName);
      if (!cmd) return;
      return cmd.execute(interaction);
    }

    if (interaction.isButton() && interaction.customId.startsWith("enlist:") && enlistment) {
      return enlistment.handleButton(interaction);
    }

  } catch (err) {
    console.error("[InteractionCreate] error:", err);

    if (interaction?.isRepliable?.()) {
      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.followUp({ content: "Something went wrong.", ephemeral: true });
        } else {
          await interaction.reply({ content: "Something went wrong.", ephemeral: true });
        }
      } catch {}
    }
  }
});

/* =========================
   READY
   ========================= */
client.once(Events.ClientReady, async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.login(TOKEN);