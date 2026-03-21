// =========================
// commands/profile.js
// =========================

const fs = require("fs");
const path = require("path");
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

const STORE_PATH = path.join(__dirname, "..", "tracker_store.json");
const TRACKER_TZ = process.env.TRACKER_TIMEZONE || "Europe/London";

function readStore() {
  try {
    if (!fs.existsSync(STORE_PATH)) {
      return {
        users: {},
        runs: [],
      };
    }

    return JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
  } catch (err) {
    console.error("[PROFILE] readStore failed:", err);
    return {
      users: {},
      runs: [],
    };
  }
}

function makeEmptyStats() {
  return {
    totalRuns: 0,
    wins: 0,
    losses: 0,
    totalKills: 0,
    totalDeaths: 0,
    totalAccidentals: 0,
    proofRuns: 0,
    pointsEarned: 0,
    kd: 0,
    winRate: 0,
    byEnemy: {
      Terminids: { runs: 0, wins: 0, losses: 0, kills: 0 },
      Automatons: { runs: 0, wins: 0, losses: 0, kills: 0 },
      Illuminate: { runs: 0, wins: 0, losses: 0, kills: 0 },
    },
    byPlanet: {},
    byDifficulty: {},
    updatedAt: null,
  };
}

function buildStatsFromRuns(runs) {
  const stats = makeEmptyStats();

  for (const run of runs) {
    if (!run || run.status === "deleted") continue;

    stats.totalRuns += 1;
    stats.totalKills += Number(run.kills || 0);
    stats.totalDeaths += Number(run.deaths || 0);
    stats.totalAccidentals += Number(run.accidentals || 0);
    stats.pointsEarned += Number(run.scoreAwarded || 0);

    if (run.proofApplied) stats.proofRuns += 1;

    const won = run.mainObjective === "Yes";
    if (won) stats.wins += 1;
    else stats.losses += 1;

    if (stats.byEnemy[run.enemy]) {
      stats.byEnemy[run.enemy].runs += 1;
      stats.byEnemy[run.enemy].kills += Number(run.kills || 0);
      if (won) stats.byEnemy[run.enemy].wins += 1;
      else stats.byEnemy[run.enemy].losses += 1;
    }

    const planet = run.planet || "Unknown";
    stats.byPlanet[planet] = stats.byPlanet[planet] || {
      runs: 0,
      wins: 0,
      losses: 0,
      kills: 0,
      points: 0,
    };
    stats.byPlanet[planet].runs += 1;
    stats.byPlanet[planet].kills += Number(run.kills || 0);
    stats.byPlanet[planet].points += Number(run.scoreAwarded || 0);
    if (won) stats.byPlanet[planet].wins += 1;
    else stats.byPlanet[planet].losses += 1;

    const difficulty = String(run.difficulty || "Unknown");
    stats.byDifficulty[difficulty] = stats.byDifficulty[difficulty] || {
      runs: 0,
      wins: 0,
      losses: 0,
      kills: 0,
      points: 0,
    };
    stats.byDifficulty[difficulty].runs += 1;
    stats.byDifficulty[difficulty].kills += Number(run.kills || 0);
    stats.byDifficulty[difficulty].points += Number(run.scoreAwarded || 0);
    if (won) stats.byDifficulty[difficulty].wins += 1;
    else stats.byDifficulty[difficulty].losses += 1;
  }

  stats.kd =
    stats.totalDeaths > 0
      ? Number((stats.totalKills / stats.totalDeaths).toFixed(2))
      : stats.totalKills;

  stats.winRate =
    stats.totalRuns > 0
      ? Number(((stats.wins / stats.totalRuns) * 100).toFixed(1))
      : 0;

  stats.updatedAt = new Date().toISOString();

  return stats;
}

function getUserStats(store, userId) {
  const saved = store?.users?.[userId]?.stats;
  if (saved && typeof saved === "object") return saved;

  const runs = (store.runs || []).filter((r) => r.loggerId === userId);
  return buildStatsFromRuns(runs);
}

function topEntry(obj, scoreKey = null) {
  const entries = Object.entries(obj || {});
  if (!entries.length) return null;

  entries.sort((a, b) => {
    const aVal = scoreKey ? Number(a[1]?.[scoreKey] || 0) : Number(a[1] || 0);
    const bVal = scoreKey ? Number(b[1]?.[scoreKey] || 0) : Number(b[1] || 0);
    return bVal - aVal;
  });

  return entries[0];
}

function fmtEnemyLine(name, data) {
  return [
    `**${name}**`,
    `Runs: **${Number(data?.runs || 0)}**`,
    `Kills: **${Number(data?.kills || 0)}**`,
    `W/L: **${Number(data?.wins || 0)} / ${Number(data?.losses || 0)}**`,
  ].join(" • ");
}

const data = new SlashCommandBuilder()
  .setName("profile")
  .setDescription("Show your Golden Vanguard combat profile.")
  .addUserOption((o) =>
    o
      .setName("user")
      .setDescription("View another diver's profile")
      .setRequired(false)
  );

async function execute(interaction) {
  const targetUser = interaction.options.getUser("user") || interaction.user;
  const store = readStore();
  const stats = getUserStats(store, targetUser.id);

  if (!stats.totalRuns) {
    return interaction.reply({
      content: `No tracked runs found for **${targetUser.username}** yet.`,
      ephemeral: true,
    });
  }

  const topPlanet = topEntry(stats.byPlanet, "runs");
  const topDifficulty = topEntry(stats.byDifficulty, "runs");

  const terminids = stats.byEnemy?.Terminids || {};
  const automatons = stats.byEnemy?.Automatons || {};
  const illuminate = stats.byEnemy?.Illuminate || {};

  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle(`🪖 ${targetUser.username}'s Vanguard Profile`)
    .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
    .setDescription(
      [
        `**Combat Record for** <@${targetUser.id}>`,
        "",
        `Runs Logged: **${stats.totalRuns}**`,
        `Wins / Losses: **${stats.wins} / ${stats.losses}**`,
        `Win Rate: **${stats.winRate}%**`,
        `K/D Ratio: **${stats.kd}**`,
        "",
        `Total Kills: **${stats.totalKills}**`,
        `Total Deaths: **${stats.totalDeaths}**`,
        `Accidentals: **${stats.totalAccidentals}**`,
        `Proof Runs: **${stats.proofRuns}**`,
        `Points Earned: **${stats.pointsEarned}**`,
      ].join("\n")
    )
    .addFields(
      {
        name: "👾 Enemy Breakdown",
        value: [
          fmtEnemyLine("Terminids", terminids),
          fmtEnemyLine("Automatons", automatons),
          fmtEnemyLine("Illuminate", illuminate),
        ].join("\n"),
        inline: false,
      },
      {
        name: "🪐 Most Fought Planet",
        value: topPlanet
          ? `**${topPlanet[0]}** — ${Number(topPlanet[1]?.runs || 0)} runs`
          : "_No data_",
        inline: true,
      },
      {
        name: "🎯 Most Played Difficulty",
        value: topDifficulty
          ? `**D${topDifficulty[0]}** — ${Number(topDifficulty[1]?.runs || 0)} runs`
          : "_No data_",
        inline: true,
      },
      {
        name: "📎 Proof Usage",
        value:
          stats.totalRuns > 0
            ? `**${Number(((stats.proofRuns / stats.totalRuns) * 100).toFixed(1))}%** of runs verified`
            : "_No data_",
        inline: true,
      }
    )
    .setFooter({ text: "The Golden Vanguard" })
    .setTimestamp();

  return interaction.reply({ embeds: [embed] });
}

module.exports = {
  data,
  execute,
};