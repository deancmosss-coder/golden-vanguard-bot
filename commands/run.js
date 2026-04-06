// =========================
// commands/run.js
// FULL REPLACEMENT
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
    .sort((a, b) => a.localeCompare(b))
    .slice(0, 25);
}

function currentMonthKey(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TRACKER_TZ,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(d);

  const y = parts.find((p) => p.type === "year").value;
  const m = parts.find((p) => p.type === "month").value;
  return `${y}-${m}`;
}

function defaultStore() {
  return {
    leaderboardMessage: {},
    weekly: { players: {}, divisions: {}, enemies: {} },
    monthly: { monthKey: currentMonthKey(), players: {}, divisions: {}, enemies: {} },
    users: {},
    runs: [],
    proofSessions: {},
    history: { weeks: [] },
    planets: {},
  };
}

function readStore() {
  try {
    if (!fs.existsSync(STORE_PATH)) return defaultStore();
    const raw = fs.readFileSync(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    const base = defaultStore();

    return {
      ...base,
      ...parsed,
      leaderboardMessage: parsed.leaderboardMessage || base.leaderboardMessage,
      weekly: parsed.weekly || base.weekly,
      monthly: parsed.monthly || base.monthly,
      users: parsed.users || base.users,
      runs: Array.isArray(parsed.runs) ? parsed.runs : [],
      proofSessions: parsed.proofSessions || base.proofSessions,
      history: parsed.history || base.history,
      planets: parsed.planets || base.planets,
    };
  } catch (e) {
    console.error("[TRACKER] readStore failed:", e);
    return defaultStore();
  }
}

function writeStore(store) {
  try {
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
  } catch (e) {
    console.error("[TRACKER] writeStore failed:", e);
  }
}

function clamp(n, min, max) {
  const x = Number(n);
  if (Number.isNaN(x)) return min;
  return Math.max(min, Math.min(max, x));
}

function isNA(v) {
  return v === NA_VALUE || v === "na" || v === "NA";
}

function getDivisionNameForMember(member) {
  for (const d of DIVISION_ROLES) {
    if (member.roles.cache.has(d.id)) return d.name;
  }
  return "Unassigned";
}

function nextRunId(store) {
  const n = (store.runs?.length || 0) + 1;
  return `GV-${String(n).padStart(5, "0")}`;
}

function findTextChannelByName(guild, name) {
  const lower = name.toLowerCase();
  return guild.channels.cache.find((c) => c.isTextBased?.() && c.name?.toLowerCase() === lower);
}

function ensureCurrentMonth(store) {
  const key = currentMonthKey();
  if (!store.monthly?.monthKey || store.monthly.monthKey !== key) {
    store.monthly = { monthKey: key, players: {}, divisions: {}, enemies: {} };
  }
}

function addScore(store, userId, divisionName, enemy, delta) {
  if (!delta) return;

  ensureCurrentMonth(store);

  store.weekly.players[userId] = (store.weekly.players[userId] || 0) + delta;
  store.weekly.divisions[divisionName] = (store.weekly.divisions[divisionName] || 0) + delta;
  store.weekly.enemies[enemy] = (store.weekly.enemies[enemy] || 0) + delta;

  store.monthly.players[userId] = (store.monthly.players[userId] || 0) + delta;
  store.monthly.divisions[divisionName] = (store.monthly.divisions[divisionName] || 0) + delta;
  store.monthly.enemies[enemy] = (store.monthly.enemies[enemy] || 0) + delta;
}

function subtractScore(store, userId, divisionName, enemy, delta) {
  addScore(store, userId, divisionName, enemy, -delta);
}

function ensurePlanetStats(store, planetName) {
  if (!planetName) return;
  store.planets = store.planets || {};
  store.planets[planetName] = store.planets[planetName] || {
    missions: 0,
    score: 0,
    proofRuns: 0,
    lastUpdated: null,
  };
}

function addPlanetContribution(store, planetName, scoreDelta, missionDelta = 0, proofDelta = 0) {
  if (!planetName) return;
  ensurePlanetStats(store, planetName);

  store.planets[planetName].missions += missionDelta;
  store.planets[planetName].score += scoreDelta;
  store.planets[planetName].proofRuns += proofDelta;
  store.planets[planetName].lastUpdated = new Date().toISOString();

  if (store.planets[planetName].missions < 0) store.planets[planetName].missions = 0;
  if (store.planets[planetName].score < 0) store.planets[planetName].score = 0;
  if (store.planets[planetName].proofRuns < 0) store.planets[planetName].proofRuns = 0;
}

function calcBasePoints({
  enemy,
  difficulty,
  mainObjective,
  missionRating,
  sideMissed,
  outpostsMissed,
  diversMissing,
  kills,
  deaths,
  accidentals,
  fortressDestroyed,
  hviExtracted,
}) {
  const diff = clamp(difficulty, 1, 10);
  const rating = clamp(missionRating, 1, 5);

  const missSide = isNA(sideMissed) ? 0 : clamp(sideMissed, 0, 5);
  const missOut = isNA(outpostsMissed) ? 0 : clamp(outpostsMissed, 0, 5);
  const missDivers = clamp(diversMissing, 0, 4);

  const k = clamp(kills, 0, 9999);
  const d = clamp(deaths, 0, 9999);
  const a = clamp(accidentals, 0, 9999);

  let score = rating * 70;

  if (mainObjective === "Yes") score += 120;
  else score -= 150;

  const diffMult = 1 + Math.pow((diff - 1) / 9, 1.35) * 0.7;

  score += Math.round(Math.sqrt(k) * 6);

  score -= missSide * 25;
  score -= missOut * 35;
  score -= missDivers * 60;
  score -= d * 4;
  score -= a * 18;

  if (diff === 10 && enemy !== "Illuminate") {
    if (fortressDestroyed === "Yes") score += 90;
    else if (fortressDestroyed === "No") score -= 45;

    if (hviExtracted === "Yes") score += 45;
    else if (hviExtracted === "No") score -= 25;
  }

  score = Math.round(score * diffMult);
  return Math.max(0, score);
}

function topN(obj, n) {
  const arr = Object.entries(obj || {}).map(([k, v]) => [k, Number(v || 0)]);
  arr.sort((a, b) => b[1] - a[1]);
  return arr.slice(0, n);
}

function buildLeaderboardEmbed(guild, store) {
  const playersTop = topN(store.weekly.players, 10);
  const divisionsTop = topN(store.weekly.divisions, 10);
  const enemiesTop = topN(store.weekly.enemies, 10);

  const playerLines =
    playersTop.length === 0
      ? "_No runs logged yet._"
      : playersTop.map(([id, pts], i) => `${i + 1}. <@${id}> — **${pts}**`).join("\n");

  const divisionLines =
    divisionsTop.length === 0
      ? "_No division points yet._"
      : divisionsTop.map(([name, pts], i) => `${i + 1}. **${name}** — **${pts}**`).join("\n");

  const enemyLines =
    enemiesTop.length === 0
      ? "_No enemy stats yet._"
      : enemiesTop.map(([name, pts], i) => `${i + 1}. **${name}** — **${pts}**`).join("\n");

  return new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle("🏆 Weekly Deployment Leaderboards")
    .setDescription(
      [
        `Log runs in **#${AAR_NAME}** using **/run**.`,
        `📎 Upload **Mission Report + Player Stats** for **x2** proof bonus.`,
        `After **5** unverified runs in a row, proof becomes **required**.`,
        "",
        "**Top Divers**",
        playerLines,
        "",
        "**Top Divisions**",
        divisionLines,
        "",
        "**Enemy Fronts**",
        enemyLines,
        "",
        "Reset: **Monday 00:00 (UK)** • Results: **Sunday 23:00 (UK)**",
      ].join("\n")
    )
    .setFooter({ text: "The Golden Vanguard" })
    .setTimestamp();
}

async function ensureLeaderboardMessage(guild, store) {
  const lbChannel = findTextChannelByName(guild, LB_NAME);
  if (!lbChannel) throw new Error(`Leaderboard channel "#${LB_NAME}" not found`);

  const saved = store.leaderboardMessage[guild.id];

  if (saved?.channelId && saved?.messageId) {
    const ch = await guild.channels.fetch(saved.channelId).catch(() => null);
    if (ch?.isTextBased?.()) {
      const msg = await ch.messages.fetch(saved.messageId).catch(() => null);
      if (msg) {
        await msg.edit({ embeds: [buildLeaderboardEmbed(guild, store)] });
        return msg;
      }
    }
  }

  const msg = await lbChannel.send({ embeds: [buildLeaderboardEmbed(guild, store)] });
  await msg.pin().catch(() => {});
  store.leaderboardMessage[guild.id] = { channelId: lbChannel.id, messageId: msg.id };
  writeStore(store);
  return msg;
}

async function updateLeaderboard(guild) {
  const store = readStore();
  await ensureLeaderboardMessage(guild, store);
}

function starsDisplay(n) {
  return "★".repeat(n) + "☆".repeat(5 - n);
}

function getRunStatusText(run) {
  if (run.status === "proof_applied") return "Proof Applied";
  if (run.status === "submitted_without_proof") return "Submitted Without Proof";
  if (run.status === "proof_expired") return "Proof Expired";
  if (run.status === "deleted") return "Deleted";
  return "Awaiting Proof Choice";
}

function controlsState(run, now = Date.now()) {
  if (["proof_applied", "submitted_without_proof", "proof_expired", "deleted"].includes(run.status)) {
    return "none";
  }
  if (now >= run.proofExpireAt) return "none";
  if (now >= run.editExpireAt) return "proof_only";
  return "full";
}

function buildRunButtons(run, now = Date.now()) {
  const state = controlsState(run, now);
  if (state === "none") return [];

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`gv_proof_add:${run.runId}`)
      .setLabel("Add Proof (x2)")
      .setStyle(ButtonStyle.Primary)
  );

  if (!run.requiresProof) {
    row1.addComponents(
      new ButtonBuilder()
        .setCustomId(`gv_proof_skip:${run.runId}`)
        .setLabel("Submit Without Proof")
        .setStyle(ButtonStyle.Secondary)
    );
  }

  if (state === "proof_only") return [row1];

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`gv_edit:${run.runId}`)
      .setLabel("Edit Run")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`gv_delete:${run.runId}`)
      .setLabel("Delete Run")
      .setStyle(ButtonStyle.Danger)
  );

  return [row1, row2];
}

function buildAarEmbed(run) {
  return new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle("📄 After Action Report")
    .setDescription(
      [
        `Run ID: **${run.runId}**`,
        `Diver: <@${run.loggerId}>`,
        `Division: **${run.divisionName}**`,
        "",
        `Planet: **${run.planet}**`,
        `Enemy: **${run.enemy}**`,
        `Mission Type: **${run.missionType}**`,
        `Difficulty: **${run.difficulty}**`,
        `Main Objective Completed: **${run.mainObjective}**`,
        `Mission Rating: **${starsDisplay(run.missionRating)} (${run.missionRating})**`,
        "",
        `Side Objectives Missed: **${run.sideMissed}**`,
        `Outposts Missed: **${run.outpostsMissed}**`,
        `Fortress / Mega Nest Destroyed: **${run.fortressDestroyed}**`,
        `High Value Item Extracted: **${run.hviExtracted}**`,
        "",
        `Divers Missing on Extraction: **${run.diversMissing}**`,
        `Kills: **${run.kills}**`,
        `Deaths: **${run.deaths}**`,
        `Accidentals: **${run.accidentals}**`,
        "",
        `Base Points (you): **${run.basePoints}**`,
        run.proofApplied ? `Proof Bonus: **+${run.basePoints}** (x2 total)` : null,
        `Current Score Awarded: **${run.scoreAwarded}**`,
        run.requiresProof && !run.proofApplied
          ? `🛑 Proof is **required** for this run.`
          : `📎 Proof Bonus (x2): Upload **2 screenshots** — Mission Report + Player Stats.`,
        `Status: **${getRunStatusText(run)}**`,
      ]
        .filter(Boolean)
        .join("\n")
    )
    .setFooter({ text: "The Golden Vanguard" })
    .setTimestamp(new Date(run.createdAt));
}

async function editRunMessage(client, run) {
  const guild = await client.guilds.fetch(run.guildId).catch(() => null);
  if (!guild) return;
  const ch = await guild.channels.fetch(run.aarChannelId).catch(() => null);
  if (!ch?.isTextBased?.()) return;
  const msg = await ch.messages.fetch(run.aarMessageId).catch(() => null);
  if (!msg) return;

  await msg.edit({
    embeds: [buildAarEmbed(run)],
    components: buildRunButtons(run),
  }).catch(() => {});
}

function isEditable(run, userId, now = Date.now()) {
  return run.loggerId === userId && now <= run.editExpireAt && run.status !== "deleted";
}

function isDeletable(run, userId, now = Date.now()) {
  return run.loggerId === userId && now <= run.editExpireAt && run.status !== "deleted";
}

function applyRunScoreChange(store, run, newAwarded) {
  const oldAwarded = Number(run.scoreAwarded || 0);
  const delta = newAwarded - oldAwarded;

  if (delta !== 0) {
    addScore(store, run.loggerId, run.divisionName, run.enemy, delta);
    addPlanetContribution(store, run.planet, delta, 0, 0);
  }

  run.scoreAwarded = newAwarded;

  if (delta !== 0) {
    playerStats.updateRunScore(run, oldAwarded, newAwarded);
  }
}

async function refreshOpsBoardFromCache(client) {
  try {
    const warData = readWarCache();
    if (!warData || Object.keys(warData).length === 0) return;
    await updateOperationsBoard(client, warData);
  } catch (e) {
    console.error("[TRACKER] refreshOpsBoardFromCache failed:", e);
  }
}

function finalizeUnverified(store, run) {
  if (run.status !== "awaiting_proof") return;
  if (run.requiresProof) {
    run.status = "proof_expired";
    run.proofDeclined = false;
    return;
  }
  run.status = "submitted_without_proof";
  run.proofDeclined = true;

  store.users[run.loggerId] = store.users[run.loggerId] || { unverifiedStreak: 0, totalRuns: 0 };
  store.users[run.loggerId].unverifiedStreak += 1;
}

function isImageAttachment(att) {
  const ct = (att.contentType || "").toLowerCase();
  if (ct.startsWith("image/")) return true;
  const url = (att.url || "").toLowerCase();
  return [".png", ".jpg", ".jpeg", ".webp"].some((ext) => url.endsWith(ext));
}

function formatUnlockedMedals(unlocked) {
  if (!Array.isArray(unlocked) || !unlocked.length) return null;
  return unlocked.map((m) => `🏅 **${m.name}**`).join("\n");
}

const data = new SlashCommandBuilder()
  .setName("run")
  .setDescription("Log your mission run (Player Stats) for the Vanguard tracker.")
  .setDMPermission(false)
  .addStringOption((o) =>
    o
      .setName("planet")
      .setDescription("Which planet did you fight on?")
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addStringOption((o) =>
    o
      .setName("enemy")
      .setDescription("Which enemy faction did you fight?")
      .setRequired(true)
      .addChoices(...ENEMIES.map((e) => ({ name: e, value: e })))
  )
  .addIntegerOption((o) =>
    o
      .setName("difficulty")
      .setDescription("Difficulty 1–10")
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(10)
  )
  .addStringOption((o) =>
    o
      .setName("mission_type")
      .setDescription("Mission type")
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addStringOption((o) =>
    o
      .setName("main_objective")
      .setDescription("Was the main mission objective completed?")
      .setRequired(true)
      .addChoices({ name: "Yes", value: "Yes" }, { name: "No", value: "No" })
  )
  .addIntegerOption((o) =>
    o
      .setName("mission_rating")
      .setDescription("Mission Rating (Stars) 1–5")
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(5)
  )
  .addStringOption((o) =>
    o
      .setName("side_missed")
      .setDescription("How many side objectives were missed?")
      .setRequired(true)
      .addChoices(
        { name: "0 (all completed)", value: "0" },
        { name: "1", value: "1" },
        { name: "2", value: "2" },
        { name: "3", value: "3" },
        { name: "4", value: "4" },
        { name: "5", value: "5" },
        { name: "N/A", value: NA_VALUE }
      )
  )
  .addStringOption((o) =>
    o
      .setName("outposts_missed")
      .setDescription("How many outposts were missed?")
      .setRequired(true)
      .addChoices(
        { name: "0 (all destroyed)", value: "0" },
        { name: "1", value: "1" },
        { name: "2", value: "2" },
        { name: "3", value: "3" },
        { name: "4", value: "4" },
        { name: "5", value: "5" },
        { name: "N/A", value: NA_VALUE }
      )
  )
  .addStringOption((o) =>
    o
      .setName("fortress_destroyed")
      .setDescription("D10 only (Bots/Bugs): Fortress/Mega Nest destroyed?")
      .setRequired(true)
      .addChoices(
        { name: "Yes", value: "Yes" },
        { name: "No", value: "No" },
        { name: "N/A", value: NA_VALUE }
      )
  )
  .addStringOption((o) =>
    o
      .setName("hvi_extracted")
      .setDescription("D10 only (Bots/Bugs): High-value item collected & extracted?")
      .setRequired(true)
      .addChoices(
        { name: "Yes", value: "Yes" },
        { name: "No", value: "No" },
        { name: "N/A", value: NA_VALUE }
      )
  )
  .addIntegerOption((o) =>
    o
      .setName("divers_missing")
      .setDescription("Divers missing on extraction (0–4)")
      .setRequired(true)
      .setMinValue(0)
      .setMaxValue(4)
  )
  .addIntegerOption((o) =>
    o
      .setName("kills")
      .setDescription("Your kills (Player Stats)")
      .setRequired(true)
      .setMinValue(0)
      .setMaxValue(9999)
  )
  .addIntegerOption((o) =>
    o
      .setName("deaths")
      .setDescription("Your deaths (Player Stats)")
      .setRequired(true)
      .setMinValue(0)
      .setMaxValue(9999)
  )
  .addIntegerOption((o) =>
    o
      .setName("accidentals")
      .setDescription("Your accidentals/teamkills (Player Stats)")
      .setRequired(true)
      .setMinValue(0)
      .setMaxValue(9999)
  );

async function autocomplete(interaction) {
  try {
    const focused = interaction.options.getFocused(true);
    const q = String(focused.value || "").toLowerCase();

    if (focused.name === "mission_type") {
      const missions = readMissionList();
      const filtered = missions
        .filter((m) => m.toLowerCase().includes(q))
        .slice(0, 25)
        .map((m) => ({ name: m, value: m }));

      return interaction.respond(filtered);
    }

    if (focused.name === "planet") {
      const planets = getPlanetNamesFromWarCache();
      const filtered = planets
        .filter((p) => p.toLowerCase().includes(q))
        .slice(0, 25)
        .map((p) => ({ name: p, value: p }));

      return interaction.respond(filtered);
    }

    return interaction.respond([]);
  } catch (err) {
    console.error("RUN AUTOCOMPLETE ERROR:", err);
    try {
      return interaction.respond([{ name: "Other", value: "Other" }]);
    } catch {
      return null;
    }
  }
}

async function execute(interaction) {
  await interaction.deferReply({ flags: 64 }).catch(() => {});

  const store = readStore();
  ensureCurrentMonth(store);

  const userId = interaction.user.id;
  const member = await interaction.guild.members.fetch(userId).catch(() => null);
  const divisionName = member ? getDivisionNameForMember(member) : "Unassigned";

  store.users[userId] = store.users[userId] || { unverifiedStreak: 0, totalRuns: 0 };

  const hasLockedPending = store.runs.some(
    (r) => r.loggerId === userId && r.requiresProof && r.status === "awaiting_proof"
  );

  if (hasLockedPending) {
    return interaction.editReply({
      content:
        "🛑 You already have a proof-required run waiting for screenshots. Finish or delete it before logging another run.",
    });
  }

  const planet = interaction.options.getString("planet", true);
  const enemy = interaction.options.getString("enemy", true);
  const difficulty = interaction.options.getInteger("difficulty", true);
  const missionType = interaction.options.getString("mission_type", true);
  ensureMissionExists(missionType);

  const mainObjective = interaction.options.getString("main_objective", true);
  const missionRating = interaction.options.getInteger("mission_rating", true);

  const sideMissed = interaction.options.getString("side_missed", true);
  const outpostsMissed = interaction.options.getString("outposts_missed", true);

  let fortressDestroyed = interaction.options.getString("fortress_destroyed", true);
  let hviExtracted = interaction.options.getString("hvi_extracted", true);

  if (difficulty !== 10 || enemy === "Illuminate") {
    fortressDestroyed = NA_VALUE;
    hviExtracted = NA_VALUE;
  }

  const diversMissing = interaction.options.getInteger("divers_missing", true);
  const kills = interaction.options.getInteger("kills", true);
  const deaths = interaction.options.getInteger("deaths", true);
  const accidentals = interaction.options.getInteger("accidentals", true);

  const basePoints = calcBasePoints({
    enemy,
    difficulty,
    mainObjective,
    missionRating,
    sideMissed: isNA(sideMissed) ? NA_VALUE : Number(sideMissed),
    outpostsMissed: isNA(outpostsMissed) ? NA_VALUE : Number(outpostsMissed),
    diversMissing,
    kills,
    deaths,
    accidentals,
    fortressDestroyed,
    hviExtracted,
  });

  const now = Date.now();
  const runId = nextRunId(store);
  const requiresProof = store.users[userId].unverifiedStreak >= 5;

  const run = {
    runId,
    guildId: interaction.guildId,
    aarChannelId: null,
    aarMessageId: null,
    loggerId: userId,
    divisionName,

    planet,
    enemy,
    missionType,
    difficulty,
    mainObjective,
    missionRating,
    sideMissed,
    outpostsMissed,
    fortressDestroyed,
    hviExtracted,
    diversMissing,
    kills,
    deaths,
    accidentals,

    basePoints,
    scoreAwarded: 0,
    proofApplied: false,
    proofDeclined: false,
    requiresProof,
    status: "awaiting_proof",

    createdAt: new Date(now).toISOString(),
    proofExpireAt: now + PROOF_WINDOW_MINUTES * 60 * 1000,
    editExpireAt: now + EDIT_DELETE_WINDOW_MINUTES * 60 * 1000,
  };

  ensurePlanetStats(store, planet);

  if (!requiresProof) {
    applyRunScoreChange(store, run, basePoints);
  }

  addPlanetContribution(store, planet, 0, 1, 0);

  const aarChannel = findTextChannelByName(interaction.guild, AAR_NAME);
  if (aarChannel) {
    const msg = await aarChannel
      .send({
        embeds: [buildAarEmbed(run)],
        components: buildRunButtons(run),
      })
      .catch(() => null);

    if (msg) {
      run.aarChannelId = aarChannel.id;
      run.aarMessageId = msg.id;
    }
  }

  store.runs.push(run);
  store.users[userId].totalRuns += 1;
  writeStore(store);

  playerStats.recordRun(run);
  const unlockedMedals = medalService.evaluateAndStore(userId);

  await orientationSystem.maybeAutoLogAAR(interaction.member).catch(console.error);
  await ensureLeaderboardMessage(interaction.guild, store).catch(() => {});
  await refreshOpsBoardFromCache(interaction.client).catch(() => {});

  const medalText = formatUnlockedMedals(unlockedMedals);

  return interaction.editReply({
    content:
      `✅ Logged **${runId}** on **${planet}** — ` +
      (requiresProof
        ? `proof is **required** before points are awarded.`
        : `base score **${basePoints}** awarded now. Use proof for **x2**.`) +
      (medalText ? `\n\n**New Medals Unlocked**\n${medalText}` : ""),
  });
}

async function handleTrackerButton(interaction) {
  console.log("HANDLE BUTTON START:", interaction.customId);

  try {
    const store = readStore();
    const [action, runId] = String(interaction.customId || "").split(":");
    const run = store.runs.find((r) => r.runId === runId && r.guildId === interaction.guildId);

    if (!run || run.status === "deleted") {
      return interaction.reply({ content: "Run not found.", flags: 64 }).catch(() => {});
    }

    if (interaction.user.id !== run.loggerId) {
      return interaction.reply({
        content: "Only the diver who submitted this run can use these buttons.",
        flags: 64,
      }).catch(() => {});
    }

    const now = Date.now();

    if (action === "gv_edit") {
      if (!isEditable(run, interaction.user.id, now)) {
        await editRunMessage(interaction.client, run).catch(() => {});
        return interaction.reply({
          content: "The edit window has expired.",
          flags: 64,
        }).catch(() => {});
      }

      const modal = new ModalBuilder()
        .setCustomId(`gv_run_edit:${run.runId}`)
        .setTitle(`Edit ${run.runId}`);

      const f1 = new TextInputBuilder()
        .setCustomId("basic")
        .setLabel("Objective, Rating, Extraction")
        .setStyle(TextInputStyle.Short)
        .setValue(`${run.mainObjective},${run.missionRating},${run.diversMissing}`);

      const f2 = new TextInputBuilder()
        .setCustomId("objectives")
        .setLabel("Side Missed, Outposts Missed")
        .setStyle(TextInputStyle.Short)
        .setValue(`${run.sideMissed},${run.outpostsMissed}`);

      const f3 = new TextInputBuilder()
        .setCustomId("d10")
        .setLabel("Fortress, HVI")
        .setStyle(TextInputStyle.Short)
        .setValue(`${run.fortressDestroyed},${run.hviExtracted}`);

      const f4 = new TextInputBuilder()
        .setCustomId("combat")
        .setLabel("Kills, Deaths, Accidentals")
        .setStyle(TextInputStyle.Short)
        .setValue(`${run.kills},${run.deaths},${run.accidentals}`);

      const f5 = new TextInputBuilder()
        .setCustomId("meta")
        .setLabel("Enemy, Mission Type")
        .setStyle(TextInputStyle.Short)
        .setValue(`${run.enemy},${run.missionType}`);

      modal.addComponents(
        new ActionRowBuilder().addComponents(f1),
        new ActionRowBuilder().addComponents(f2),
        new ActionRowBuilder().addComponents(f3),
        new ActionRowBuilder().addComponents(f4),
        new ActionRowBuilder().addComponents(f5)
      );

      return interaction.showModal(modal);
    }

    await interaction.deferReply({ flags: 64 }).catch(() => {});

    if (action === "gv_proof_add") {
      if (now > run.proofExpireAt) {
        await expireSingleRun(interaction.client, store, run);
        writeStore(store);
        await refreshOpsBoardFromCache(interaction.client).catch(() => {});
        return interaction.editReply("The proof window has expired.");
      }

      store.proofSessions[runId] = {
        runId,
        guildId: run.guildId,
        channelId: run.aarChannelId,
        aarMessageId: run.aarMessageId,
        loggerId: run.loggerId,
        collected: 0,
        expiresAt: run.proofExpireAt,
        active: true,
      };

      writeStore(store);

      return interaction.editReply(
        `📎 Proof started for **${runId}**.\n` +
          `Upload **${PROOF_REQUIRED_IMAGES} screenshots** in **#${AAR_NAME}** within **${PROOF_WINDOW_MINUTES} minutes**:\n` +
          `• Mission Report\n• Player Stats`
      );
    }

    if (action === "gv_proof_skip") {
      if (run.requiresProof) {
        return interaction.editReply(
          "🛑 Proof is required after 5 unverified runs. You must use **Add Proof (x2)**."
        );
      }

      if (now > run.proofExpireAt) {
        await expireSingleRun(interaction.client, store, run);
        writeStore(store);
        await refreshOpsBoardFromCache(interaction.client).catch(() => {});
        return interaction.editReply("The proof window has expired.");
      }

      if (run.status !== "awaiting_proof") {
        return interaction.editReply("This run has already been finalised.");
      }

      finalizeUnverified(store, run);
      writeStore(store);

      const unlockedMedals = medalService.evaluateAndStore(run.loggerId);

      await editRunMessage(interaction.client, run).catch(() => {});
      await ensureLeaderboardMessage(interaction.guild, store).catch(() => {});
      await refreshOpsBoardFromCache(interaction.client).catch(() => {});

      return interaction.editReply(
        `✔ Submitted without proof. (**${run.runId}**)` +
          (unlockedMedals.length
            ? `\n\n**New Medals Unlocked**\n${formatUnlockedMedals(unlockedMedals)}`
            : "")
      );
    }

    if (action === "gv_delete") {
      if (!isDeletable(run, interaction.user.id, now)) {
        await editRunMessage(interaction.client, run).catch(() => {});
        return interaction.editReply("The delete window has expired.");
      }

      const removedScore = Number(run.scoreAwarded || 0);

      if (removedScore > 0) {
        subtractScore(store, run.loggerId, run.divisionName, run.enemy, removedScore);
        addPlanetContribution(store, run.planet, -removedScore, 0, 0);
      }

      addPlanetContribution(store, run.planet, 0, -1, run.proofApplied ? -1 : 0);

      run.status = "deleted";
      delete store.proofSessions[run.runId];
      writeStore(store);

      playerStats.removeRun(run);

      try {
        const guild = await interaction.client.guilds.fetch(run.guildId);
        const ch = await guild.channels.fetch(run.aarChannelId).catch(() => null);
        const msg = ch?.isTextBased?.()
          ? await ch.messages.fetch(run.aarMessageId).catch(() => null)
          : null;
        if (msg) await msg.delete().catch(() => {});
      } catch (err) {
        console.error("DELETE MESSAGE ERROR:", err);
      }

      await ensureLeaderboardMessage(interaction.guild, store).catch(() => {});
      await refreshOpsBoardFromCache(interaction.client).catch(() => {});
      return interaction.editReply(
        `🗑 Deleted **${run.runId}** and removed **${removedScore}** point(s).`
      );
    }

    return interaction.editReply("Unknown action.");
  } catch (err) {
    console.error("TRACKER BUTTON ERROR:", err);

    try {
      if (interaction.deferred || interaction.replied) {
        return interaction.editReply("Button action failed. Check bot console.");
      }
      return interaction.reply({
        content: "Button action failed. Check bot console.",
        flags: 64,
      });
    } catch {
      return null;
    }
  }
}

async function handleTrackerModal(interaction) {
  await interaction.deferReply({ flags: 64 }).catch(() => {});

  const runId = interaction.customId.split(":")[1];
  const store = readStore();
  const run = store.runs.find((r) => r.runId === runId && r.guildId === interaction.guildId);

  if (!run || run.status === "deleted") {
    return interaction.editReply("Run not found.");
  }

  if (!isEditable(run, interaction.user.id, Date.now())) {
    return interaction.editReply("The edit window has expired.");
  }

  const missions = readMissionList();

  try {
    const [mainObjectiveRaw, ratingRaw, diversRaw] = interaction.fields
      .getTextInputValue("basic")
      .split(",")
      .map((s) => s.trim());

    const [sideRaw, outRaw] = interaction.fields
      .getTextInputValue("objectives")
      .split(",")
      .map((s) => s.trim());

    const [fortRaw, hviRaw] = interaction.fields
      .getTextInputValue("d10")
      .split(",")
      .map((s) => s.trim());

    const [killsRaw, deathsRaw, accRaw] = interaction.fields
      .getTextInputValue("combat")
      .split(",")
      .map((s) => s.trim());

    const [enemyRaw, missionTypeRaw] = interaction.fields
      .getTextInputValue("meta")
      .split(",")
      .map((s) => s.trim());

    const mainObjective =
      mainObjectiveRaw === "Yes" || mainObjectiveRaw === "No" ? mainObjectiveRaw : null;

    const missionRating = clamp(ratingRaw, 1, 5);
    const diversMissing = clamp(diversRaw, 0, 4);

    const sideMissed = sideRaw === NA_VALUE ? NA_VALUE : String(clamp(sideRaw, 0, 5));
    const outpostsMissed = outRaw === NA_VALUE ? NA_VALUE : String(clamp(outRaw, 0, 5));

    const enemy = ENEMIES.includes(enemyRaw) ? enemyRaw : null;
    const missionType = missions.includes(missionTypeRaw) ? missionTypeRaw : null;

    const kills = clamp(killsRaw, 0, 9999);
    const deaths = clamp(deathsRaw, 0, 9999);
    const accidentals = clamp(accRaw, 0, 9999);

    let fortressDestroyed = fortRaw;
    let hviExtracted = hviRaw;

    if (!["Yes", "No", NA_VALUE].includes(fortressDestroyed)) fortressDestroyed = NA_VALUE;
    if (!["Yes", "No", NA_VALUE].includes(hviExtracted)) hviExtracted = NA_VALUE;

    if (!mainObjective || !enemy || !missionType) {
      return interaction.editReply(
        "Invalid edit values. Use exact values like `Yes,5,0` and a valid enemy/mission type."
      );
    }

    if (run.difficulty !== 10 || enemy === "Illuminate") {
      fortressDestroyed = NA_VALUE;
      hviExtracted = NA_VALUE;
    }

    const oldAwarded = Number(run.scoreAwarded || 0);
    if (oldAwarded > 0) {
      subtractScore(store, run.loggerId, run.divisionName, run.enemy, oldAwarded);
      addPlanetContribution(store, run.planet, -oldAwarded, 0, 0);
    }

    run.mainObjective = mainObjective;
    run.missionRating = missionRating;
    run.sideMissed = sideMissed;
    run.outpostsMissed = outpostsMissed;
    run.fortressDestroyed = fortressDestroyed;
    run.hviExtracted = hviExtracted;
    run.diversMissing = diversMissing;
    run.kills = kills;
    run.deaths = deaths;
    run.accidentals = accidentals;
    run.enemy = enemy;
    run.missionType = missionType;

    run.basePoints = calcBasePoints({
      enemy: run.enemy,
      difficulty: run.difficulty,
      mainObjective: run.mainObjective,
      missionRating: run.missionRating,
      sideMissed: isNA(run.sideMissed) ? NA_VALUE : Number(run.sideMissed),
      outpostsMissed: isNA(run.outpostsMissed) ? NA_VALUE : Number(run.outpostsMissed),
      diversMissing: run.diversMissing,
      kills: run.kills,
      deaths: run.deaths,
      accidentals: run.accidentals,
      fortressDestroyed: run.fortressDestroyed,
      hviExtracted: run.hviExtracted,
    });

    let newAwarded = 0;
    if (run.status === "proof_applied") newAwarded = run.basePoints * 2;
    else if (
      run.status === "submitted_without_proof" ||
      (run.status === "awaiting_proof" && !run.requiresProof)
    ) {
      newAwarded = run.basePoints;
    } else {
      newAwarded = 0;
    }

    applyRunScoreChange(store, run, newAwarded);
    writeStore(store);

    const unlockedMedals = medalService.evaluateAndStore(run.loggerId);

    await editRunMessage(interaction.client, run);
    await ensureLeaderboardMessage(interaction.guild, store).catch(() => {});
    await refreshOpsBoardFromCache(interaction.client).catch(() => {});

    return interaction.editReply(
      `✏ Updated **${run.runId}**. New score awarded: **${run.scoreAwarded}**.` +
        (unlockedMedals.length
          ? `\n\n**New Medals Unlocked**\n${formatUnlockedMedals(unlockedMedals)}`
          : "")
    );
  } catch {
    return interaction.editReply(
      "Invalid edit format. Keep the comma-separated format shown in each box."
    );
  }
}

async function handleTrackerProofMessage(message) {
  try {
    if (!message.guild || message.author.bot) return;
    if (!message.channel?.name || message.channel.name.toLowerCase() !== AAR_NAME.toLowerCase()) return;
    if (!message.attachments || message.attachments.size === 0) return;

    const images = [...message.attachments.values()].filter(isImageAttachment);
    if (images.length === 0) return;

    const store = readStore();

    const sessions = Object.values(store.proofSessions || {})
      .filter((s) => s.active && s.loggerId === message.author.id && s.guildId === message.guild.id)
      .filter((s) => Date.now() <= s.expiresAt)
      .sort((a, b) => b.expiresAt - a.expiresAt);

    if (!sessions.length) return;

    const session = sessions[0];
    session.collected += images.length;
    store.proofSessions[session.runId] = session;

    const run = store.runs.find((r) => r.runId === session.runId && r.guildId === message.guild.id);
    if (!run || run.status === "deleted") {
      session.active = false;
      writeStore(store);
      return;
    }

    await message.react("📎").catch(() => {});

    if (session.collected < PROOF_REQUIRED_IMAGES) {
      writeStore(store);
      return;
    }

    session.active = false;
    run.proofApplied = true;
    run.proofDeclined = false;
    run.status = "proof_applied";

    store.users[run.loggerId] = store.users[run.loggerId] || {
      unverifiedStreak: 0,
      totalRuns: 0,
    };
    store.users[run.loggerId].unverifiedStreak = 0;

    const previousAwarded = Number(run.scoreAwarded || 0);
    const newAwarded = run.basePoints * 2;
    applyRunScoreChange(store, run, newAwarded);

    if (!run._planetProofCounted) {
      addPlanetContribution(store, run.planet, 0, 0, 1);
      run._planetProofCounted = true;
    }

    writeStore(store);

    const unlockedMedals = medalService.evaluateAndStore(run.loggerId);

    await editRunMessage(message.client, run);
    await ensureLeaderboardMessage(message.guild, store).catch(() => {});
    await refreshOpsBoardFromCache(message.client).catch(() => {});
    await message.reply(
      `✅ Proof accepted for **${run.runId}** — score changed from **${previousAwarded}** to **${run.scoreAwarded}**.` +
        (unlockedMedals.length
          ? `\n\n**New Medals Unlocked**\n${formatUnlockedMedals(unlockedMedals)}`
          : "")
    ).catch(() => {});
  } catch (e) {
    console.error("handleTrackerProofMessage error:", e);
  }
}

async function expireSingleRun(client, store, run) {
  if (run.status === "deleted") return;

  const beforeState = run.status;

  if (Date.now() > run.proofExpireAt && run.status === "awaiting_proof") {
    finalizeUnverified(store, run);
  }

  if (beforeState !== run.status || controlsState(run, Date.now()) === "none") {
    writeStore(store);
    await editRunMessage(client, run).catch(() => {});
    await refreshOpsBoardFromCache(client).catch(() => {});
  }
}

async function expireTrackerControls(client) {
  const store = readStore();
  let changed = false;

  for (const run of store.runs) {
    if (run.status === "deleted") continue;

    const oldStatus = run.status;

    if (Date.now() > run.proofExpireAt && run.status === "awaiting_proof") {
      finalizeUnverified(store, run);
      changed = true;
    }

    const shouldTouch =
      Date.now() > run.editExpireAt ||
      Date.now() > run.proofExpireAt ||
      oldStatus !== run.status;

    if (shouldTouch) {
      await editRunMessage(client, run).catch(() => {});
    }
  }

  if (changed) {
    writeStore(store);

    const guildIds = [...new Set(store.runs.map((r) => r.guildId))];
    for (const gid of guildIds) {
      const guild = await client.guilds.fetch(gid).catch(() => null);
      if (guild) await ensureLeaderboardMessage(guild, store).catch(() => {});
    }

    await refreshOpsBoardFromCache(client).catch(() => {});
  }
}

module.exports = {
  data,
  execute,
  autocomplete,

  readStore,
  writeStore,
  ensureLeaderboardMessage,
  updateLeaderboard,
  currentMonthKey,

  handleTrackerButton,
  handleTrackerModal,
  handleTrackerProofMessage,
  expireTrackerControls,
};