// =========================
// index.js
// CLEAN CORE FILE
// Scheduler extracted
// Tracker store extracted
// Interaction handler modular
// =========================

require("dotenv").config();

const fs = require("fs");
const path = require("path");

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

const orientationSystem = require("./services/orientationSystem");

const playerStats = require("./services/playerStats");

const { setupVoiceHubs } = require("./voiceHubs");

const {
  registerInteractionHandler,
} = require("./handlers/interactionHandler");

const {
  currentMonthKeyLocal,
  readTrackerStore,
  writeTrackerStore,
} = require("./services/trackerStore");

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

const TRACKER_TZ =
  process.env.TRACKER_TIMEZONE || "Europe/London";

const TRIGGER_TEXT = "@ask to play";

const MAX_SQUAD = 4;

const FACTION_SELECT_ID = "gv_faction";

const DIFFICULTY_SELECT_ID = "gv_difficulty";

const HUB_CATEGORY_ID = "1478464677783666778";

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

const commandsPath = path.join(
  __dirname,
  "commands"
);

if (fs.existsSync(commandsPath)) {
  const files = fs
    .readdirSync(commandsPath)
    .filter((f) => f.endsWith(".js"));

  for (const file of files) {
    try {
      const mod = require(
        `./commands/${file}`
      );

      if (
        mod?.data?.name &&
        typeof mod.execute ===
          "function"
      ) {
        commands.set(
          mod.data.name,
          mod
        );
      }

      if (
        mod?.adminData?.name &&
        typeof mod.executeAdmin ===
          "function"
      ) {
        commands.set(
          mod.adminData.name,
          {
            execute:
              mod.executeAdmin,
          }
        );
      }
    } catch (err) {
      logger.error(
        "Failed to load command file",
        err,
        {
          file,
        }
      );
    }
  }

  logger.info(
    `Loaded ${commands.size} slash command(s) from ./commands`
  );
}

// =========================
// ASK TO PLAY SESSIONS
// =========================

const sessions = new Map();

// =========================
// VC HELPERS
// =========================

function factionToTag(faction) {
  if (!faction) return null;

  if (faction === "Automatons")
    return "BOTS";

  if (faction === "Terminids")
    return "BUGS";

  if (faction === "Illuminate")
    return "SQUIDS";

  return null;
}

function safeUsername(user) {
  return (user?.username || "Host")
    .replace(/[^\w\s-]/g, "")
    .slice(0, 16);
}

async function renameHostVcFromSession(
  session,
  guild
) {
  const host = await guild.members
    .fetch(session.ownerId)
    .catch(() => null);

  const vc = host?.voice?.channel;

  if (!vc) return;

  if (vc.parentId !== HUB_CATEGORY_ID)
    return;

  if (!session.difficulty) return;

  const chosenTag =
    factionToTag(session.faction);

  let tag = chosenTag;

  if (!tag) {
    const m = vc.name.match(
      /^(MO|BOTS|BUGS|SQUIDS|DANGER)\s\|/i
    );

    tag = m
      ? m[1].toUpperCase()
      : null;
  }

  if (!tag) return;

  const hostName =
    safeUsername(host.user);

  const desired =
    `${tag} | D${session.difficulty} | ${hostName}`;

  if (vc.name === desired) return;

  try {
    await vc.setName(
      desired,
      "Auto rename from Ask to Play difficulty selection"
    );
  } catch (err) {
    logger.error(
      "VC rename failed",
      err,
      {
        location:
          "index.js -> renameHostVcFromSession",
      }
    );
  }
}

// =========================
// ASK TO PLAY EMBEDS
// =========================

function rosterText(roster) {
  if (!roster.size)
    return "_No one in VC yet._";

  return [...roster]
    .map(
      (id, i) =>
        `${i + 1}. <@${id}>`
    )
    .join("\n");
}

function buildAskEmbed(
  session,
  vcName
) {
  return new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle(
      "🎯 Ask-to-Play Alert"
    )
    .setDescription(
      ASK_ROLE_ID
        ? `<@${session.ownerId}> pinged <@&${ASK_ROLE_ID}>`
        : `<@${session.ownerId}> is requesting backup!`
    )
    .addFields(
      {
        name: "Difficulty",
        value:
          session.difficulty ||
          "Not specified",
        inline: true,
      },

      {
        name: "Faction",
        value:
          session.faction ||
          "Not specified",
        inline: true,
      },

      {
        name: "Voice Channel",
        value:
          vcName ||
          "Not currently in a voice channel.",
        inline: false,
      },

      {
        name: "Squad",
        value:
          `${session.roster.size}/${MAX_SQUAD}`,
        inline: true,
      },

      {
        name: "Roster",
        value:
          rosterText(
            session.roster
          ),
        inline: false,
      }
    )
    .setFooter({
      text: "The Golden Vanguard",
    })
    .setTimestamp();
}

function buildAskComponents(
  session
) {
  const factionDone =
    !!session.faction;

  const difficultyDone =
    !!session.difficulty;

  if (
    factionDone &&
    difficultyDone
  )
    return [];

  const factionMenu =
    new StringSelectMenuBuilder()
      .setCustomId(
        FACTION_SELECT_ID
      )
      .setPlaceholder(
        factionDone
          ? `Faction: ${session.faction}`
          : "Choose a faction…"
      )
      .addOptions(
        {
          label: "Terminids",
          value: "Terminids",
        },

        {
          label: "Automatons",
          value: "Automatons",
        },

        {
          label: "Illuminate",
          value: "Illuminate",
        },

        {
          label:
            "Any / Flexible",
          value:
            "Any / Flexible",
        }
      );

  const difficultyMenu =
    new StringSelectMenuBuilder()
      .setCustomId(
        DIFFICULTY_SELECT_ID
      )
      .setPlaceholder(
        difficultyDone
          ? `Difficulty: ${session.difficulty}`
          : "Choose difficulty…"
      )
      .addOptions(
        ...Array.from(
          { length: 10 },
          (_, i) => {
            const v =
              String(i + 1);

            return {
              label: v,
              value: v,
            };
          }
        )
      );

  return [
    new ActionRowBuilder().addComponents(
      factionMenu
    ),

    new ActionRowBuilder().addComponents(
      difficultyMenu
    ),
  ];
}

// =========================
// INTERACTION HANDLER
// =========================

registerInteractionHandler(
  client,
  commands,
  sessions,
  {
    FACTION_SELECT_ID,
    DIFFICULTY_SELECT_ID,
    renameHostVcFromSession,
  }
);

// =========================
// MEMBER JOIN
// =========================

client.on(
  Events.GuildMemberAdd,
  async (member) => {
    try {
      if (WELCOME_CHANNEL_ID) {
        const ch =
          await member.guild.channels
            .fetch(
              WELCOME_CHANNEL_ID
            )
            .catch(() => null);

        if (ch?.isTextBased()) {
          await ch.send({
            embeds: [
              new EmbedBuilder()
                .setColor(
                  0xf1c40f
                )
                .setTitle(
                  "🛡 Welcome to The Golden Vanguard"
                )
                .setDescription(
                  `Welcome ${member.displayName}`
                ),
            ],
          });
        }
      }

      await orientationSystem.logNewRecruit(
        member
      );

      registry.registerSuccess(
        "orientation"
      );
    } catch (err) {
      logger.error(
        "GuildMemberAdd failed",
        err
      );
    }
  }
);

// =========================
// READY
// =========================

client.once(
  Events.ClientReady,
  async () => {
    logger.info(
      `Logged in as ${client.user.tag}`,
      {
        botId: client.user.id,
      }
    );

    await sendStartupAlert(
      client,
      `Golden Vanguard bot is now online as **${client.user.tag}**`
    );

    await startScheduler(
      client
    );
  }
);

// =========================
// CLIENT WARN/ERROR
// =========================

client.on(
  Events.Error,
  async (err) => {
    logger.error(
      "Discord Client Error",
      err
    );
  }
);

client.on(
  Events.Warn,
  (warning) => {
    logger.warn(
      "Discord Client Warning",
      {
        warning,
      }
    );
  }
);

// =========================
// PROCESS HANDLERS
// =========================

process.on(
  "unhandledRejection",
  async (reason) => {
    const err =
      reason instanceof Error
        ? reason
        : new Error(
            String(reason)
          );

    logger.error(
      "Unhandled Promise Rejection",
      err
    );
  }
);

process.on(
  "uncaughtException",
  async (err) => {
    logger.error(
      "Uncaught Exception",
      err
    );
  }
);

// =========================
// SHUTDOWN
// =========================

async function shutdown(
  signal
) {
  logger.warn(
    `Shutdown signal received: ${signal}`
  );

  try {
    if (client.isReady()) {
      await sendAlert(client, {
        title:
          "Bot Shutdown",

        description:
          `Golden Vanguard bot is shutting down after receiving **${signal}**.`,

        severity:
          "warning",
      });
    }
  } catch {}

  try {
    client.destroy();
  } catch {}

  process.exit(0);
}

process.on(
  "SIGINT",
  () => shutdown("SIGINT")
);

process.on(
  "SIGTERM",
  () => shutdown("SIGTERM")
);

// =========================
// LOGIN
// =========================

client.login(TOKEN).catch(
  (err) => {
    logger.error(
      "Failed to login bot",
      err
    );

    console.error(
      "❌ Bot login failed:",
      err
    );

    process.exit(1);
  }
);
