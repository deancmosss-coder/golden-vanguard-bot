// =========================
// services/testRunner.js
// FULL SCRIPT
// Strict monitoring build - Step 5
// =========================

const fs = require("fs");
const path = require("path");

const TRACKER_STORE_PATH = path.join(__dirname, "..", "tracker_store.json");
const MISSIONS_PATH = path.join(__dirname, "..", "missions.json");
const WAR_CACHE_PATH = path.join(__dirname, "..", "data", "war_cache.json");
const FEATURE_STATE_PATH = path.join(__dirname, "..", "data", "featureState.json");
const RECRUITS_PATH = path.join(__dirname, "..", "data", "recruits.json");
const BOARD_CONFIG_PATH = path.join(__dirname, "..", "data", "boardConfig.json");

function ok(name, details) {
  return { name, ok: true, details };
}

function fail(name, details) {
  return { name, ok: false, details };
}

function safeReadJson(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) {
      return { exists: false, data: fallback, error: null };
    }

    const raw = fs.readFileSync(filePath, "utf8");
    return {
      exists: true,
      data: JSON.parse(raw),
      error: null,
    };
  } catch (error) {
    return {
      exists: true,
      data: fallback,
      error: error.message || String(error),
    };
  }
}

async function fetchChannel(guild, channelId) {
  if (!channelId) return null;
  return guild.channels.fetch(channelId).catch(() => null);
}

async function fetchRole(guild, roleId) {
  if (!roleId) return null;
  return guild.roles.fetch(roleId).catch(() => null);
}

function getEnv(name, fallback = "") {
  return (process.env[name] || fallback).trim();
}

async function testTracker(guild) {
  const results = [];

  const aarName = getEnv("AAR_CHANNEL_NAME", "after-action-reports");
  const lbName = getEnv("LB_CHANNEL_NAME", "leaderboards");

  const aarChannel = guild.channels.cache.find(
    (c) => c.isTextBased?.() && c.name?.toLowerCase() === aarName.toLowerCase()
  );
  const lbChannel = guild.channels.cache.find(
    (c) => c.isTextBased?.() && c.name?.toLowerCase() === lbName.toLowerCase()
  );

  results.push(
    aarChannel
      ? ok("AAR channel", `Found #${aarName}`)
      : fail("AAR channel", `Missing #${aarName}`)
  );

  results.push(
    lbChannel
      ? ok("Leaderboard channel", `Found #${lbName}`)
      : fail("Leaderboard channel", `Missing #${lbName}`)
  );

  const trackerStore = safeReadJson(TRACKER_STORE_PATH, {});
  if (!trackerStore.exists) {
    results.push(fail("tracker_store.json", "File missing"));
  } else if (trackerStore.error) {
    results.push(fail("tracker_store.json", `Invalid JSON: ${trackerStore.error}`));
  } else {
    results.push(ok("tracker_store.json", "Readable JSON"));
  }

  const missions = safeReadJson(MISSIONS_PATH, {});
  if (!missions.exists) {
    results.push(fail("missions.json", "File missing"));
  } else if (missions.error) {
    results.push(fail("missions.json", `Invalid JSON: ${missions.error}`));
  } else if (!Array.isArray(missions.data?.missions)) {
    results.push(fail("missions.json", 'Missing "missions" array'));
  } else {
    results.push(ok("missions.json", `${missions.data.missions.length} mission(s) loaded`));
  }

  return results;
}

async function testWarboard(guild) {
  const results = [];

  const boardConfig = safeReadJson(BOARD_CONFIG_PATH, {});
  if (!boardConfig.exists) {
    results.push(fail("boardConfig.json", "File missing"));
  } else if (boardConfig.error) {
    results.push(fail("boardConfig.json", `Invalid JSON: ${boardConfig.error}`));
  } else {
    results.push(ok("boardConfig.json", "Readable JSON"));
  }

  const warCache = safeReadJson(WAR_CACHE_PATH, {});
  if (!warCache.exists) {
    results.push(fail("war_cache.json", "File missing"));
  } else if (warCache.error) {
    results.push(fail("war_cache.json", `Invalid JSON: ${warCache.error}`));
  } else {
    results.push(ok("war_cache.json", "Readable JSON"));
  }

  const boardChannelId = String(boardConfig.data?.channelId || "").trim();
  if (!boardChannelId) {
    results.push(fail("War board channel", "channelId missing in boardConfig.json"));
  } else {
    const channel = await fetchChannel(guild, boardChannelId);
    results.push(
      channel?.isTextBased?.()
        ? ok("War board channel", `Found #${channel.name}`)
        : fail("War board channel", `Channel not found: ${boardChannelId}`)
    );
  }

  return results;
}

async function testAskToPlay(guild) {
  const results = [];

  const pingRoleId = getEnv("PING_ROLE_ID");
  const allowedChannelId = getEnv("ALLOWED_CHANNEL_ID");

  if (!pingRoleId) {
    results.push(fail("PING_ROLE_ID", "Missing in .env"));
  } else {
    const role = await fetchRole(guild, pingRoleId);
    results.push(
      role ? ok("Ask-to-Play role", `Found role: ${role.name}`) : fail("Ask-to-Play role", "Role not found")
    );
  }

  if (!allowedChannelId) {
    results.push(fail("ALLOWED_CHANNEL_ID", "Missing in .env"));
  } else {
    const channel = await fetchChannel(guild, allowedChannelId);
    results.push(
      channel?.isTextBased?.()
        ? ok("Allowed channel", `Found #${channel.name}`)
        : fail("Allowed channel", "Channel not found")
    );
  }

  return results;
}

async function testOrientation(guild) {
  const results = [];

  const roleChecks = [
    ["ORIENTATION_RECRUIT_ROLE_ID", "Recruit role"],
    ["ORIENTATION_TROOPER_ROLE_ID", "Trooper role"],
    ["ORIENTATION_SERGEANT_ROLE_ID", "Sergeant role"],
    ["ORIENTATION_SENIOR_OFFICER_ROLE_ID", "Senior Officer role"],
    ["ORIENTATION_STRIKE_CAPTAIN_ROLE_ID", "Strike Captain role"],
    ["ORIENTATION_HIGH_COMMAND_ROLE_ID", "High Command role"],
    ["ORIENTATION_VANGUARD_PRIME_ROLE_ID", "Vanguard Prime role"],
  ];

  const channelChecks = [
    ["ORIENTATION_RECRUIT_MONITOR_CHANNEL_ID", "Recruit monitor channel"],
    ["ORIENTATION_PROMOTION_REQUESTS_CHANNEL_ID", "Promotion requests channel"],
    ["ORIENTATION_LOG_CHANNEL_ID", "Orientation log channel"],
    ["ORIENTATION_CHECKLIST_CHANNEL_ID", "Checklist channel"],
    ["ORIENTATION_PROMOTION_ANNOUNCE_CHANNEL_ID", "Promotion announce channel"],
  ];

  for (const [envName, label] of roleChecks) {
    const roleId = getEnv(envName);
    if (!roleId) {
      results.push(fail(label, `${envName} missing in .env`));
      continue;
    }

    const role = await fetchRole(guild, roleId);
    results.push(role ? ok(label, `Found role: ${role.name}`) : fail(label, `Role not found: ${roleId}`));
  }

  for (const [envName, label] of channelChecks) {
    const channelId = getEnv(envName);
    if (!channelId) {
      results.push(fail(label, `${envName} missing in .env`));
      continue;
    }

    const channel = await fetchChannel(guild, channelId);
    results.push(
      channel?.isTextBased?.()
        ? ok(label, `Found #${channel.name}`)
        : fail(label, `Channel not found: ${channelId}`)
    );
  }

  const recruitsFile = safeReadJson(RECRUITS_PATH, {});
  if (!recruitsFile.exists) {
    results.push(fail("recruits.json", "File missing"));
  } else if (recruitsFile.error) {
    results.push(fail("recruits.json", `Invalid JSON: ${recruitsFile.error}`));
  } else {
    results.push(ok("recruits.json", "Readable JSON"));
  }

  const vcCategoryId = getEnv("ORIENTATION_VC_CATEGORY_ID");
  if (!vcCategoryId) {
    results.push(fail("Orientation VC category", "ORIENTATION_VC_CATEGORY_ID missing in .env"));
  } else {
    const category = await fetchChannel(guild, vcCategoryId);
    results.push(
      category
        ? ok("Orientation VC category", `Found channel/category: ${category.name}`)
        : fail("Orientation VC category", `Not found: ${vcCategoryId}`)
    );
  }

  return results;
}

async function testPlayerStats() {
  const results = [];

  const trackerStore = safeReadJson(TRACKER_STORE_PATH, {});
  if (!trackerStore.exists) {
    results.push(fail("tracker_store.json", "File missing"));
    return results;
  }

  if (trackerStore.error) {
    results.push(fail("tracker_store.json", `Invalid JSON: ${trackerStore.error}`));
    return results;
  }

  const profiles = trackerStore.data?.profiles;
  results.push(
    profiles && typeof profiles === "object"
      ? ok("profiles", "Profiles section exists")
      : fail("profiles", 'Missing "profiles" object in tracker_store.json')
  );

  return results;
}

async function testLeaderboard(guild) {
  const results = [];

  const lbName = getEnv("LB_CHANNEL_NAME", "leaderboards");
  const annName = getEnv("ANN_CHANNEL_NAME", "top-rankers");

  const lbChannel = guild.channels.cache.find(
    (c) => c.isTextBased?.() && c.name?.toLowerCase() === lbName.toLowerCase()
  );
  const annChannel = guild.channels.cache.find(
    (c) => c.isTextBased?.() && c.name?.toLowerCase() === annName.toLowerCase()
  );

  results.push(
    lbChannel
      ? ok("Leaderboard channel", `Found #${lbName}`)
      : fail("Leaderboard channel", `Missing #${lbName}`)
  );

  results.push(
    annChannel
      ? ok("Announcement channel", `Found #${annName}`)
      : fail("Announcement channel", `Missing #${annName}`)
  );

  const trackerStore = safeReadJson(TRACKER_STORE_PATH, {});
  if (!trackerStore.exists) {
    results.push(fail("tracker_store.json", "File missing"));
  } else if (trackerStore.error) {
    results.push(fail("tracker_store.json", `Invalid JSON: ${trackerStore.error}`));
  } else {
    const msgState = trackerStore.data?.leaderboardMessage;
    results.push(
      msgState && typeof msgState === "object"
        ? ok("leaderboardMessage", "Leaderboard message state exists")
        : fail("leaderboardMessage", 'Missing "leaderboardMessage" state')
    );
  }

  return results;
}

async function testEnlistment(guild) {
  const results = [];

  const requiredRoleNames = [
    "Eclipse Vanguard",
    "Orbital Directive",
    "Aegis Guard",
    "Purifier Corps",
    "Ask to Play",
  ];

  for (const roleName of requiredRoleNames) {
    const role = guild.roles.cache.find((r) => r.name === roleName);
    results.push(
      role ? ok(roleName, "Role exists") : fail(roleName, "Role missing")
    );
  }

  return results;
}

async function testCommands() {
  const results = [];
  const commandsPath = path.join(__dirname, "..", "commands");

  if (!fs.existsSync(commandsPath)) {
    results.push(fail("commands folder", "Missing ./commands folder"));
    return results;
  }

  const files = fs.readdirSync(commandsPath).filter((f) => f.endsWith(".js"));
  results.push(ok("commands folder", `${files.length} command file(s) found`));

  const requiredFiles = ["run.js", "enlistment.js"];
  for (const file of requiredFiles) {
    results.push(
      files.includes(file) ? ok(file, "Found") : fail(file, "Missing")
    );
  }

  return results;
}

async function testSystem(guild, feature) {
  const key = String(feature || "").toLowerCase();

  switch (key) {
    case "tracker":
      return testTracker(guild);
    case "warboard":
      return testWarboard(guild);
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
    case "commands":
      return testCommands();
    default:
      return [fail("Unknown feature", `No test exists for "${feature}"`)];
  }
}

async function runAllTests(guild) {
  const features = [
    "commands",
    "tracker",
    "warboard",
    "asktoplay",
    "orientation",
    "playerstats",
    "leaderboard",
    "enlistment",
  ];

  const output = {};
  for (const feature of features) {
    output[feature] = await testSystem(guild, feature);
  }

  return output;
}

function summarise(results) {
  const all = Array.isArray(results)
    ? results
    : Object.values(results).flat();

  const passed = all.filter((x) => x.ok).length;
  const failed = all.filter((x) => !x.ok).length;

  return {
    passed,
    failed,
    total: passed + failed,
  };
}

function formatSingleFeatureResults(feature, results) {
  const lines = [`## ${feature}`];

  for (const item of results) {
    lines.push(`${item.ok ? "✅" : "❌"} **${item.name}** — ${item.details}`);
  }

  const summary = summarise(results);
  lines.push("");
  lines.push(
    `**Summary:** ${summary.passed} passed / ${summary.failed} failed / ${summary.total} total`
  );

  return lines.join("\n");
}

function formatAllResults(resultsByFeature) {
  const sections = [];

  for (const [feature, results] of Object.entries(resultsByFeature)) {
    sections.push(formatSingleFeatureResults(feature, results));
  }

  const summary = summarise(resultsByFeature);
  sections.unshift(
    `# Golden Vanguard Test Report\n\n**Overall:** ${summary.passed} passed / ${summary.failed} failed / ${summary.total} total`
  );

  return sections.join("\n\n");
}

module.exports = {
  runAllTests,
  testSystem,
  summarise,
  formatSingleFeatureResults,
  formatAllResults,
};