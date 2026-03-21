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
    console.error("[WELCOME] Failed:", err);
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
    console.error("[MessageCreate] error:", err);
  }
});

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
        await interaction.deferReply({ ephemeral: true });

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
            .followUp({ content: "Session expired.", ephemeral: true })
            .catch(() => {});
        }

        return interaction.reply({ content: "Session expired.", ephemeral: true }).catch(() => {});
      }

      if (interaction.user.id !== session.ownerId) {
        if (interaction.deferred || interaction.replied) {
          return interaction
            .followUp({
              content: "Only the host can set faction/difficulty.",
              ephemeral: true,
            })
            .catch(() => {});
        }

        return interaction
          .reply({
            content: "Only the host can set faction/difficulty.",
            ephemeral: true,
          })
          .catch(() => {});
      }

      try {
        await interaction.deferReply({ ephemeral: true });

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
        console.error("String select menu error:", error);

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
            ephemeral: true,
          })
          .catch(() => {});
      }
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
   VOICE STATE UPDATE
   ========================= */
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  try {
    orientationSystem.handleVoiceStateUpdate(oldState, newState);

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
    console.error("[VoiceStateUpdate] error:", err);
  }
});

/* =========================
   READY + TRACKER SCHEDULER
   ========================= */
client.once(Events.ClientReady, async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  try {
    await refreshWarBoard(client);
    console.log("✅ War board refreshed on startup");
  } catch (err) {
    console.error("❌ War board startup refresh failed:", err);
  }

  // Live war board refresh every 15 mins
  cron.schedule(
    "*/15 * * * *",
    async () => {
      try {
        await refreshWarBoard(client);
      } catch (err) {
        console.error("❌ War board scheduled refresh failed:", err);
      }
    },
    { timezone: TRACKER_TZ }
  );

  // High command alerts every 30 mins
  cron.schedule(
    "*/30 * * * *",
    async () => {
      try {
        await checkWarAlerts(client);
      } catch (err) {
        console.error("❌ War alerts scheduled check failed:", err);
      }
    },
    { timezone: TRACKER_TZ }
  );

  // War effort report daily at 18:00 UK
  cron.schedule(
    "0 18 * * *",
    async () => {
      try {
        await postWarEffort(client);
      } catch (err) {
        console.error("❌ War effort scheduled report failed:", err);
      }
    },
    { timezone: TRACKER_TZ }
  );

  let runCmd = null;
  try {
    runCmd = require("./commands/run.js");
  } catch {
    console.log("ℹ️ Tracker: ./commands/run.js not found (tracker scheduler disabled).");
    return;
  }

  function findTextChannelByName(guild, name) {
    const lower = name.toLowerCase();
    return guild.channels.cache.find((c) => c.isTextBased?.() && c.name?.toLowerCase() === lower);
  }

  function topEntry(obj) {
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
    const store = runCmd.readStore();
    await runCmd.ensureLeaderboardMessage(guild, store).catch(() => {});
  }

  cron.schedule(
    "*/2 * * * *",
    async () => {
      try {
        await runCmd.expireTrackerControls(client);
      } catch (e) {
        console.error("expireTrackerControls error:", e);
      }
    },
    { timezone: TRACKER_TZ }
  );

  const [sunH, sunM] = SUNDAY_ANNOUNCE_TIME.split(":").map(Number);
  cron.schedule(
    `${sunM} ${sunH} * * 0`,
    async () => {
      for (const guild of client.guilds.cache.values()) {
        const store = runCmd.readStore();
        const topP = topEntry(store.weekly?.players);
        const topD = topEntry(store.weekly?.divisions);
        const topE = topEntry(store.weekly?.enemies);

        const ann = findTextChannelByName(guild, ANN_NAME);
        if (!ann) continue;

        await ann
          .send({
            content:
              `🏆 **WEEKLY RESULTS — THE GOLDEN VANGUARD**\n\n` +
              `🥇 **Top Diver:** ${topP ? `<@${topP.key}> — **${topP.val}**` : "_None_"}\n` +
              `🛡 **Top Division:** ${topD ? `**${topD.key}** — **${topD.val}**` : "_None_"}\n` +
              `👾 **Top Enemy Front:** ${topE ? `**${topE.key}** — **${topE.val}**` : "_None_"}\n\n` +
              `📌 Live leaderboard: **#${LB_NAME}**`,
            allowedMentions: topP ? { users: [topP.key] } : undefined,
          })
          .catch(() => {});

        store.history = store.history || { weeks: [] };
        store.history.weeks.push({
          monthKey: runCmd.currentMonthKey(),
          createdAt: new Date().toISOString(),
          topPlayerId: topP?.key || null,
          topPlayerPoints: topP?.val || 0,
          topDivisionName: topD?.key || null,
          topDivisionPoints: topD?.val || 0,
          topEnemyName: topE?.key || null,
          topEnemyPoints: topE?.val || 0,
        });

        runCmd.writeStore(store);

        await postTopRankers(client, "weekly").catch(() => {});
        await postMedalHall(client).catch(() => {});
      }
    },
    { timezone: TRACKER_TZ }
  );

  const [monH, monM] = MONDAY_RESET_TIME.split(":").map(Number);
  cron.schedule(
    `${monM} ${monH} * * 1`,
    async () => {
      for (const guild of client.guilds.cache.values()) {
        const store = runCmd.readStore();
        store.weekly = { players: {}, divisions: {}, enemies: {} };
        runCmd.writeStore(store);
        await runCmd.updateLeaderboard(guild).catch(() => {});
      }
    },
    { timezone: TRACKER_TZ }
  );

  cron.schedule(
    "55 23 * * *",
    async () => {
      if (!isLastDayOfMonthLondon()) return;

      for (const guild of client.guilds.cache.values()) {
        const store = runCmd.readStore();
        const monthKey = store.monthly?.monthKey || runCmd.currentMonthKey();

        const topP = topEntry(store.monthly?.players);
        const topD = topEntry(store.monthly?.divisions);
        const topE = topEntry(store.monthly?.enemies);

        const ann = findTextChannelByName(guild, ANN_NAME);
        if (!ann) continue;

        await ann
          .send({
            content:
              `🏅 **MONTHLY RESULTS — ${monthKey}**\n\n` +
              `🥇 **Top Diver:** ${topP ? `<@${topP.key}> — **${topP.val}**` : "_None_"}\n` +
              `🛡 **Top Division:** ${topD ? `**${topD.key}** — **${topD.val}**` : "_None_"}\n` +
              `👾 **Top Enemy Front:** ${topE ? `**${topE.key}** — **${topE.val}**` : "_None_"}\n\n` +
              `📌 Leaderboards: **#${LB_NAME}**`,
            allowedMentions: topP ? { users: [topP.key] } : undefined,
          })
          .catch(() => {});

        await postTopRankers(client, "monthly").catch(() => {});
      }
    },
    { timezone: TRACKER_TZ }
  );

  cron.schedule(
    "5 0 1 * *",
    async () => {
      for (const guild of client.guilds.cache.values()) {
        const store = runCmd.readStore();
        store.monthly = {
          monthKey: runCmd.currentMonthKey(),
          players: {},
          divisions: {},
          enemies: {},
        };
        runCmd.writeStore(store);
      }
    },
    { timezone: TRACKER_TZ }
  );

  // Run once if needed, then comment back out
  // await orientationSystem.sendChecklistPanel(client).catch(console.error);

  console.log(`✅ Tracker enabled: AAR=#${AAR_NAME} LB=#${LB_NAME} ANN=#${ANN_NAME}`);
  console.log(
    `✅ Weekly: Sun ${SUNDAY_ANNOUNCE_TIME} announce | Mon ${MONDAY_RESET_TIME} reset (${TRACKER_TZ})`
  );
  console.log(`✅ Monthly: Last day 23:55 announce | 1st 00:05 reset (${TRACKER_TZ})`);
  console.log(`✅ War: 15m board refresh | 30m alerts | daily 18:00 war effort (${TRACKER_TZ})`);
});

client.login(TOKEN);