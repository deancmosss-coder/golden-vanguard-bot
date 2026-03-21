// =========================
// commands/medaladmin.js
// FULL NEW FILE
// Admin tools for medal rebuild / inspection
// =========================

const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const medalService = require("../services/medalService");

function chunkLines(lines, maxLen = 1800) {
  const chunks = [];
  let current = "";

  for (const line of lines) {
    if ((current + "\n" + line).length > maxLen) {
      if (current) chunks.push(current);
      current = line;
    } else {
      current = current ? `${current}\n${line}` : line;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

const data = new SlashCommandBuilder()
  .setName("medaladmin")
  .setDescription("Admin tools for Vanguard medals.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

  .addSubcommand((s) =>
    s
      .setName("rebuild")
      .setDescription("Rebuild medals for every tracked player.")
  )

  .addSubcommand((s) =>
    s
      .setName("check")
      .setDescription("Re-evaluate medals for a specific player.")
      .addUserOption((o) =>
        o
          .setName("user")
          .setDescription("Player to check")
          .setRequired(true)
      )
  )

  .addSubcommand((s) =>
    s
      .setName("view")
      .setDescription("View medal IDs unlocked by a specific player.")
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

      const summary = medalService.rebuildAllMedals();
      const totalUsers = summary.length;
      const gained = summary.filter((x) => Number(x.newCount || 0) > 0);

      const lines = [
        `✅ Medal rebuild complete.`,
        `Tracked players checked: **${totalUsers}**`,
        `Players with new medals: **${gained.length}**`,
        "",
      ];

      if (gained.length) {
        lines.push("**New unlocks**");
        for (const row of gained.slice(0, 50)) {
          lines.push(`<@${row.userId}> — **${row.newCount}** new (${row.medals.join(", ")})`);
        }

        if (gained.length > 50) {
          lines.push(`...and **${gained.length - 50}** more`);
        }
      } else {
        lines.push("_No new medals unlocked during rebuild._");
      }

      const chunks = chunkLines(lines);
      await interaction.editReply(chunks[0]);

      for (let i = 1; i < chunks.length; i++) {
        await interaction.followUp({ content: chunks[i], ephemeral: true }).catch(() => {});
      }

      return;
    }

    if (sub === "check") {
      const user = interaction.options.getUser("user", true);
      const unlocked = medalService.evaluateAndStore(user.id);

      if (!unlocked.length) {
        return interaction.reply({
          content: `No new medals unlocked for **${user.username}**.`,
          ephemeral: true,
        });
      }

      return interaction.reply({
        content: [
          `✅ Re-evaluated medals for **${user.username}**.`,
          "",
          "**New medals unlocked**",
          ...unlocked.map((m) => `🏅 **${m.name}** — ${m.description}`),
        ].join("\n"),
        ephemeral: true,
      });
    }

    if (sub === "view") {
      const user = interaction.options.getUser("user", true);
      const medals = medalService.getUserMedals(user.id);

      if (!medals.length) {
        return interaction.reply({
          content: `No medals found for **${user.username}**.`,
          ephemeral: true,
        });
      }

      const lines = [
        `🏅 **${user.username}** — Medal Record`,
        `Unlocked: **${medals.length}**`,
        "",
        ...medals.map((m) => `• \`${m.id}\` — **${m.name}** [${m.rarity}]`),
      ];

      const chunks = chunkLines(lines);
      await interaction.reply({ content: chunks[0], ephemeral: true });

      for (let i = 1; i < chunks.length; i++) {
        await interaction.followUp({ content: chunks[i], ephemeral: true }).catch(() => {});
      }

      return;
    }

    return interaction.reply({
      content: "Unknown subcommand.",
      ephemeral: true,
    });
  } catch (err) {
    console.error("[MEDALADMIN] execute failed:", err);

    if (interaction.deferred || interaction.replied) {
      return interaction.editReply("Medal admin command failed.").catch(() => {});
    }

    return interaction.reply({
      content: "Medal admin command failed.",
      ephemeral: true,
    }).catch(() => {});
  }
}

module.exports = {
  data,
  execute,
};