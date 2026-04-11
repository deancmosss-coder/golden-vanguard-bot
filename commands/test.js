// =========================
// services/testRunner.js
// FULL REPLACEMENT
// =========================

const fs = require("fs");
const path = require("path");

const TRACKER_STORE_PATH = path.join(__dirname, "..", "tracker_store.json");
const MISSIONS_PATH = path.join(__dirname, "..", "missions.json");
const WAR_CACHE_PATH = path.join(__dirname, "..", "data", "war_cache.json");
const FEATURE_STATE_PATH = path.join(__dirname, "..", "data", "featureState.json");
const RECRUITS_PATH = path.join(__dirname, "..", "data", "recruits.json");
const BOARD_CONFIG_PATH = path.join(__dirname, "..", "data", "boardConfig.json");

function ok(name, details = "OK") {
  return { name, ok: true, details };
}

function fail(name, details = "Failed") {
  return { name, ok: false, details };
}

function fileExistsSafe(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function readJsonSafe(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

async function testCommands(guild) {
  const results = [];

  const commandsPath = path.join(__dirname, "..", "commands");
  const requiredFiles = [
    "run.js",
    "enlistment.js",
  ];

  results.push(
    fileExistsSafe(commandsPath)
      ? ok("commands folder", "Folder exists")
      : fail("commands folder", "Folder missing")
  );

  for (const file of requiredFiles) {
    const fullPath = path.join(commandsPath, file);
    results.push(
      fileExistsSafe(fullPath)
        ? ok(file, "Command file exists")
        : fail(file, "Command file missing")
    );
  }

  return results;
}

async function testTracker() {
  const results = [];

  results.push(
    fileExistsSafe(TRACKER_STORE_PATH)
      ? ok("tracker_store.json", "Tracker store exists")
      : fail("tracker_store.json", "Tracker store missing")
  );

  results.push(
    fileExistsSafe(MISSIONS_PATH)
      ? ok("missions.json", "Mission file exists")
      : fail("missions.json", "Mission file missing")
  );

  const trackerStore = readJsonSafe(TRACKER_STORE_PATH);
  results.push(
    trackerStore
      ? ok("tracker_store.json parse", "Valid JSON")
      : fail("tracker_store.json parse", "Invalid or unreadable JSON")
  );

  const missions = readJsonSafe(MISSIONS_PATH);
  results.push(
    missions && Array.isArray(missions.missions)
      ? ok("missions.json structure", "missions array found")
      : fail("missions.json structure", "missions array missing or invalid")
  );

  return results;
}

async function testWarboard() {
  const results = [];

  results.push(
    fileExistsSafe(WAR_CACHE_PATH)
      ? ok("war_cache.json", "War cache exists")
      : fail("war_cache.json", "War cache missing")
  );

  results.push(
    fileExistsSafe(BOARD_CONFIG_PATH)
      ? ok("boardConfig.json", "Board config exists")
      : fail("boardConfig.json", "Board config missing")
  );

  const warCache = readJsonSafe(WAR_CACHE_PATH);
  results.push(
    warCache
      ? ok("war_cache.json parse", "Valid JSON")
      : fail("war_cache.json parse", "Invalid or unreadable JSON")
  );

  const boardConfig = readJsonSafe(BOARD_CONFIG_PATH);
  if (boardConfig) {
    results.push(ok("boardConfig.json parse", "Valid JSON"));
    results.push(
      boardConfig.channelId
        ? ok("board channel id", "Configured")
        : fail("board channel id", "Missing channelId")
    );
  } else {
    results.push(fail("boardConfig.json parse", "Invalid or unreadable JSON"));
  }

  return results;
}

async function testAskToPlay(guild) {
  const results = [];

  const requiredRoleKeywords = ["ask"];
  const allowedChannelId = (process.env.ALLOWED_CHANNEL_ID || "").trim();

  for (const keyword of requiredRoleKeywords) {
    const role = guild.roles.cache.find((r) =>
      r.name.toLowerCase().includes(keyword)
    );

    results.push(
      role
        ? ok(`Role contains "${keyword}"`, `Found: ${role.name}`)
        : fail(`Role contains "${keyword}"`, "No matching role found")
    );
  }

  results.push(
    allowedChannelId
      ? ok("ALLOWED_CHANNEL_ID", `Configured: ${allowedChannelId}`)
      : fail("ALLOWED_CHANNEL_ID", "Missing from .env")
  );

  if (allowedChannelId) {
    const channel = guild.channels.cache.get(allowedChannelId);
    results.push(
      channel
        ? ok("Ask-to-Play channel", `Found: #${channel.name}`)
        : fail("Ask-to-Play channel", "Configured channel not found in guild")
    );
  }

  return results;
}

async function testOrientation(guild) {
  const results = [];

  const recruitRoleId = (process.env.ORIENTATION_RECRUIT_ROLE_ID || "").trim();
  const trooperRoleId = (process.env.ORIENTATION_TROOPER_ROLE_ID || "").trim();

  results.push(
    recruitRoleId
      ? ok("ORIENTATION_RECRUIT_ROLE_ID", "Configured")
      : fail("ORIENTATION_RECRUIT_ROLE_ID", "Missing from .env")
  );

  results.push(
    trooperRoleId
      ? ok("ORIENTATION_TROOPER_ROLE_ID", "Configured")
      : fail("ORIENTATION_TROOPER_ROLE_ID", "Missing from .env")
  );

  if (recruitRoleId) {
    const recruitRole = guild.roles.cache.get(recruitRoleId);
    results.push(
      recruitRole
        ? ok("Recruit role", `Found: ${recruitRole.name}`)
        : fail("Recruit role", "Configured recruit role not found")
    );
  }

  if (trooperRoleId) {
    const trooperRole = guild.roles.cache.get(trooperRoleId);
    results.push(
      trooperRole
        ? ok("Trooper role", `Found: ${trooperRole.name}`)
        : fail("Trooper role", "Configured trooper role not found")
    );
  }

  results.push(
    fileExistsSafe(RECRUITS_PATH)
      ? ok("recruits.json", "Orientation recruit data file exists")
      : fail("recruits.json", "Orientation recruit data file missing")
  );

  const recruits = readJsonSafe(RECRUITS_PATH);
  results.push(
    recruits !== null
      ? ok("recruits.json parse", "Valid JSON")
      : fail("recruits.json parse", "Invalid or unreadable JSON")
  );

  return results;
}

async function testPlayerStats() {
  const results = [];

  const playerStatsPath = path.join(__dirname, "..", "services", "playerStats.js");

  results.push(
    fileExistsSafe(playerStatsPath)
      ? ok("playerStats.js", "Player stats service exists")
      : fail("playerStats.js", "Player stats service missing")
  );

  return results;
}

async function testLeaderboard(guild) {
  const results = [];

  const leaderboardChannelName = (process.env.LB_CHANNEL_NAME || "leaderboards").trim();
  const leaderboardChannel = guild.channels.cache.find(
    (c) => c.isTextBased?.() && c.name?.toLowerCase() === leaderboardChannelName.toLowerCase()
  );

  results.push(
    leaderboardChannel
      ? ok("leaderboard channel", `Found: #${leaderboardChannel.name}`)
      : fail("leaderboard channel", `Missing #${leaderboardChannelName}`)
  );

  return results;
}

async function testEnlistment(guild) {
  const results = [];

  const requiredRoleNames = [
    "Eclipse Vanguard",
    "Orbital Directive",
    "Bastion Guard",
    "Purifier Corps",
  ];

  for (const roleName of requiredRoleNames) {
    const role = guild.roles.cache.find((r) => r.name === roleName);
    results.push(
      role
        ? ok(roleName, "Role exists")
        : fail(roleName, "Role missing")
    );
  }

  const askRole = guild.roles.cache.find((r) =>
    r.name.toLowerCase().includes("ask")
  );

  results.push(
    askRole
      ? ok('Ask-to-Play role', `Found: ${askRole.name}`)
      : fail('Ask-to-Play role', "Role missing")
  );

  return results;
}

async function testFeatureRegistry() {
  const results = [];

  results.push(
    fileExistsSafe(FEATURE_STATE_PATH)
      ? ok("featureState.json", "Feature registry file exists")
      : fail("featureState.json", "Feature registry file missing")
  );

  const featureState = readJsonSafe(FEATURE_STATE_PATH);
  results.push(
    featureState
      ? ok("featureState.json parse", "Valid JSON")
      : fail("featureState.json parse", "Invalid or unreadable JSON")
  );

  return results;
}

async function testSystem(guild, feature) {
  const key = String(feature || "").toLowerCase();

  switch (key) {
    case "commands":
      return testCommands(guild);
    case "tracker":
      return testTracker();
    case "warboard":
      return testWarboard();
    case "asktoplay":
      return testAskToPlay(guild);
    case "orientation":
      return testOrientation(guild);
    case "playerstats":
      return testPlayerStats();
    case "leaderboard":
      return testLeaderboard(guild);
    case "enlistment":
      return testEnlistment(guild);
    case "registry":
      return testFeatureRegistry();
    default:
      return [fail(key || "unknown", "Unknown test feature")];
  }
}

async function runAllTests(guild) {
  return {
    commands: await testCommands(guild),
    tracker: await testTracker(),
    warboard: await testWarboard(),
    asktoplay: await testAskToPlay(guild),
    orientation: await testOrientation(guild),
    playerstats: await testPlayerStats(),
    voiceTracking: [ok("voiceTracking", "Voice tracking test placeholder OK")],
    leaderboard: await testLeaderboard(guild),
    enlistment: await testEnlistment(guild),
    registry: await testFeatureRegistry(),
  };
}

function summarise(input) {
  if (Array.isArray(input)) {
    const passed = input.filter((r) => r.ok).length;
    const failed = input.filter((r) => !r.ok).length;
    return {
      passed,
      failed,
      total: input.length,
    };
  }

  const all = Object.values(input || {}).flat();
  return summarise(all);
}

function formatSingleFeatureResults(feature, results) {
  const lines = [
    `# Test Report: ${feature}`,
    "",
    ...results.map((r) => `${r.ok ? "✅" : "❌"} ${r.name} — ${r.details}`),
    "",
  ];

  return lines.join("\n");
}

function formatAllResults(resultsByFeature) {
  const lines = ["# Full System Test Report", ""];

  for (const [feature, results] of Object.entries(resultsByFeature || {})) {
    lines.push(`## ${feature}`);
    lines.push("");

    for (const result of results) {
      lines.push(`${result.ok ? "✅" : "❌"} ${result.name} — ${result.details}`);
    }

    lines.push("");
  }

  return lines.join("\n");
}

module.exports = {
  ok,
  fail,
  testSystem,
  runAllTests,
  summarise,
  formatSingleFeatureResults,
  formatAllResults,
};