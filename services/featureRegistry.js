// =========================
// services/featureRegistry.js
// FULL REPLACEMENT
// Step 3 foundation file
// =========================

const fs = require("fs");
const path = require("path");

const DATA_PATH = path.join(__dirname, "..", "data", "featureState.json");

function createDefault() {
  return {
    enabled: true,
    failCount: 0,
    lastError: null,
    lastErrorAt: null,
    lastSuccessAt: null,
    pausedReason: null,
  };
}

function defaultState() {
  return {
    warboard: createDefault(),
    tracker: createDefault(),
    playerStats: createDefault(),
    askToPlay: createDefault(),
    orientation: createDefault(),
    voiceTracking: createDefault(),
    leaderboard: createDefault(),
    commands: createDefault(),
    enlistment: createDefault(),
  };
}

function ensureFile() {
  if (!fs.existsSync(DATA_PATH)) {
    fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
    fs.writeFileSync(DATA_PATH, JSON.stringify(defaultState(), null, 2), "utf8");
  }
}

function readState() {
  ensureFile();

  try {
    const raw = fs.readFileSync(DATA_PATH, "utf8");
    const parsed = JSON.parse(raw);
    const base = defaultState();

    for (const [key, value] of Object.entries(parsed || {})) {
      base[key] = {
        ...createDefault(),
        ...(value || {}),
      };
    }

    return base;
  } catch {
    return defaultState();
  }
}

function writeState(state) {
  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify(state, null, 2), "utf8");
}

function ensureFeatureExists(name) {
  const state = readState();

  if (!state[name]) {
    state[name] = createDefault();
    writeState(state);
  }

  return state;
}

function getAllFeatures() {
  return readState();
}

function getFeature(name) {
  const state = ensureFeatureExists(name);
  return state[name];
}

function isFeatureEnabled(name) {
  const state = ensureFeatureExists(name);
  return state[name].enabled !== false;
}

function registerSuccess(name) {
  const state = ensureFeatureExists(name);

  state[name].failCount = 0;
  state[name].lastSuccessAt = new Date().toISOString();
  state[name].lastError = null;
  state[name].lastErrorAt = null;

  writeState(state);
  return state[name];
}

function registerFailure(name, err) {
  const state = ensureFeatureExists(name);

  state[name].failCount += 1;
  state[name].lastError = err?.message || String(err);
  state[name].lastErrorAt = new Date().toISOString();

  writeState(state);
  return state[name];
}

function disableFeature(name, reason = "Disabled manually") {
  const state = ensureFeatureExists(name);

  state[name].enabled = false;
  state[name].pausedReason = reason;

  writeState(state);
  return state[name];
}

function enableFeature(name) {
  const state = ensureFeatureExists(name);

  state[name].enabled = true;
  state[name].failCount = 0;
  state[name].lastError = null;
  state[name].lastErrorAt = null;
  state[name].pausedReason = null;
  state[name].lastSuccessAt = new Date().toISOString();

  writeState(state);
  return state[name];
}

function resetFeature(name) {
  const state = ensureFeatureExists(name);
  state[name] = createDefault();
  writeState(state);
  return state[name];
}

module.exports = {
  createDefault,
  getAllFeatures,
  getFeature,
  isFeatureEnabled,
  registerSuccess,
  registerFailure,
  disableFeature,
  enableFeature,
  resetFeature,
};