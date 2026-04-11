// =========================
// commands/test.js
// MOBILE FRIENDLY VERSION
// =========================

const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} = require("discord.js");

const {
  runAllTests,
  testSystem,
  summarise,
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

function buildEmbed(title, results, summary) {
  const failed = results.filter((r) => !r.ok);
  const passed = results.filter((r) => r.ok);

  const embed = new EmbedBuilder()
    .setColor(summary.failed > 0 ? 0xe67e22 : 0x2ecc71)
    .setTitle(title)
    .addFields(
      { name: "Passed", value: String(summary.passed), inline: true },
      { name: "Failed", value: String(summary.failed), inline: true },
      { name: "Total", value: String(summary.total), inline: true }
    )
    .setTimestamp();

  // 🔴 Show ONLY failures (clean)
  if (failed.length > 0) {
    embed.addFields({
      name: "❌ Issues Found",
      value: failed
        .map((f) => `• **${f.name}** → ${f.details}`)
        .join("\n")
        .slice(0, 1024),
    });
  } else {
    embed.setDescription("✅ No issues found.");
  }

  return embed;
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

  await interaction.reply({
    content: "🧪 Running tests...",
    flags: 64,
  });

  try {
    if (feature === "all") {
      const resultsByFeature = await runAllTests(interaction.guild);

      const allResults = Object.values(resultsByFeature).flat();
      const summary = summarise(resultsByFeature);

      return interaction.editReply({
        content: "",
        embeds: [buildEmbed("Full System Test", allResults, summary)],
      });
    }

    const results = await testSystem(interaction.guild, feature);
    const summary = summarise(results);

    return interaction.editReply({
      content: "",
      embeds: [buildEmbed(`Test — ${feature}`, results, summary)],
    });
  } catch (err) {
    console.error(err);

    return interaction.editReply({
      content: "❌ Test failed unexpectedly.",
    });
  }
}

module.exports = {
  adminData,
  executeAdmin,
};