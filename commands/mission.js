// =========================
// commands/mission.js
// =========================

const fs = require("fs");
const path = require("path");
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require("discord.js");

const MISSIONS_PATH = path.join(__dirname, "..", "missions.json");

function readMissions() {
  try {
    if (!fs.existsSync(MISSIONS_PATH)) return { missions: ["Other"] };
    const parsed = JSON.parse(fs.readFileSync(MISSIONS_PATH, "utf8"));
    return {
      missions: Array.isArray(parsed.missions) && parsed.missions.length ? parsed.missions : ["Other"],
    };
  } catch {
    return { missions: ["Other"] };
  }
}

function writeMissions(data) {
  fs.writeFileSync(MISSIONS_PATH, JSON.stringify(data, null, 2), "utf8");
}

const data = new SlashCommandBuilder()
  .setName("mission")
  .setDescription("Manage tracker mission types.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

  .addSubcommand((s) =>
    s
      .setName("add")
      .setDescription("Add a mission type")
      .addStringOption((o) =>
        o.setName("name").setDescription("Mission name to add").setRequired(true)
      )
  )

  .addSubcommand((s) =>
    s
      .setName("remove")
      .setDescription("Remove a mission type")
      .addStringOption((o) =>
        o
          .setName("name")
          .setDescription("Mission name to remove")
          .setRequired(true)
          .setAutocomplete(true)
      )
  )

  .addSubcommand((s) =>
    s.setName("list").setDescription("List all mission types")
  );

async function autocomplete(interaction) {
  const focused = interaction.options.getFocused(true);
  if (focused.name !== "name") return interaction.respond([]);

  const missions = readMissions().missions;
  const q = String(focused.value || "").toLowerCase();

  return interaction.respond(
    missions
      .filter((m) => m.toLowerCase().includes(q))
      .slice(0, 25)
      .map((m) => ({ name: m, value: m }))
  );
}

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const data = readMissions();

  if (sub === "list") {
    return interaction.reply({
      content:
        data.missions.length
          ? `**Mission Types**\n${data.missions.map((m, i) => `${i + 1}. ${m}`).join("\n")}`
          : "No mission types found.",
      ephemeral: true,
    });
  }

  if (sub === "add") {
    const name = interaction.options.getString("name", true).trim();
    if (!name) return interaction.reply({ content: "Mission name cannot be empty.", ephemeral: true });

    const exists = data.missions.some((m) => m.toLowerCase() === name.toLowerCase());
    if (exists) return interaction.reply({ content: `Mission already exists: **${name}**`, ephemeral: true });

    data.missions.push(name);
    data.missions.sort((a, b) => a.localeCompare(b));
    writeMissions(data);

    return interaction.reply({
      content: `✅ Mission added: **${name}**\nIt will appear in /run mission autocomplete immediately.`,
      ephemeral: true,
    });
  }

  if (sub === "remove") {
    const name = interaction.options.getString("name", true).trim();
    const before = data.missions.length;
    data.missions = data.missions.filter((m) => m.toLowerCase() !== name.toLowerCase());

    if (data.missions.length === before) {
      return interaction.reply({ content: `Mission not found: **${name}**`, ephemeral: true });
    }

    if (!data.missions.length) data.missions = ["Other"];
    writeMissions(data);

    return interaction.reply({
      content: `🗑 Mission removed: **${name}**`,
      ephemeral: true,
    });
  }
}

module.exports = {
  data,
  execute,
  autocomplete,
};