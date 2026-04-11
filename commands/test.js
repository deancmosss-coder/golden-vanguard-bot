// =========================
// commands/test.js
// FIXED VERSION (interaction-safe)
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
  return new EmbedBuilder()
    .setColor(summary.failed > 0 ? 0xe67e22 : 0x2ecc71)
    .setTitle(title)
    .addFields(
      { name: "Passed", value: String(summary.passed), inline: true },
      { name: "Failed", value: String(summary.failed), inline: true },
      { name: "Total", value: String(summary.total), inline: true }
    )
    .setTimestamp()
    .setFooter({ text: "Golden Vanguard Test System" });
}

function buildDetailEmbed(feature, results) {
  const lines = results.map(
    (item) => `${item.ok ? "✅" : "❌"} ${item.name} — ${item.details}`
  );

  return new EmbedBuilder()
    .setColor(results.some((r) => !r.ok) ? 0xe67e22 : 0x2ecc71)
    .setTitle(`Test Results — ${feature}`)
    .setDescription(lines.join("\n").slice(0, 4000))
    .setTimestamp();
}

const adminData = new SlashCommandBuilder()
  .setName("test")
  .setDescription("Run system tests")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption((o) =>
    o
      .setName("feature")
      .setDescription("Feature to test")
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
      content: "Invalid feature.",
      flags: 64,
    });
  }

  // 🔥 CRITICAL FIX → reply immediately (NOT defer)
  await interaction.reply({
    content: "🧪 Running tests...",
    flags: 64,
  });

  try {
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
        content: "",
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
      content: "",
      embeds: [
        buildSummaryEmbed("Feature Test Complete", summary),
        buildDetailEmbed(feature, results),
      ],
      files: [file],
    });
  } catch (err) {
    console.error("TEST COMMAND ERROR:", err);

    return interaction.editReply({
      content: "❌ Test failed unexpectedly. Check logs.",
    });
  }
}

module.exports = {
  adminData,
  executeAdmin,
};