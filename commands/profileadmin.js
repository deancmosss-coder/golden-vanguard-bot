// =========================
// commands/profileadmin.js
// FULL NEW FILE
// Admin tools for rebuilding player profile stats
// =========================

const fs = require("fs");
const path = require("path");
const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

const STORE_PATH = path.join(__dirname, "..", "tracker_store.json");
const playerStats = require("../services/playerStats");
const medalService = require("../services/medalService");

function readStore() {
  try {
    if (!fs.existsSync(STORE_PATH)) {
      return {
        runs: [],
        profiles: {},
      };
    }
    return JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
  } catch (err) {
    console.error("[PROFILEADMIN] readStore failed:", err);
    return {
      runs: [],
      profiles: {},
    };
  }
}

function writeStore(store) {
  try {
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
  } catch (err) {
    console.error("[PROFILEADMIN] writeStore failed:", err);
  }
}

function chunkLines(lines, maxLen = 1800) {
  const chunks = [];
  let current = "";

  for (const line of lines) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length > maxLen) {
      if (current) chunks.push(current);
      current = line;
    } else {
      current = next;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

function rebuildAllProfiles() {
  const store = readStore();
  const runs = Array.isArray(store.runs) ? store.runs : [];

  store.profiles = {};
  writeStore(store);

  const countedUsers = new Set();
  let processedRuns = 0;

  for (const run of runs) {
    if (!run || run.status === "deleted" || !run.loggerId) continue;
    playerStats.recordRun(run);
    countedUsers.add(run.loggerId);
    processedRuns += 1;
  }

  return {
    processedRuns,
    userCount: countedUsers.size,
  };
}

function rebuildSingleProfile(userId) {
  const store = readStore();
  const runs = Array.isArray(store.runs) ? store.runs : [];
  const userRuns = runs.filter((r) => r && r.loggerId === userId && r.status !== "deleted");

  const fresh = readStore();
  fresh.profiles = fresh.profiles || {};
  delete fresh.profiles[userId];
  writeStore(fresh);

  for (const run of userRuns) {
    playerStats.recordRun(run);
  }

  return {
    processedRuns: userRuns.length,
  };
}

function inspectUserRuns(userId) {
  const store = readStore();
  const runs = Array.isArray(store.runs) ? store.runs : [];
  return runs.filter((r) => r && r.loggerId === userId && r.status !== "deleted");
}

const data = new SlashCommandBuilder()
  .setName("profileadmin")
  .setDescription("Admin tools for rebuilding Vanguard profile stats.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

  .addSubcommand((s) =>
    s
      .setName("rebuild")
      .setDescription("Rebuild all player profiles from existing runs.")
  )

  .addSubcommand((s) =>
    s
      .setName("rebuild-user")
      .setDescription("Rebuild one player's profile from their runs.")
      .addUserOption((o) =>
        o
          .setName("user")
          .setDescription("Player to rebuild")
          .setRequired(true)
      )
  )

  .addSubcommand((s) =>
    s
      .setName("inspect")
      .setDescription("Inspect how many tracked runs a player has.")
      .addUserOption((o) =>
        o
          .setName("user")
          .setDescription("Player to inspect")
          .setRequired(true)
      )
  );

async function execute(interaction) {
  try {
    const sub = interaction.options.getSubcommand();

    if (sub === "rebuild") {
      await interaction.deferReply({ ephemeral: true });

      const result = rebuildAllProfiles();
      const medalSummary = medalService.rebuildAllMedals();

      const lines = [
        "✅ Profile rebuild complete.",
        `Runs processed: **${result.processedRuns}**`,
        `Players rebuilt: **${result.userCount}**`,
        `Medal records checked: **${medalSummary.length}**`,
      ];

      return interaction.editReply(lines.join("\n"));
    }

    if (sub === "rebuild-user") {
      const user = interaction.options.getUser("user", true);
      await interaction.deferReply({ ephemeral: true });

      const result = rebuildSingleProfile(user.id);
      const unlocked = medalService.evaluateAndStore(user.id);

      const lines = [
        `✅ Rebuilt profile for **${user.username}**.`,
        `Runs processed: **${result.processedRuns}**`,
      ];

      if (unlocked.length) {
        lines.push("", "**New medals unlocked**");
        for (const medal of unlocked) {
          lines.push(`🏅 **${medal.name}** — ${medal.description}`);
        }
      }

      return interaction.editReply(lines.join("\n"));
    }

    if (sub === "inspect") {
      const user = interaction.options.getUser("user", true);
      const runs = inspectUserRuns(user.id);

      if (!runs.length) {
        return interaction.reply({
          content: `No tracked runs found for **${user.username}**.`,
          ephemeral: true,
        });
      }

      const recent = runs
        .slice(-10)
        .reverse()
        .map((run) => {
          return [
            `• **${run.runId || "Unknown"}**`,
            `${run.planet || "Unknown Planet"}`,
            `${run.enemy || "Unknown Enemy"}`,
            `D${run.difficulty || "?"}`,
            `${run.scoreAwarded || 0} pts`,
          ].join(" — ");
        });

      const lines = [
        `📊 **${user.username}** tracked run summary`,
        `Total active runs: **${runs.length}**`,
        "",
        "**Most recent runs**",
        ...recent,
      ];

      const chunks = chunkLines(lines);
      await interaction.reply({ content: chunks[0], ephemeral: true });

      for (let i = 1; i < chunks.length; i += 1) {
        await interaction.followUp({ content: chunks[i], ephemeral: true }).catch(() => {});
      }

      return;
    }

    return interaction.reply({
      content: "Unknown subcommand.",
      ephemeral: true,
    });
  } catch (err) {
    console.error("[PROFILEADMIN] execute failed:", err);

    if (interaction.deferred || interaction.replied) {
      return interaction.editReply("Profile admin command failed.").catch(() => {});
    }

    return interaction.reply({
      content: "Profile admin command failed.",
      ephemeral: true,
    }).catch(() => {});
  }
}

module.exports = {
  data,
  execute,
};