// =========================
// index.js
// CLEAN CORE FILE
// No automated permission sync logic
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

if (!ASK_ROLE_ID) {
  console.warn("⚠️ PING_ROLE_ID is not set. Autorole + role-mention trigger will not work.");
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

  console.log(`✅ Loaded ${commands.size} slash command(s) from ./commands`);
}

let enlistment = null;
try {
  enlistment = require("./commands/enlistment.js");
  console.log("✅ Loaded ./commands/enlistment.js (button handler enabled)");
} catch {
  console.log("ℹ️ No ./commands/enlistment.js found (enlistment buttons disabled).");
}

const sessions = new Map();

/* =========================
   VOICE RENAME
   ========================= */

function factionToTag(faction) {
  if (!faction) return null;
  if (faction === "Automatons") return "BOTS";
  if (faction === "Terminids") return "BUGS";
  if (faction === "Illuminate") return "SQUIDS";
  if (faction === "Any / Flexible") return null;
  return null;
}

function safeUsername(user) {
  return (user?.username || "Host").replace(/[^\w\s-]/g, "").slice(0, 16);
}

async function renameHostVcFromSession(session, guild) {

  const host = await guild.members.fetch(session.ownerId).catch(() => null);
  const vc = host?.voice?.channel;
  if (!vc) return;

  if (vc.parentId !== HUB_CATEGORY_ID) return;
  if (!session.difficulty) return;

  const chosenTag = factionToTag(session.faction);
  let tag = chosenTag;

  if (!tag) {

    const m = vc.name.match(/^(MO|BOTS|BUGS|SQUIDS|DANGER)\s\|/i);
    tag = m ? m[1].toUpperCase() : null;

  }

  if (!tag) return;

  const hostName = safeUsername(host.user);
  const desired = `${tag} | D${session.difficulty} | ${hostName}`;

  if (vc.name === desired) return;

  try {
    await vc.setName(desired, "Auto rename from Ask to Play difficulty selection");
  } catch (err) {
    console.error("[VC Rename] Failed:", err);
  }

}

/* =========================
   AUTO WELCOME
   ========================= */

function buildWelcomeEmbed(member, memberCount) {

  return new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle("🛡 WELCOME TO THE GOLDEN VANGUARD 🛡")
    .setDescription(
      [
        `Welcome ${member}!`,
        "",
        `${member.user.username}, you have entered the Golden Vanguard.`,
        "",
        "The Golden Vanguard is a tactical squad-finding command hub built to:",
        "• Develop your playstyle",
        "• Challenge yourself in new roles",
        "• Deploy with structure and intent",
        "",
        "━━━━━━━━━━━━━━━━━━",
        "",
        "🎮 Looking for a squad?",
        "Go to #squad-lfg and ping @Ask-to-Play",
        "",
        "1) Join a Voice Channel under **Operations Command**",
        "2) Ping **@asktoplay**",
        "3) Set enemy faction and difficulty",
        "4) Players will join your squad",
        "",
        "━━━━━━━━━━━━━━━━━━",
        "",
        `🎖 You are the ${memberCount}th member in the server`,
      ].join("\n")
    )
    .setTimestamp()
    .setFooter({ text: "The Golden Vanguard" });

}

client.on(Events.GuildMemberAdd, async (member) => {

  try {

    if (WELCOME_CHANNEL_ID) {

      const ch = await member.guild.channels.fetch(WELCOME_CHANNEL_ID).catch(() => null);

      if (ch?.isTextBased()) {
        await ch.send({ embeds: [buildWelcomeEmbed(member, member.guild.memberCount)] });
      }

    }

    await orientationSystem.logNewRecruit(member);

  } catch (err) {
    console.error("[WELCOME] Failed:", err);
  }

});

/* =========================
   ASK TO PLAY SYSTEM
   ========================= */

function rosterText(roster) {

  if (!roster.size) return "_No one in VC yet._";

  return [...roster]
    .map((id, i) => `${i + 1}. <@${id}>`)
    .join("\n");

}

function buildAskEmbed(session, vcName) {

  return new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle("🎯 Ask to Play Alert")
    .setDescription(
      ASK_ROLE_ID
        ? `<@${session.ownerId}> pinged <@&${ASK_ROLE_ID}>`
        : `<@${session.ownerId}> is requesting backup`
    )
    .addFields(
      { name: "Difficulty", value: session.difficulty || "Not specified", inline: true },
      { name: "Faction", value: session.faction || "Not specified", inline: true },
      { name: "Voice Channel", value: vcName || "Not in VC", inline: false },
      { name: "Squad", value: `${session.roster.size}/${MAX_SQUAD}`, inline: true },
      { name: "Roster", value: rosterText(session.roster), inline: false }
    )
    .setFooter({ text: "The Golden Vanguard" })
    .setTimestamp();

}

function buildAskComponents(session) {

  if (session.faction && session.difficulty) return [];

  const factionMenu = new StringSelectMenuBuilder()
    .setCustomId(FACTION_SELECT_ID)
    .setPlaceholder("Choose faction")
    .addOptions(
      { label: "Terminids", value: "Terminids" },
      { label: "Automatons", value: "Automatons" },
      { label: "Illuminate", value: "Illuminate" },
      { label: "Any / Flexible", value: "Any / Flexible" }
    );

  const difficultyMenu = new StringSelectMenuBuilder()
    .setCustomId(DIFFICULTY_SELECT_ID)
    .setPlaceholder("Choose difficulty")
    .addOptions(
      ...Array.from({ length: 10 }, (_, i) => {
        const v = String(i + 1);
        return { label: v, value: v };
      })
    );

  return [
    new ActionRowBuilder().addComponents(factionMenu),
    new ActionRowBuilder().addComponents(difficultyMenu),
  ];

}

/* =========================
   READY EVENT
   ========================= */

client.once(Events.ClientReady, async () => {

  console.log(`✅ Logged in as ${client.user.tag}`);

  try {
    await refreshWarBoard(client);
  } catch (err) {
    console.error("War board startup refresh failed:", err);
  }

  console.log("✅ Systems online");

});

client.login(TOKEN);