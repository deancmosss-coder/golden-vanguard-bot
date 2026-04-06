// =========================
// index.js
// CLEAN CORE FILE
// No automated permission sync logic
// Includes player VC time tracking
// Fixed tracker store access
// Added logging + alert foundation
// Added feature guard system
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

const logger = require("./services/logger");
const {
  sendAlert,
  sendErrorAlert,
  sendStartupAlert,
} = require("./services/alertService");
const registry = require("./services/featureRegistry");
const { runProtected } = require("./services/featureGuard");

const { setupVoiceHubs } = require("./voiceHubs");
const { refreshWarBoard } = require("./jobs/refreshWarBoard");
const orientationSystem = require("./services/orientationSystem");
const playerStats = require("./services/playerStats");

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
const TRACKER_STORE_PATH = path.join(__dirname, "tracker_store.json");

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
    try {
      const mod = require(`./commands/${file}`);

      if (mod?.data?.name && typeof mod.execute === "function") {
        commands.set(mod.data.name, mod);
      }

      if (mod?.adminData?.name && typeof mod.executeAdmin === "function") {
        commands.set(mod.adminData.name, { execute: mod.executeAdmin });
      }
    } catch (err) {
      logger.error("Failed to load command file", err, { file });
    }
  }

  logger.info(`Loaded ${commands.size} slash command(s) from ./commands`);
}

let enlistment = null;
try {
  enlistment = require("./commands/enlistment.js");
  logger.info("Loaded ./commands/enlistment.js (button handler enabled)");
} catch {
  logger.info("No ./commands/enlistment.js found (enlistment buttons disabled).");
}

const sessions = new Map();

/* =========================
   TRACKER STORE HELPERS
   ========================= */
function currentMonthKeyLocal(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TRACKER_TZ,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(d);

  const y = parts.find((p) => p.type === "year")?.value || "0000";
  const m = parts.find((p) => p.type === "month")?.value || "00";
  return `${y}-${m}`;
}

function defaultTrackerStore() {
  return {
    leaderboardMessage: {},
    weekly: { players: {}, divisions: {}, enemies: {} },
    monthly: {
      monthKey: currentMonthKeyLocal(),
      players: {},
      divisions: {},
      enemies: {},
    },
    users: {},
    runs: [],
    proofSessions: {},
    history: { weeks: [] },
    planets: {},
    profiles: {},
    medals: {},
  };
}

function readTrackerStore() {
  try {
    if (!fs.existsSync(TRACKER_STORE_PATH)) return defaultTrackerStore();
    const raw = fs.readFileSync(TRACKER_STORE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    const base = defaultTrackerStore();

    return {
      ...base,
      ...parsed,
      leaderboardMessage: parsed.leaderboardMessage || base.leaderboardMessage,
      weekly: parsed.weekly || base.weekly,
      monthly: parsed.monthly || base.monthly,
      users: parsed.users || base.users,
      runs: Array.isArray(parsed.runs) ? parsed.runs : [],
      proofSessions: parsed.proofSessions || base.proofSessions,
      history: parsed.history || base.history,
      planets: parsed.planets || base.planets,
      profiles: parsed.profiles || base.profiles,
      medals: parsed.medals || base.medals,
    };
  } catch (err) {
    logger.error("readTrackerStore failed", err, { location: "index.js -> readTrackerStore" });
    return defaultTrackerStore();
  }
}

function writeTrackerStore(store) {
  try {
    fs.writeFileSync(TRACKER_STORE_PATH, JSON.stringify(store, null, 2), "utf8");
  } catch (err) {
    logger.error("writeTrackerStore failed", err, { location: "index.js -> writeTrackerStore" });
  }
}

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
    logger.error("VC rename failed", err, {
      location: "index.js -> renameHostVcFromSession",
      channelId: vc.id,
      desiredName: desired,
    });

    await sendErrorAlert(client, "VC Rename Failed", err, {
      feature: "askToPlay",
      location: "renameHostVcFromSession",
      action: "Renaming host voice channel",
      likelyCause: "Missing permission or invalid channel state.",
      severity: "warning",
    });
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
        `Welcome ${member.user.username}, you have entered the Golden Vanguard!`,
        "",
        "The Golden Vanguard is a tactical squad-finding command hub built to:",
        "• Develop your playstyle",
        "• Challenge yourself in new roles",
        "• Deploy with structure and intent",
        "",
        "**This is not a roleplay server.**",
        "Factions are playstyle archetypes designed to help you learn, adapt, and sharpen your tactical edge.",
        "",
        "━━━━━━━━━━━━━━━━━━",
        "",
        "📜 Read #community-laws",
        "",
        "🎮 Looking for a squad?",
        "Go to #squad-lfg and ping @Ask-to-Play",
        "",
        "How to find a squad",
        "1) Join a Voice Channel under **Operations Command**",
        "2) Ping **@asktoplay** in **#squad-lfg**",
        "3) Set enemy faction and Difficulty or leave blank",
        "4) Players will come and fight with you",
        "",
        "━━━━━━━━━━━━━━━━━━",
        "",
        "🪖 Interested in a division?",
        "Visit #division-terminal to explore the Vanguard divisions.",
        "🌑 The Eclipse Vanguard",
        "🔥 The Purifier Corps",
        "🛡 The Bastion Guard",
        "✴ The Orbital Directive",
        "",
        "Form up. Drop in. Execute.",
        "",
        "━━━━━━━━━━━━━━━━━━",
        "",
        "Welcome to the Golden Vanguard.",
        "Now earn your place in it.",
        "",
        `🎖 You are the ${memberCount}th member in the server!!`,
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
    logger.error("GuildMemberAdd failed", err, {
      location: "index.js -> GuildMemberAdd",
      memberId: member?.id,
    });

    await sendErrorAlert(client, "Welcome/Recruit Logging Failed", err, {
      feature: "orientation",
      location: "GuildMemberAdd",
      action: "Welcoming new member / logging recruit",
      likelyCause: "Channel issue, permissions, or orientation handler failure.",
      severity: "warning",
    });
  }
});

/* =========================
   ASK-TO-PLAY HELPERS
   ========================= */
function rosterText(roster) {
  if (!roster.size) return "_No one in VC yet._";
  return [...roster].map((id, i) => `${i + 1}. <@${id}>`).join("\n");
}

function buildAskEmbed(session, vcName) {
  return new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle("🎯 Ask-to-Play Alert")
    .setDescription(
      ASK_ROLE_ID
        ? `<@${session.ownerId}> pinged <@&${ASK_ROLE_ID}>`
        : `<@${session.ownerId}> is requesting backup!`
    )
    .addFields(
      { name: "Difficulty", value: session.difficulty || "Not specified", inline: true },
      { name: "Faction", value: session.faction || "Not specified", inline: true },
      { name: "Voice Channel", value: vcName || "Not currently in a voice channel.", inline: false },
      { name: "Squad", value: `${session.roster.size}/${MAX_SQUAD}`, inline: true },
      { name: "Roster", value: rosterText(session.roster), inline: false }
    )
    .setFooter({ text: "The Golden Vanguard" })
    .setTimestamp();
}

function buildAskComponents(session) {
  const factionDone = !!session.faction;
  const difficultyDone = !!session.difficulty;

  if (factionDone && difficultyDone) return [];

  const factionMenu = new StringSelectMenuBuilder()
    .setCustomId(FACTION_SELECT_ID)
    .setPlaceholder(factionDone ? `Faction: ${session.faction}` : "Choose a faction…")
    .addOptions(
      { label: "Terminids", value: "Terminids" },
      { label: "Automatons", value: "Automatons" },
      { label: "Illuminate", value: "Illuminate" },
      { label: "Any / Flexible", value: "Any / Flexible" }
    );

  const difficultyMenu = new StringSelectMenuBuilder()
    .setCustomId(DIFFICULTY_SELECT_ID)
    .setPlaceholder(difficultyDone ? `Difficulty: ${session.difficulty}` : "Choose difficulty…")
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

async function resolveHostVc(guild, ownerId) {
  const host = await guild.members.fetch(ownerId).catch(() => null);
  return host?.voice?.channel || null;
}

function syncRosterFromVc(session, vc) {
  const next = new Set();
  next.add(session.ownerId);

  if (vc) {
    const ids = [...vc.members.values()].map((m) => m.id);

    for (const id of ids) {
      if (id === session.ownerId) continue;
      if (next.size >= MAX_SQUAD) break;
      next.add(id);
    }
  }

  const before = [...session.roster].sort().join(",");
  const after = [...next].sort().join(",");

  if (before === after) return false;

  session.roster = next;
  return true;
}

async function updateAskMessage(session) {
  const guild = await client.guilds.fetch(session.guildId).catch(() => null);
  if (!guild) return;

  const textChannel = await guild.channels.fetch(session.textChannelId).catch(() => null);
  if (!textChannel?.isTextBased()) return;

  const msg = await textChannel.messages.fetch(session.messageId).catch(() => null);
  if (!msg) return;

  const vc = await resolveHostVc(guild, session.ownerId);
  const vcName = vc?.name || null;

  syncRosterFromVc(session, vc);

  await msg.edit({
    embeds: [buildAskEmbed(session, vcName)],
    components: buildAskComponents(session),
    allowedMentions: ASK_ROLE_ID ? { roles: [ASK_ROLE_ID], users: [] } : undefined,
  });
}

/* =========================
   MESSAGE CREATE
   ========================= */
client.on(Events.MessageCreate, async (message) => {
  try {
    if (message.author.bot || !message.guild) return;

    try {
      const runCmd = require("./commands/run.js");
      if (typeof runCmd.handleTrackerProofMessage === "function") {
        await runCmd.handleTrackerProofMessage(message);
      }
    } catch {
      // ignore
    }

    if (ALLOWED_CHANNEL_ID && message.channel.id !== ALLOWED_CHANNEL_ID) return;

    const contentLower = (message.content || "").toLowerCase();
    const roleMentionTrigger = !!ASK_ROLE_ID && message.mentions?.roles?.has(ASK_ROLE_ID);
    const textTrigger = contentLower.includes(TRIGGER_TEXT);

    if (!roleMentionTrigger && !textTrigger) return;

    const guild = message.guild;
    const owner = await guild.members.fetch(message.author.id).catch(() => null);
    if (!owner) return;

    const vc = owner.voice?.channel || null;

    const session = {
      ownerId: owner.id,
      guildId: guild.id,
      textChannelId: message.channel.id,
      messageId: "pending",
      faction: null,
      difficulty: null,
      roster: new Set([owner.id]),
    };

    syncRosterFromVc(session, vc);

    const sent = await message.channel.send({
      content: ASK_ROLE_ID ? `<@&${ASK_ROLE_ID}>` : undefined,
      embeds: [buildAskEmbed(session, vc?.name || null)],
      components: buildAskComponents(session),
      allowedMentions: ASK_ROLE_ID ? { roles: [ASK_ROLE_ID] } : undefined,
    });

    session.messageId = sent.id;
    sessions.set(sent.id, session);
  } catch (err) {
    logger.error("MessageCreate error", err, {
      location: "index.js -> MessageCreate",
      messageId: message?.id,
      authorId: message?.author?.id,
      channelId: message?.channel?.id,
    });

    await sendErrorAlert(client, "Message Handler Failed", err, {
      feature: "askToPlay",
      location: "MessageCreate",
      action: "Handling Ask-to-Play trigger",
      likelyCause: "Command flow, channel access, or session build failure.",
      severity: "warning",
    });
  }
});

/* =========================
   INTERACTION HELPERS
   ========================= */
async function safeReply(interaction, content, useFollowUp = false) {
  try {
    if (useFollowUp && (interaction.deferred || interaction.replied)) {
      return await interaction.followUp({ content, flags: 64 });
    }

    if (interaction.deferred || interaction.replied) {
      return await interaction.editReply({ content });
    }

    return await interaction.reply({ content, flags: 64 });
  } catch {
    return null;
  }
}

/* =========================
   INTERACTIONS
   ========================= */
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isAutocomplete()) {
      const cmd = commands.get(interaction.commandName);
      if (cmd?.autocomplete) return cmd.autocomplete(interaction);
      return;
    }

    if (interaction.isButton()) {
      const handled = await orientationSystem.handleOrientationButton(interaction);
      if (handled) return;
    }

    if (interaction.isButton()) {
      const validDivisionButtons = [
        "division_eclipse",
        "division_bastion",
        "division_purifier",
        "division_orbital",
        "division_leave",
      ];

      if (validDivisionButtons.includes(interaction.customId)) {
        await interaction.deferReply({ flags: 64 });

        const member = interaction.member;
        if (!member) {
          return interaction.editReply("Could not find your server member profile.");
        }

        const rolesToRemove = ALL_DIVISION_ROLE_IDS.filter((roleId) =>
          member.roles.cache.has(roleId)
        );

        if (rolesToRemove.length) {
          await member.roles.remove(rolesToRemove);
        }

        if (interaction.customId === "division_leave") {
          return interaction.editReply("You have left your current division.");
        }

        let roleId = null;
        let divisionName = null;

        if (interaction.customId === "division_eclipse") {
          roleId = DIVISION_ROLE_IDS.eclipse;
          divisionName = "Eclipse Vanguard";
        }

        if (interaction.customId === "division_bastion") {
          roleId = DIVISION_ROLE_IDS.bastion;
          divisionName = "Bastion Guard";
        }

        if (interaction.customId === "division_purifier") {
          roleId = DIVISION_ROLE_IDS.purifier;
          divisionName = "Purifier Corps";
        }

        if (interaction.customId === "division_orbital") {
          roleId = DIVISION_ROLE_IDS.orbital;
          divisionName = "Orbital Directive";
        }

        if (!roleId) {
          return interaction.editReply("That division could not be assigned.");
        }

        await member.roles.add(roleId);
        return interaction.editReply(`You are now enlisted in **${divisionName}**.`);
      }
    }

    if (interaction.isButton() && interaction.customId?.startsWith("gv_")) {
      const runCmd = require("./commands/run.js");
      return runCmd.handleTrackerButton(interaction);
    }

    if (interaction.isModalSubmit() && interaction.customId?.startsWith("gv_run_edit:")) {
      const runCmd = require("./commands/run.js");
      return runCmd.handleTrackerModal(interaction);
    }

    if (interaction.isChatInputCommand()) {
      const cmd = commands.get(interaction.commandName);
      if (!cmd) return;
      return cmd.execute(interaction);
    }

    if (interaction.isButton() && interaction.customId.startsWith("enlist:") && enlistment) {
      return enlistment.handleButton(interaction);
    }

    if (interaction.isStringSelectMenu()) {
      const session = sessions.get(interaction.message.id);

      if (!session) {
        if (interaction.deferred || interaction.replied) {
          return interaction
            .followUp({ content: "Session expired.", flags: 64 })
            .catch(() => {});
        }

        return interaction.reply({ content: "Session expired.", flags: 64 }).catch(() => {});
      }

      if (interaction.user.id !== session.ownerId) {
        if (interaction.deferred || interaction.replied) {
          return interaction
            .followUp({
              content: "Only the host can set faction/difficulty.",
              flags: 64,
            })
            .catch(() => {});
        }

        return interaction
          .reply({
            content: "Only the host can set faction/difficulty.",
            flags: 64,
          })
          .catch(() => {});
      }

      try {
        await interaction.deferReply({ flags: 64 });

        if (interaction.customId === FACTION_SELECT_ID) {
          session.faction = interaction.values[0];
          await updateAskMessage(session);

          return interaction.editReply({
            content: `✅ Faction set to **${session.faction}**`,
          });
        }

        if (interaction.customId === DIFFICULTY_SELECT_ID) {
          session.difficulty = interaction.values[0];
          await updateAskMessage(session);

          if (interaction.guild) {
            await renameHostVcFromSession(session, interaction.guild);
          }

          return interaction.editReply({
            content: `✅ Difficulty set to **${session.difficulty}**`,
          });
        }
      } catch (error) {
        logger.error("String select menu error", error, {
          location: "index.js -> InteractionCreate -> StringSelectMenu",
          customId: interaction.customId,
          userId: interaction.user?.id,
        });

        await sendErrorAlert(client, "Ask-to-Play Menu Failed", error, {
          feature: "askToPlay",
          location: "StringSelectMenu",
          action: "Updating faction/difficulty selection",
          likelyCause: "Expired interaction, invalid session, or message edit issue.",
          severity: "warning",
        });

        if (interaction.deferred || interaction.replied) {
          return interaction
            .editReply({
              content: "❌ Something went wrong while updating the session.",
            })
            .catch(() => {});
        }

        return interaction
          .reply({
            content: "❌ Something went wrong while updating the session.",
            flags: 64,
          })
          .catch(() => {});
      }
    }
  } catch (err) {
    logger.error("InteractionCreate error", err, {
      location: "index.js -> InteractionCreate",
      userId: interaction?.user?.id || null,
      guildId: interaction?.guildId || null,
      commandName: interaction?.isChatInputCommand?.() ? interaction.commandName : null,
      customId:
        interaction?.isButton?.() || interaction?.isStringSelectMenu?.()
          ? interaction.customId
          : null,
    });

    await sendErrorAlert(client, "Interaction Handler Failed", err, {
      feature: "askToPlay",
      location: "InteractionCreate",
      action: "Processing interaction",
      likelyCause: "Command, button, or modal error.",
      severity: "error",
    });

    if (interaction?.isRepliable?.()) {
      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.followUp({ content: "Something went wrong.", flags: 64 });
        } else {
          await interaction.reply({ content: "Something went wrong.", flags: 64 });
        }
      } catch {}
    }
  }
});

/* =========================
   VOICE STATE UPDATE
   ========================= */
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  try {
    if (registry.isFeatureEnabled("orientation")) {
      try {
        orientationSystem.handleVoiceStateUpdate(oldState, newState);
        registry.registerSuccess("orientation");
      } catch (err) {
        const state = registry.registerFailure("orientation", err);

        logger.error("Orientation voice update failed", err, {
          location: "index.js -> VoiceStateUpdate -> orientationSystem.handleVoiceStateUpdate",
          failCount: state.failCount,
        });

        if (state.failCount >= 3) {
          registry.disableFeature("orientation", "Disabled after repeated voice update failures.");

          await sendErrorAlert(client, "orientation isolated", err, {
            feature: "orientation",
            location: "VoiceStateUpdate",
            action: "Handling orientation voice update",
            likelyCause: "Orientation VC tracking failed repeatedly.",
            severity: "critical",
          });

          await sendAlert(client, {
            title: "orientation paused",
            description:
              "The **orientation** feature has been temporarily disabled after repeated voice update failures.",
            severity: "warning",
          });
        } else {
          await sendErrorAlert(client, "orientation failed", err, {
            feature: "orientation",
            location: "VoiceStateUpdate",
            action: "Handling orientation voice update",
            likelyCause: "Orientation VC tracking failed.",
            severity: "warning",
          });
        }
      }
    }

    if (!oldState.channelId && newState.channelId) {
      playerStats.startVoiceSession(newState.id);
    }

    if (oldState.channelId && !newState.channelId) {
      playerStats.endVoiceSession(oldState.id);
    }

    if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
      playerStats.endVoiceSession(oldState.id);
      playerStats.startVoiceSession(newState.id);
    }

    const guild = newState.guild || oldState.guild;
    if (!guild) return;

    for (const session of sessions.values()) {
      if (session.guildId !== guild.id) continue;

      const vc = await resolveHostVc(guild, session.ownerId);

      const touchedHost = oldState.id === session.ownerId || newState.id === session.ownerId;
      const touchedVc = vc && (oldState.channelId === vc.id || newState.channelId === vc.id);

      if (!touchedHost && !touchedVc) continue;

      const changed = syncRosterFromVc(session, vc);
      if (changed) await updateAskMessage(session);
    }
  } catch (err) {
    logger.error("VoiceStateUpdate error", err, {
      location: "index.js -> VoiceStateUpdate",
      oldChannelId: oldState?.channelId || null,
      newChannelId: newState?.channelId || null,
      userId: newState?.id || oldState?.id || null,
    });

    await sendErrorAlert(client, "Voice State Update Failed", err, {
      feature: "voiceTracking",
      location: "VoiceStateUpdate",
      action: "Updating VC sessions / roster tracking",
      likelyCause: "Voice session tracking or roster sync error.",
      severity: "warning",
    });
  }
});

/* =========================
   READY + TRACKER SCHEDULER
   ========================= */
client.once(Events.ClientReady, async () => {
  logger.info(`Logged in as ${client.user.tag}`, {
    botId: client.user.id,
  });

  await sendStartupAlert(
    client,
    `Golden Vanguard bot is now online as **${client.user.tag}**`
  );

  await runProtected(client, {
    feature: "warboard",
    action: "Refreshing war board on startup",
    location: "index.js -> ClientReady -> refreshWarBoard",
    likelyCause: "Refresh job failed, missing channel, or bad data.",
    retries: 1,
    retryDelayMs: 2000,
    maxFailures: 3,
    job: async () => {
      await refreshWarBoard(client);
      logger.info("War board refreshed on startup");
    },
  });

  cron.schedule(
    "*/15 * * * *",
    async () => {
      await runProtected(client, {
        feature: "warboard",
        action: "Scheduled war board refresh",
        location: "index.js -> cron -> refreshWarBoard",
        likelyCause: "Refresh job failed repeatedly or lost channel/data access.",
        retries: 1,
        retryDelayMs: 3000,
        maxFailures: 3,
        job: async () => {
          await refreshWarBoard(client);
        },
      });
    },
    { timezone: TRACKER_TZ }
  );

  let runCmd = null;
  try {
    runCmd = require("./commands/run.js");
  } catch {
    logger.info("Tracker: ./commands/run.js not found (tracker scheduler disabled).");
    return;
  }

  function findTextChannelByName(guild, name) {
    const lower = name.toLowerCase();
    return guild.channels.cache.find((c) => c.isTextBased?.() && c.name?.toLowerCase() === lower);
  }

  function topEntryLocal(obj) {
    const entries = Object.entries(obj || {});
    if (!entries.length) return null;
    entries.sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0));
    return { key: entries[0][0], val: Number(entries[0][1] || 0) };
  }

  function londonParts(date = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: TRACKER_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);

    return {
      y: Number(parts.find((p) => p.type === "year").value),
      m: Number(parts.find((p) => p.type === "month").value),
      d: Number(parts.find((p) => p.type === "day").value),
    };
  }

  function isLastDayOfMonthLondon() {
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const t = londonParts(tomorrow);
    return t.d === 1;
  }

  for (const guild of client.guilds.cache.values()) {
    const store = readTrackerStore();
    if (typeof runCmd.ensureLeaderboardMessage === "function") {
      await runCmd.ensureLeaderboardMessage(guild, store).catch(async (err) => {
        logger.error("ensureLeaderboardMessage failed", err, {
          location: "index.js -> ClientReady -> ensureLeaderboardMessage",
          guildId: guild.id,
        });

        await sendErrorAlert(client, "Leaderboard Initialisation Failed", err, {
          feature: "leaderboard",
          location: "ensureLeaderboardMessage",
          action: "Ensuring leaderboard message exists",
          likelyCause: "Missing leaderboard channel or message permissions.",
          severity: "warning",
        });
      });
    }
  }

  cron.schedule(
    "*/2 * * * *",
    async () => {
      try {
        if (typeof runCmd.expireTrackerControls === "function") {
          await runCmd.expireTrackerControls(client);
        }
      } catch (e) {
        logger.error("expireTrackerControls error", e, {
          location: "index.js -> cron -> expireTrackerControls",
        });

        await sendErrorAlert(client, "Tracker Control Expiry Failed", e, {
          feature: "tracker",
          location: "expireTrackerControls",
          action: "Expiring tracker proof/edit controls",
          likelyCause: "Tracker cleanup routine failed.",
          severity: "warning",
        });
      }
    },
    { timezone: TRACKER_TZ }
  );

  const [sunH, sunM] = SUNDAY_ANNOUNCE_TIME.split(":").map(Number);
  cron.schedule(
    `${sunM} ${sunH} * * 0`,
    async () => {
      for (const guild of client.guilds.cache.values()) {
        try {
          const store = readTrackerStore();
          const topP = topEntryLocal(store.weekly?.players);
          const topD = topEntryLocal(store.weekly?.divisions);
          const topE = topEntryLocal(store.weekly?.enemies);

          const ann = findTextChannelByName(guild, ANN_NAME);
          if (!ann) continue;

          await ann.send({
            content:
              `🏆 **WEEKLY RESULTS — THE GOLDEN VANGUARD**\n\n` +
              `🥇 **Top Diver:** ${topP ? `<@${topP.key}> — **${topP.val}**` : "_None_"}\n` +
              `🛡 **Top Division:** ${topD ? `**${topD.key}** — **${topD.val}**` : "_None_"}\n` +
              `👾 **Top Enemy Front:** ${topE ? `**${topE.key}** — **${topE.val}**` : "_None_"}\n\n` +
              `📌 Live leaderboard: **#${LB_NAME}**`,
            allowedMentions: topP ? { users: [topP.key] } : undefined,
          }).catch(() => {});

          store.history = store.history || { weeks: [] };
          store.history.weeks.push({
            monthKey: currentMonthKeyLocal(),
            createdAt: new Date().toISOString(),
            topPlayerId: topP?.key || null,
            topPlayerPoints: topP?.val || 0,
            topDivisionName: topD?.key || null,
            topDivisionPoints: topD?.val || 0,
            topEnemyName: topE?.key || null,
            topEnemyPoints: topE?.val || 0,
          });

          writeTrackerStore(store);
        } catch (err) {
          logger.error("Weekly tracker announce failed", err, {
            location: "index.js -> cron -> weekly announce",
            guildId: guild.id,
          });

          await sendErrorAlert(client, "Weekly Tracker Announcement Failed", err, {
            feature: "tracker",
            location: "weekly announce",
            action: "Posting weekly results",
            likelyCause: "Announcement channel missing or store read/write issue.",
            severity: "warning",
          });
        }
      }
    },
    { timezone: TRACKER_TZ }
  );

  const [monH, monM] = MONDAY_RESET_TIME.split(":").map(Number);
  cron.schedule(
    `${monM} ${monH} * * 1`,
    async () => {
      for (const guild of client.guilds.cache.values()) {
        try {
          const store = readTrackerStore();
          store.weekly = { players: {}, divisions: {}, enemies: {} };
          writeTrackerStore(store);

          if (typeof runCmd.updateLeaderboard === "function") {
            await runCmd.updateLeaderboard(guild).catch(() => {});
          } else if (typeof runCmd.ensureLeaderboardMessage === "function") {
            const freshStore = readTrackerStore();
            await runCmd.ensureLeaderboardMessage(guild, freshStore).catch(() => {});
          }
        } catch (err) {
          logger.error("Weekly tracker reset failed", err, {
            location: "index.js -> cron -> weekly reset",
            guildId: guild.id,
          });

          await sendErrorAlert(client, "Weekly Tracker Reset Failed", err, {
            feature: "tracker",
            location: "weekly reset",
            action: "Resetting weekly tracker data",
            likelyCause: "Store write error or leaderboard refresh failure.",
            severity: "warning",
          });
        }
      }

      await runProtected(client, {
        feature: "playerStats",
        action: "Resetting weekly player profiles",
        location: "index.js -> cron -> playerStats.resetWeeklyProfiles",
        likelyCause: "Player stats reset routine failed.",
        retries: 0,
        maxFailures: 3,
        job: async () => {
          playerStats.resetWeeklyProfiles();
        },
      });
    },
    { timezone: TRACKER_TZ }
  );

  cron.schedule(
    "55 23 * * *",
    async () => {
      if (!isLastDayOfMonthLondon()) return;

      for (const guild of client.guilds.cache.values()) {
        try {
          const store = readTrackerStore();
          const monthKey = store.monthly?.monthKey || currentMonthKeyLocal();

          const topP = topEntryLocal(store.monthly?.players);
          const topD = topEntryLocal(store.monthly?.divisions);
          const topE = topEntryLocal(store.monthly?.enemies);

          const ann = findTextChannelByName(guild, ANN_NAME);
          if (!ann) continue;

          await ann.send({
            content:
              `🏅 **MONTHLY RESULTS — ${monthKey}**\n\n` +
              `🥇 **Top Diver:** ${topP ? `<@${topP.key}> — **${topP.val}**` : "_None_"}\n` +
              `🛡 **Top Division:** ${topD ? `**${topD.key}** — **${topD.val}**` : "_None_"}\n` +
              `👾 **Top Enemy Front:** ${topE ? `**${topE.key}** — **${topE.val}**` : "_None_"}\n\n` +
              `📌 Leaderboards: **#${LB_NAME}**`,
            allowedMentions: topP ? { users: [topP.key] } : undefined,
          }).catch(() => {});
        } catch (err) {
          logger.error("Monthly tracker announce failed", err, {
            location: "index.js -> cron -> monthly announce",
            guildId: guild.id,
          });

          await sendErrorAlert(client, "Monthly Tracker Announcement Failed", err, {
            feature: "tracker",
            location: "monthly announce",
            action: "Posting monthly results",
            likelyCause: "Announcement channel missing or store issue.",
            severity: "warning",
          });
        }
      }
    },
    { timezone: TRACKER_TZ }
  );

  cron.schedule(
    "5 0 1 * *",
    async () => {
      for (const guild of client.guilds.cache.values()) {
        try {
          const store = readTrackerStore();
          store.monthly = {
            monthKey: currentMonthKeyLocal(),
            players: {},
            divisions: {},
            enemies: {},
          };
          writeTrackerStore(store);
        } catch (err) {
          logger.error("Monthly tracker reset failed", err, {
            location: "index.js -> cron -> monthly reset",
            guildId: guild.id,
          });

          await sendErrorAlert(client, "Monthly Tracker Reset Failed", err, {
            feature: "tracker",
            location: "monthly reset",
            action: "Resetting monthly tracker data",
            likelyCause: "Store write error.",
            severity: "warning",
          });
        }
      }

      await runProtected(client, {
        feature: "playerStats",
        action: "Resetting monthly player profiles",
        location: "index.js -> cron -> playerStats.resetMonthlyProfiles",
        likelyCause: "Player stats reset routine failed.",
        retries: 0,
        maxFailures: 3,
        job: async () => {
          playerStats.resetMonthlyProfiles();
        },
      });
    },
    { timezone: TRACKER_TZ }
  );

  logger.info(`Tracker enabled: AAR=#${AAR_NAME} LB=#${LB_NAME} ANN=#${ANN_NAME}`);
  logger.info(
    `Weekly: Sun ${SUNDAY_ANNOUNCE_TIME} announce | Mon ${MONDAY_RESET_TIME} reset (${TRACKER_TZ})`
  );
  logger.info(`Monthly: Last day 23:55 announce | 1st 00:05 reset (${TRACKER_TZ})`);
  logger.info(`War: 15m board refresh (${TRACKER_TZ})`);
});

/* =========================
   DISCORD CLIENT ERROR/WARN
   ========================= */
client.on(Events.Error, async (err) => {
  logger.error("Discord Client Error", err, {
    location: "client.on(Events.Error)",
  });

  await sendErrorAlert(client, "Discord Client Error", err, {
    feature: "discord-client",
    location: "client.on(Events.Error)",
    action: "Discord client runtime error",
    likelyCause: "Discord.js runtime issue or connection/client failure.",
    severity: "error",
  });
});

client.on(Events.Warn, (warning) => {
  logger.warn("Discord Client Warning", {
    location: "client.on(Events.Warn)",
    warning,
  });
});

/* =========================
   GLOBAL PROCESS HANDLERS
   ========================= */
process.on("unhandledRejection", async (reason) => {
  const err =
    reason instanceof Error ? reason : new Error(String(reason || "Unknown rejection"));

  logger.error("Unhandled Promise Rejection", err, {
    location: "process.on(unhandledRejection)",
  });

  try {
    await sendErrorAlert(client, "Unhandled Promise Rejection", err, {
      feature: "global-process",
      location: "process.on(unhandledRejection)",
      action: "Unhandled async failure",
      likelyCause: "A promise rejected without a catch handler.",
      severity: "critical",
    });
  } catch (alertErr) {
    logger.error("Failed to send unhandledRejection alert", alertErr, {
      location: "process.on(unhandledRejection)",
    });
  }
});

process.on("uncaughtException", async (err) => {
  logger.error("Uncaught Exception", err, {
    location: "process.on(uncaughtException)",
  });

  try {
    await sendErrorAlert(client, "Uncaught Exception", err, {
      feature: "global-process",
      location: "process.on(uncaughtException)",
      action: "Unexpected crash-level error",
      likelyCause: "A synchronous error was thrown and not caught.",
      severity: "critical",
    });
  } catch (alertErr) {
    logger.error("Failed to send uncaughtException alert", alertErr, {
      location: "process.on(uncaughtException)",
    });
  }
});

/* =========================
   CLEAN SHUTDOWN
   ========================= */
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

/* =========================
   LOGIN
   ========================= */
client.login(TOKEN).catch((err) => {
  logger.error("Failed to login bot", err, {
    location: "client.login",
  });

  console.error("❌ Bot login failed:", err);
  process.exit(1);
});