// =========================
// commands/test.js
// FULL SCRIPT
// Admin test command
// =========================

const {
  SlashCommandBuilder,
  EmbedBuilder,
  AttachmentBuilder,
  PermissionFlagsBits,
} = require("discord.js");

const fs = require("fs");
const path = require("path");
const {
  runAllTests,
  testSystem,
  summarise,
  formatSingleFeatureResults,
  formatAllResults,
} = require("../services/testRunner");

const VALID_FEATURES = [
  "commands",
  "tracker",
  "warboard",
  "asktoplay",
  "orientation",
  "playerstats",
  "leaderboard",
  "enlistment",
  "all",
];

function buildSummaryEmbed(title, summary, feature = null) {
  const embed = new EmbedBuilder()
    .setColor(summary.failed > 0 ? 0xe67e22 : 0x2ecc71)
    .setTitle(title)
    .addFields(
      { name: "Passed", value: String(summary.passed), inline: true },
      { name: "Failed", value: String(summary.failed), inline: true },
      { name: "Total", value: String(summary.total), inline: true }
    )
    .setTimestamp()
    .setFooter({ text: "Golden Vanguard Test System" });

  if (feature) {
    embed.setDescription(`Feature tested: **${feature}**`);
  }

  return embed;
}

function buildDetailEmbed(feature, results) {
  const lines = results.map(
    (item) => `${item.ok ? "✅" : "❌"} ${item.name} — ${item.details}`
  );

  return new EmbedBuilder()
    .setColor(results.some((r) => !r.ok) ? 0xe67e22 : 0x2ecc71)
    .setTitle(`Test Results — ${feature}`)
    .setDescription(lines.join("\n").slice(0, 4000) || "No results.")
    .setTimestamp()
    .setFooter({ text: "Golden Vanguard Test System" });
}

const adminData = new SlashCommandBuilder()
  .setName("test")
  .setDescription("Run system tests for Golden Vanguard bot features.")
  .setDMPermission(false)
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption((o) =>
    o
      .setName("feature")
      .setDescription("Which feature do you want to test?")
      .setRequired(true)
      .addChoices(
        { name: "All", value: "all" },
        { name: "Commands", value: "commands" },
        { name: "Tracker", value: "tracker" },
        { name: "Warboard", value: "warboard" },
        { name: "Ask-to-Play", value: "asktoplay" },
        { name: "Orientation", value: "orientation" },
        { name: "Player Stats", value: "playerstats" },
        { name: "Leaderboard", value: "leaderboard" },
        { name: "Enlistment", value: "enlistment" }
      )
  );

async function executeAdmin(interaction) {
  const feature = interaction.options.getString("feature", true).toLowerCase();

  if (!VALID_FEATURES.includes(feature)) {
    return interaction.reply({
      content: "Invalid feature selected.",
      flags: 64,
    });
  }

  await interaction.deferReply({ flags: 64 });

  if (feature === "all") {
    const resultsByFeature = await runAllTests(interaction.guild);
    const summary = summarise(resultsByFeature);
    const reportText = formatAllResults(resultsByFeature);

    const reportPath = path.join(
      __dirname,
      "..",
      "data",
      `test-report-${interaction.guildId}.md`
    );

    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, reportText, "utf8");

    const file = new AttachmentBuilder(reportPath);

    return interaction.editReply({
      embeds: [buildSummaryEmbed("Full System Test Complete", summary)],
      files: [file],
    });
  }

  const results = await testSystem(interaction.guild, feature);
  const summary = summarise(results);

  const reportText = formatSingleFeatureResults(feature, results);
  const reportPath = path.join(
    __dirname,
    "..",
    "data",
    `test-${feature}-${interaction.guildId}.md`
  );

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, reportText, "utf8");

  const file = new AttachmentBuilder(reportPath);

  return interaction.editReply({
    embeds: [
      buildSummaryEmbed("Feature Test Complete", summary, feature),
      buildDetailEmbed(feature, results),
    ],
    files: [file],
  });
}

module.exports = {
  adminData,
  executeAdmin,
};