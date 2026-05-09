// =========================
// index.js
// CLEAN CORE FILE
// Tracker store moved to services/trackerStore.js
// Interaction handler modular
// Preserves all existing functionality
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

const githubDeployService = require("./services/githubDeployService");

const registry = require("./services/featureRegistry");

const { runProtected } = require("./services/featureGuard");

const {
  currentMonthKeyLocal,
  readTrackerStore,
  writeTrackerStore,
} = require("./services/trackerStore");

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

// ===== ENV =====

const TOKEN = process.env.DISCORD_TOKEN;

const ASK_ROLE_ID =
  (process.env.PING_ROLE_ID || "").trim();

const ALLOWED_CHANNEL_ID =
  (process.env.ALLOWED_CHANNEL_ID || "").trim() || null;

const WELCOME_CHANNEL_ID =
  (process.env.WELCOME_CHANNEL_ID || "").trim() || null;

const AAR_NAME =
  (process.env.AAR_CHANNEL_NAME || "after-action-reports").trim();

const LB_NAME =
  (process.env.LB_CHANNEL_NAME || "leaderboards").trim();

const ANN_NAME =
  (process.env.ANN_CHANNEL_NAME || "top-rankers").trim();

const TRACKER_TZ =
  process.env.TRACKER_TIMEZONE || "Europe/London";

const SUNDAY_ANNOUNCE_TIME =
  (process.env.SUNDAY_ANNOUNCE_TIME || "23:00").trim();

const MONDAY_RESET_TIME =
  (
    process.env.MONDAY_RESET_TIME ||
    process.env.MONDAY_RESET ||
    "00:00"
  ).trim();

const DISCOVERY_SCAN_CRON =
  (
    process.env.DISCOVERY_SCAN_CRON ||
    "*/10 * * * *"
  ).trim();

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
// VC SYSTEM
// =========================

setupVoiceHubs(client);

// =========================
// LOAD COMMANDS
// =========================

const commands = new Map();

const commandsPath = path.join(__dirname, "commands");

if (fs.existsSync(commandsPath)) {
  const files = fs
    .readdirSync(commandsPath)
    .filter((f) => f.endsWith(".js"));

  for (const file of files) {
    try {
      const mod = require(`./commands/${file}`);

      if (
        mod?.data?.name &&
        typeof mod.execute === "function"
      ) {
        commands.set(mod.data.name, mod);
      }

      if (
        mod?.adminData?.name &&
        typeof mod.executeAdmin === "function"
      ) {
        commands.set(mod.adminData.name, {
          execute: mod.executeAdmin,
        });
      }
    } catch (err) {
      logger.error("Failed to load command file", err, {
        file,
      });
    }
  }

  logger.info(
    `Loaded ${commands.size} slash command(s) from ./commands`
  );
}

// =========================
// ASK TO PLAY SESSION STORE
// =========================

const sessions = new Map();

// =========================
// VOICE RENAME HELPERS
// =========================

function factionToTag(faction) {
  if (!faction) return null;

  if (faction === "Automatons") return "BOTS";

  if (faction === "Terminids") return "BUGS";

  if (faction === "Illuminate") return "SQUIDS";

  if (faction === "Any / Flexible") return null;

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

  if (vc.parentId !== HUB_CATEGORY_ID) return;

  if (!session.difficulty) return;

  const chosenTag = factionToTag(session.faction);

  let tag = chosenTag;

  if (!tag) {
    const m = vc.name.match(
      /^(MO|BOTS|BUGS|SQUIDS|DANGER)\s\|/i
    );

    tag = m ? m[1].toUpperCase() : null;
  }

  if (!tag) return;

  const hostName = safeUsername(host.user);

  const desired =
    `${tag} | D${session.difficulty} | ${hostName}`;

  if (vc.name === desired) return;

  try {
    await vc.setName(
      desired,
      "Auto rename from Ask to Play difficulty selection"
    );
  } catch (err) {
    logger.error("VC rename failed", err, {
      location:
        "index.js -> renameHostVcFromSession",
      channelId: vc.id,
      desiredName: desired,
    });

    await sendErrorAlert(
      client,
      "VC Rename Failed",
      err,
      {
        feature: "askToPlay",
        location: "renameHostVcFromSession",
        action: "Renaming host voice channel",
        likelyCause:
          "Missing permission or invalid channel state.",
        severity: "warning",
      }
    );
  }
}

// =========================
// WELCOME EMBED
// =========================

function buildWelcomeEmbed(
  member,
  memberCount
) {
  const username =
    member.displayName ||
    member.user?.globalName ||
    member.user?.username ||
    "Recruit";

  return new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle(
      "🛡 Welcome to The Golden Vanguard"
    )
    .setDescription(
      [
        `Welcome ${username},`,
        "",
        "You’ve joined a tactical squad-based community built for coordination, growth, and winning together.",
        "",
        "Here, we don’t just play — we deploy with purpose.",
        "",
        "━━━━━━━━━━━━━━━━━━",
        "",
        "🪖 **Become a True Vanguard Member**",
        "To unlock full access and fight alongside the Vanguard, you must complete your Recruit Orientation.",
        "",
        "📍 Head to **#orientation-checklist** to begin",
        "⏳ You have **7 days** to complete it",
        "",
        "━━━━━━━━━━━━━━━━━━",
        "",
        "Form up. Drop in. Execute.",
        "",
        `🎖 Member #${memberCount}`,
      ].join("\n")
    )
    .setTimestamp()
    .setFooter({
      text: "The Golden Vanguard",
    });
}

// =========================
// GUILD MEMBER ADD
// =========================

client.on(
  Events.GuildMemberAdd,
  async (member) => {
    try {
      if (WELCOME_CHANNEL_ID) {
        const ch =
          await member.guild.channels
            .fetch(WELCOME_CHANNEL_ID)
            .catch(() => null);

        if (ch?.isTextBased()) {
          await ch.send({
            embeds: [
              buildWelcomeEmbed(
                member,
                member.guild.memberCount
              ),
            ],
          });
        }
      }

      await orientationSystem.logNewRecruit(
        member
      );

      registry.registerSuccess("orientation");
    } catch (err) {
      logger.error("GuildMemberAdd failed", err, {
        location:
          "index.js -> GuildMemberAdd",
        memberId: member?.id,
      });

      await sendErrorAlert(
        client,
        "Welcome/Recruit Logging Failed",
        err,
        {
          feature: "orientation",
          location: "GuildMemberAdd",
          action:
            "Welcoming new member / logging recruit",
          likelyCause:
            "Channel issue, permissions, or orientation handler failure.",
          severity: "warning",
        }
      );
    }
  }
);

// =========================
// ASK TO PLAY HELPERS
// =========================

function rosterText(roster) {
  if (!roster.size)
    return "_No one in VC yet._";

  return [...roster]
    .map((id, i) => `${i + 1}. <@${id}>`)
    .join("\n");
}

function buildAskEmbed(
  session,
  vcName
) {
  return new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle("🎯 Ask-to-Play Alert")
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
        value: rosterText(session.roster),
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
          label: "Any / Flexible",
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
// REGISTER INTERACTIONS
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
// READY EVENT
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

    try {
      await githubDeployService.resumePendingDeployment(
        client
      );

      registry.registerSuccess(
        "registry"
      );
    } catch (err) {
      logger.error(
        "GitHub deployment recovery failed",
        err
      );
    }

    await runProtected(client, {
      feature: "warboard",

      action:
        "Refreshing war board on startup",

      location:
        "index.js -> ClientReady -> refreshWarBoard",

      likelyCause:
        "Refresh job failed",

      retries: 1,

      retryDelayMs: 2000,

      maxFailures: 3,

      job: async () => {
        await refreshWarBoard(
          client
        );

        logger.info(
          "War board refreshed on startup"
        );

        registry.registerSuccess(
          "warboard"
        );
      },
    });

    cron.schedule(
      "*/15 * * * *",
      async () => {
        await refreshWarBoard(
          client
        );
      },
      {
        timezone: TRACKER_TZ,
      }
    );

    cron.schedule(
      DISCOVERY_SCAN_CRON,
      async () => {
        await scanForReviews(
          client,
          "Scheduled Scan"
        );
      },
      {
        timezone: TRACKER_TZ,
      }
    );

    logger.info(
      `Tracker enabled: AAR=#${AAR_NAME} LB=#${LB_NAME} ANN=#${ANN_NAME}`
    );

    logger.info(
      `Weekly: Sun ${SUNDAY_ANNOUNCE_TIME} announce | Mon ${MONDAY_RESET_TIME} reset (${TRACKER_TZ})`
    );

    logger.info(
      `War: 15m board refresh (${TRACKER_TZ})`
    );

    logger.info(
      `Discovery: ${DISCOVERY_SCAN_CRON} (${TRACKER_TZ})`
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
      err,
      {
        location:
          "client.on(Events.Error)",
      }
    );
  }
);

client.on(
  Events.Warn,
  (warning) => {
    logger.warn(
      "Discord Client Warning",
      {
        location:
          "client.on(Events.Warn)",
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
            String(
              reason ||
                "Unknown rejection"
            )
          );

    logger.error(
      "Unhandled Promise Rejection",
      err,
      {
        location:
          "process.on(unhandledRejection)",
      }
    );
  }
);

process.on(
  "uncaughtException",
  async (err) => {
    logger.error(
      "Uncaught Exception",
      err,
      {
        location:
          "process.on(uncaughtException)",
      }
    );
  }
);

// =========================
// CLEAN SHUTDOWN
// =========================

async function shutdown(
  signal
) {
  logger.warn(
    `Shutdown signal received: ${signal}`,
    {
      location: "shutdown()",
    }
  );

  try {
    if (client.isReady()) {
      await sendAlert(client, {
        title: "Bot Shutdown",

        description:
          `Golden Vanguard bot is shutting down after receiving **${signal}**.`,

        severity: "warning",
      });
    }
  } catch (err) {
    logger.error(
      "Failed to send shutdown alert",
      err
    );
  }

  try {
    client.destroy();
  } catch (err) {
    logger.error(
      "Failed to destroy Discord client cleanly",
      err
    );
  }

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
      err,
      {
        location:
          "client.login",
      }
    );

    console.error(
      "❌ Bot login failed:",
      err
    );

    process.exit(1);
  }
);
