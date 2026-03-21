// =========================
// commands/profile.js
// FULL NEW FILE
// =========================

const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { buildProfileSummary } = require("../services/playerStats");

function fmtNum(n) {
  return Number(n || 0).toLocaleString();
}

function fmtMinutes(totalMinutes) {
  const mins = Number(totalMinutes || 0);
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;

  if (hours <= 0) return `${rem}m`;
  return `${hours}h ${rem}m`;
}

function topLabel(entry, suffix = "") {
  if (!entry) return "_None yet_";
  return `**${entry.key}**${suffix ? ` — ${entry.val}${suffix}` : ` — ${entry.val}`}`;
}

function buildStatsBlock(label, bucket) {
  const wins = Number(bucket?.wins || 0);
  const losses = Number(bucket?.losses || 0);
  const runs = Number(bucket?.runsLogged || 0);
  const proofRuns = Number(bucket?.proofRuns || 0);
  const kills = Number(bucket?.kills || 0);
  const deaths = Number(bucket?.deaths || 0);
  const accidentals = Number(bucket?.accidentals || 0);
  const score = Number(bucket?.score || 0);
  const vcMinutes = Number(bucket?.vcMinutes || 0);

  const kd =
    deaths > 0 ? (kills / deaths).toFixed(2) : kills > 0 ? String(kills) : "0.00";

  const winRate =
    runs > 0 ? `${((wins / runs) * 100).toFixed(1)}%` : "0.0%";

  return [
    `**${label}**`,
    `Runs: **${fmtNum(runs)}**`,
    `Proof Runs: **${fmtNum(proofRuns)}**`,
    `Wins / Losses: **${fmtNum(wins)} / ${fmtNum(losses)}**`,
    `Win Rate: **${winRate}**`,
    `Kills: **${fmtNum(kills)}**`,
    `Deaths: **${fmtNum(deaths)}**`,
    `K/D: **${kd}**`,
    `Accidentals: **${fmtNum(accidentals)}**`,
    `Score: **${fmtNum(score)}**`,
    `VC Time: **${fmtMinutes(vcMinutes)}**`,
  ].join("\n");
}

const data = new SlashCommandBuilder()
  .setName("profile")
  .setDescription("View Vanguard tracker profile stats.")
  .addUserOption((o) =>
    o
      .setName("user")
      .setDescription("Check another diver's profile")
      .setRequired(false)
  );

async function execute(interaction) {
  try {
    const targetUser = interaction.options.getUser("user") || interaction.user;
    const summary = buildProfileSummary(targetUser.id);

    const lifetime = summary.lifetime;
    const weekly = summary.weekly;
    const monthly = summary.monthly;

    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle(`📊 Vanguard Profile — ${targetUser.username}`)
      .setDescription(
        [
          `Diver: <@${targetUser.id}>`,
          "",
          `**Favourite Mission**: ${topLabel(summary.favoriteMission)}`,
          `**Favourite Enemy**: ${topLabel(summary.favoriteEnemy)}`,
          `**Favourite Planet**: ${topLabel(summary.favoritePlanet)}`,
          `**Favourite Difficulty**: ${topLabel(summary.favoriteDifficulty)}`,
        ].join("\n")
      )
      .addFields(
        {
          name: "🏅 Lifetime",
          value: buildStatsBlock("Career Record", lifetime),
          inline: false,
        },
        {
          name: "📆 Weekly",
          value: buildStatsBlock("Current Week", weekly),
          inline: true,
        },
        {
          name: "🗓 Monthly",
          value: buildStatsBlock("Current Month", monthly),
          inline: true,
        }
      )
      .setFooter({ text: "The Golden Vanguard" })
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  } catch (err) {
    console.error("[PROFILE] execute failed:", err);
    return interaction.reply({
      content: "Profile lookup failed.",
      ephemeral: true,
    }).catch(() => {});
  }
}

module.exports = {
  data,
  execute,
};