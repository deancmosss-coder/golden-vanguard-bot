// =========================
// commands/medals.js
// FULL NEW FILE
// =========================

const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { getUserMedals } = require("../services/medalService");

function groupByCategory(medals) {
  const out = {};
  for (const medal of medals) {
    const category = medal.category || "other";
    if (!out[category]) out[category] = [];
    out[category].push(medal);
  }
  return out;
}

function rarityIcon(rarity) {
  const r = String(rarity || "").toLowerCase();
  if (r === "legendary") return "🟨";
  if (r === "rare") return "🟦";
  return "⬜";
}

function categoryTitle(category) {
  const map = {
    operations: "🎖 Operations",
    verification: "📎 Verification",
    enemy: "👾 Enemy Fronts",
    combat: "⚔ Combat",
    success: "🏆 Success",
    service: "🛡 Service",
    division: "🪖 Division",
    planet: "🪐 Planet Service",
    difficulty: "🎯 Difficulty",
    other: "📁 Other",
  };

  return map[category] || "📁 Other";
}

function buildCategoryValue(medals) {
  if (!medals.length) return "_None unlocked yet._";

  return medals
    .sort((a, b) => {
      const ad = new Date(a.awardedAt || 0).getTime();
      const bd = new Date(b.awardedAt || 0).getTime();
      return bd - ad;
    })
    .slice(0, 10)
    .map((m) => {
      const icon = rarityIcon(m.rarity);
      return `${icon} **${m.name}** — ${m.description}`;
    })
    .join("\n");
}

const data = new SlashCommandBuilder()
  .setName("medals")
  .setDescription("View unlocked Vanguard medals and achievements.")
  .addUserOption((o) =>
    o
      .setName("user")
      .setDescription("Check another diver's medals")
      .setRequired(false)
  );

async function execute(interaction) {
  try {
    const targetUser = interaction.options.getUser("user") || interaction.user;
    const medals = getUserMedals(targetUser.id);

    if (!medals.length) {
      return interaction.reply({
        content: `No medals unlocked for **${targetUser.username}** yet.`,
        ephemeral: true,
      });
    }

    const grouped = groupByCategory(medals);
    const categories = Object.keys(grouped);

    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle(`🏅 Vanguard Medals — ${targetUser.username}`)
      .setDescription(
        [
          `Diver: <@${targetUser.id}>`,
          `Unlocked Medals: **${medals.length}**`,
          "",
          "Rarity:",
          "⬜ Common",
          "🟦 Rare",
          "🟨 Legendary",
        ].join("\n")
      )
      .setFooter({ text: "The Golden Vanguard" })
      .setTimestamp();

    for (const category of categories.slice(0, 10)) {
      embed.addFields({
        name: categoryTitle(category),
        value: buildCategoryValue(grouped[category]),
        inline: false,
      });
    }

    return interaction.reply({ embeds: [embed] });
  } catch (err) {
    console.error("[MEDALS] execute failed:", err);
    return interaction.reply({
      content: "Medal lookup failed.",
      ephemeral: true,
    }).catch(() => {});
  }
}

module.exports = {
  data,
  execute,
};