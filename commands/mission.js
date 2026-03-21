// =========================
// commands/mission.js
// FULL REPLACEMENT
// =========================

const fs = require("fs");
const path = require("path");
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require("discord.js");

const MISSIONS_PATH = path.join(__dirname, "..", "missions.json");

const DEFAULT_MISSIONS = [
  "Blitz",
  "Commando Operation",
  "Defend Area",
  "Destroy Command Bunkers",
  "Destroy Eggs",
  "Eradicate",
  "Escort Civilians",
  "Evacuate Civilians",
  "Geological Survey",
  "ICBM Launch",
  "Raise the Flag",
  "Retrieve Valuable Data",
  "Upload Data",
  "Seize Industrial Complex",
  "Sabotage Supply Bases",
  "Commando: Extract Intel",
  "Confiscate Assets",
  "Eliminate Devastators",
  "Commando: Acquire Evidence",
  "Commando: Secure Black Box",
  "Annex Untapped Mineral Sites",
  "Sabotage Orgo-Plasma Synthesis",
  "Destroy Transmission Network",
  "Eradicate Automaton Forces",
  "Sabotage Air Base",
  "Rapid Acquisition",
  "Blitz: Destroy Bio-Processors",
  "Halt Cyborg Production",
  "Other",
];

function normaliseMissionName(name) {
  return String(name || "").trim();
}

function uniqueSortedMissions(list) {
  const seen = new Map();

  for (const item of list) {
    const clean = normaliseMissionName(item);
    if (!clean) continue;

    const key = clean.toLowerCase();
    if (!seen.has(key)) seen.set(key, clean);
  }

  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

function writeMissionList(missions) {
  const finalList = uniqueSortedMissions(missions);
  fs.writeFileSync(
    MISSIONS_PATH,
    JSON.stringify({ missions: finalList }, null, 2),
    "utf8"
  );
}

function readMissionList() {
  try {
    let fileMissions = [];

    if (fs.existsSync(MISSIONS_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(MISSIONS_PATH, "utf8"));
      if (Array.isArray(parsed?.missions)) {
        fileMissions = parsed.missions;
      }
    }

    const merged = uniqueSortedMissions([...DEFAULT_MISSIONS, ...fileMissions]);

    if (!fs.existsSync(MISSIONS_PATH) || merged.length !== fileMissions.length) {
      writeMissionList(merged);
    }

    return merged.length ? merged : ["Other"];
  } catch (err) {
    console.error("[MISSION] readMissionList failed:", err);
    return [...DEFAULT_MISSIONS];
  }
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
  try {
    const focused = interaction.options.getFocused(true);
    if (focused.name !== "name") return interaction.respond([]);

    const missions = readMissionList();
    const q = String(focused.value || "").toLowerCase();

    return interaction.respond(
      missions
        .filter((m) => m.toLowerCase().includes(q))
        .slice(0, 25)
        .map((m) => ({ name: m, value: m }))
    );
  } catch (err) {
    console.error("[MISSION] autocomplete failed:", err);
    try {
      return interaction.respond([]);
    } catch {}
  }
}

async function execute(interaction) {
  try {
    const sub = interaction.options.getSubcommand();
    const missions = readMissionList();

    if (sub === "list") {
      return interaction.reply({
        content: missions.length
          ? `**Mission Types**\n${missions.map((m, i) => `${i + 1}. ${m}`).join("\n")}`
          : "No mission types found.",
        ephemeral: true,
      });
    }

    if (sub === "add") {
      const name = normaliseMissionName(interaction.options.getString("name", true));

      if (!name) {
        return interaction.reply({
          content: "Mission name cannot be empty.",
          ephemeral: true,
        });
      }

      const exists = missions.some((m) => m.toLowerCase() === name.toLowerCase());

      if (exists) {
        return interaction.reply({
          content: `Mission already exists: **${name}**`,
          ephemeral: true,
        });
      }

      missions.push(name);
      writeMissionList(missions);

      return interaction.reply({
        content: `✅ Mission added: **${name}**`,
        ephemeral: true,
      });
    }

    if (sub === "remove") {
      const name = normaliseMissionName(interaction.options.getString("name", true));

      if (!name) {
        return interaction.reply({
          content: "Mission name cannot be empty.",
          ephemeral: true,
        });
      }

      const filtered = missions.filter((m) => m.toLowerCase() !== name.toLowerCase());

      if (filtered.length === missions.length) {
        return interaction.reply({
          content: `Mission not found: **${name}**`,
          ephemeral: true,
        });
      }

      const finalList = filtered.length ? filtered : ["Other"];
      writeMissionList(finalList);

      return interaction.reply({
        content: `🗑 Mission removed: **${name}**`,
        ephemeral: true,
      });
    }

    return interaction.reply({
      content: "Unknown subcommand.",
      ephemeral: true,
    });
  } catch (err) {
    console.error("[MISSION] execute failed:", err);
    return interaction.reply({
      content: "Mission command failed.",
      ephemeral: true,
    }).catch(() => {});
  }
}

module.exports = {
  data,
  execute,
  autocomplete,
};