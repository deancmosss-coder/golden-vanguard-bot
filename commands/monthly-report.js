const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "..", "data", "tracker.json");

function readStore() {
  if (!fs.existsSync(DATA_FILE)) return null;
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("monthly-report")
    .setDescription("Show weekly winners for a month (Hall of Fame).")
    .addStringOption((o) =>
      o
        .setName("month")
        .setDescription("Month YYYY-MM (e.g. 2026-03). Leave blank = current month.")
        .setRequired(false)
    ),

  async execute(interaction) {
    const store = readStore();
    if (!store) return interaction.reply({ content: "No tracker data yet.", ephemeral: true });

    const month =
      interaction.options.getString("month") ||
      new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit" })
        .format(new Date())
        .replace("-", "-");

    const weeks = (store.history?.weeks || []).filter((w) => w.monthKey === month);

    if (!weeks.length) {
      return interaction.reply({ content: `No weekly winners recorded for **${month}** yet.`, ephemeral: true });
    }

    const lines = weeks
      .map((w, i) => {
        const diver = w.topPlayerId ? `<@${w.topPlayerId}>` : "—";
        const faction = w.topFactionName || "—";
        return `**Week ${i + 1}** (${w.weekLabel})\n🏆 Diver: ${diver} — **${w.topPlayerPoints}**\n🛡 Faction: **${faction}** — **${w.topFactionPoints}**`;
      })
      .join("\n\n");

    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle(`📅 Monthly Report — ${month}`)
      .setDescription(lines)
      .setFooter({ text: "The Golden Vanguard" })
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  },
};