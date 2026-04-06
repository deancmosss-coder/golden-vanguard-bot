// =========================
// commands/run.js
// FULL REPLACEMENT
// Added success tracking fix
// =========================

const fs = require("fs");
const path = require("path");

const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");

const { updateOperationsBoard } = require("../services/operationsBoard");
const orientationSystem = require("../services/orientationSystem");
const playerStats = require("../services/playerStats");
const medalService = require("../services/medalService");
const registry = require("../services/featureRegistry");

const STORE_PATH = path.join(__dirname, "..", "tracker_store.json");
const MISSIONS_PATH = path.join(__dirname, "..", "missions.json");
const WAR_CACHE_PATH = path.join(__dirname, "..", "data", "war_cache.json");

const AAR_NAME = (process.env.AAR_CHANNEL_NAME || "after-action-reports").trim();
const LB_NAME = (process.env.LB_CHANNEL_NAME || "leaderboards").trim();
const TRACKER_TZ = process.env.TRACKER_TIMEZONE || "Europe/London";

const DIVISION_ROLES = [
  { name: "Eclipse Vanguard", id: (process.env.ECLIPSE_VANGUARD_ROLE_ID || "").trim() },
  { name: "Purifier Corps", id: (process.env.PURIFIER_CORPS_ROLE_ID || "").trim() },
  { name: "Bastion Guard", id: (process.env.BASTION_GUARD_ROLE_ID || "").trim() },
  { name: "Orbital Directive", id: (process.env.ORBITAL_DIRECTIVE_ROLE_ID || "").trim() },
].filter((r) => r.id);

const ENEMIES = ["Terminids", "Automatons", "Illuminate"];
const NA_VALUE = "N/A";

const PROOF_REQUIRED_IMAGES = 2;
const PROOF_WINDOW_MINUTES = 30;
const EDIT_DELETE_WINDOW_MINUTES = 10;

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
  try {
    fs.writeFileSync(
      MISSIONS_PATH,
      JSON.stringify({ missions: uniqueSortedMissions(missions) }, null, 2),
      "utf8"
    );
  } catch (err) {
    console.error("[TRACKER] writeMissionList failed:", err);
  }
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
    console.error("[TRACKER] readMissionList failed:", err);
    return [...DEFAULT_MISSIONS];
  }
}

function ensureMissionExists(missionName) {
  const clean = normaliseMissionName(missionName);
  if (!clean) return;

  const missions = readMissionList();
  const exists = missions.some((m) => m.toLowerCase() === clean.toLowerCase());

  if (!exists) {
    missions.push(clean);
    writeMissionList(missions);
    console.log(`[TRACKER] Added new mission type automatically: ${clean}`);
  }
}

function readWarCache() {
  try {
    if (!fs.existsSync(WAR_CACHE_PATH)) return {};
    return JSON.parse(fs.readFileSync(WAR_CACHE_PATH, "utf8"));
  } catch {
    return {};
  }
}

function getPlanetNamesFromWarCache() {
  const warCache = readWarCache();
  const names = new Set();

  if (Array.isArray(warCache?.campaign)) {
    for (const p of warCache.campaign) {
      if (p?.name) names.add(String(p.name));
      if (p?.planet?.name) names.add(String(p.planet.name));
    }
  }

  if (warCache?.planets && typeof warCache.planets === "object" && !Array.isArray(warCache.planets)) {
    for (const value of Object.values(warCache.planets)) {
      if (value?.name) names.add(String(value.name));
    }
  }

  if (Array.isArray(warCache?.status)) {
    for (const p of warCache.status) {
      if (p?.name) names.add(String(p.name));
      if (p?.planet?.name) names.add(String(p.planet.name));
    }
  }

  if (Array.isArray(warCache?.status?.planetStatus)) {
    for (const p of warCache.status.planetStatus) {
      if (p?.name) names.add(String(p.name));
      if (p?.planet?.name) names.add(String(p.planet.name));
    }
  }

  if (Array.isArray(warCache?.info)) {
    for (const p of warCache.info) {
      if (p?.name) names.add(String(p.name));
    }
  }

  if (warCache?.info && typeof warCache.info === "object" && !Array.isArray(warCache.info)) {
    for (const value of Object.values(warCache.info)) {
      if (value?.name) names.add(String(value.name));
      if (Array.isArray(value)) {
        for (const p of value) {
          if (p?.name) names.add(String(p.name));
        }
      }
    }
  }

  return [...names]
    .filter((name) => typeof name === "string" && name.trim().length > 0)