// services/featureRegistry.js
const fs = require("fs");
const path = require("path");

const DATA_PATH = path.join(__dirname, "..", "data", "featureState.json");

function ensureFile() {
  if (!fs.existsSync(DATA_PATH)) {
    fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });

    const defaultState = {
      warboard: createDefault(),
      tracker: createDefault(),
      playerStats: createDefault(),
      askToPlay: createDefault(),
      orientation: createDefault(),
      voiceTracking: createDefault(),
      leaderboard: createDefault(),
    };

    fs.writeFileSync(DATA_PATH, JSON.stringify(defaultState, null, 2));
  }
}

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

function readState() {
  ensureFile();
  return JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
}

function writeState(state) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(state, null, 2));
}

function isFeatureEnabled(name) {
  const state = readState();
  return state[name]?.enabled !== false;
}

function registerSuccess(name) {
  const state = readState();
  state[name] = state[name] || createDefault();

  state[name].failCount = 0;
  state[name].lastSuccessAt = new Date().toISOString();

  writeState(state);
}

function registerFailure(name, err) {
  const state = readState();
  state[name] = state[name] || createDefault();

  state[name].failCount += 1;
  state[name].lastError = err?.message || String(err);
  state[name].lastErrorAt = new Date().toISOString();

  writeState(state);

  return state[name];
}

function disableFeature(name, reason) {
  const state = readState();
  state[name] = state[name] || createDefault();

  state[name].enabled = false;
  state[name].pausedReason = reason;

  writeState(state);
}

function enableFeature(name) {
  const state = readState();
  state[name] = createDefault();
  writeState(state);
}

module.exports = {
  isFeatureEnabled,
  registerSuccess,
  registerFailure,
  disableFeature,
  enableFeature,
};
