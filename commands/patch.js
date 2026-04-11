// =========================
// commands/patch.js
// MANUAL PATCH NOTES COMMAND
// =========================

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require("discord.js");
const patchNotes = require("../services/patchNotesService");

function buildPendingEmbed(pending, version) {
  const lines = [`📦 **Next Patch Version:** v${version}`, ""];

  if (pending.new.length) {
    lines.push("✨ **NEW FEATURES**");
    lines.push(...pending.new.map((f) => `• ${f}`));
    lines.push("");
  }

  if (pending.updates.length) {
    lines.push("⚙️ **UPDATES**");
    lines.push(...pending.updates.map((f) => `• ${f}`));
    lines.push("");
  }

  if (pending.rollbacks.length) {
    lines.push("⚠️ **ROLLBACKS**");
    lines.push(...pending.rollbacks.map((f) => `• ${f}`));
    lines.push("");
  }

  if (!pending.new.length && !pending.updates.length && !pending.rollbacks.length) {
    lines.push("No pending patch note items.");
  }

  return new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle("Patch Notes Queue")
    .setDescription(lines.join("\n"))
    .setFooter({ text: "Golden Vanguard Patch Notes" })
    .setTimestamp();
}

function buildHistoryEmbed(history) {
  const lines = history.length
    ? history.map((item) => {
        const section = [
          `**v${item.version}** — <t:${Math.floor(new Date(item.createdAt).getTime() / 1000)}:R>`,
        ];

        if (Array.isArray(item.new) && item.new.length) {
          section.push(`New: ${item.new.join(", ")}`);
        }

        if (Array.isArray(item.updates) && item.updates.length) {
          section.push(`Updates: ${item.updates.join(", ")}`);
        }

        if (Array.isArray(item.rollbacks) && item.rollbacks.length) {
          section.push(`Rollbacks: ${item.rollbacks.join(", ")}`);
        }

        return section.join("\n");
      }).join("\n\n")
    : "No patch releases recorded yet.";

  return new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle("Patch Notes History")
    .setDescription(lines.slice(0, 4096))
    .setFooter({ text: "Golden Vanguard Patch Notes" })
    .setTimestamp();
}

const adminData = new SlashCommandBuilder()
  .setName("patch")
  .setDescription("Patch notes controls")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((sub) =>
    sub.setName("pending").setDescription("View pending patch note items.")
  )
  .addSubcommand((sub) =>
    sub.setName("publish").setDescription("Publish pending patch notes now.")
  )
  .addSubcommand((sub) =>
    sub.setName("history").setDescription("View recent patch note history.")
  )
  .addSubcommand((sub) =>
    sub.setName("clear").setDescription("Clear pending patch note items without publishing.")
  );

async function executeAdmin(interaction) {
  await interaction.deferReply({ flags: 64 });

  try {
    const sub = interaction.options.getSubcommand();

    if (sub === "pending") {
      const state = patchNotes.readState();
      return interaction.editReply({
        embeds: [buildPendingEmbed(state.pending, state.version)],
      });
    }

    if (sub === "publish") {
      const result = await patchNotes.publishPatch(
        interaction.client,
        process.env.BOT_RELEASE_CHANNEL_ID
      );

      if (!result) {
        return interaction.editReply("No pending changes to publish.");
      }

      return interaction.editReply("✅ Patch notes published.");
    }

    if (sub === "history") {
      const history = patchNotes.getReleaseHistory(10);
      return interaction.editReply({
        embeds: [buildHistoryEmbed(history)],
      });
    }

    if (sub === "clear") {
      patchNotes.clearPending();
      return interaction.editReply("✅ Pending patch note items cleared.");
    }

    return interaction.editReply("Unknown patch action.");
  } catch (err) {
    console.error("[PATCH COMMAND ERROR]", err);
    return interaction.editReply(`❌ Patch command failed: ${err.message}`);
  }
}

module.exports = {
  adminData,
  executeAdmin,
};