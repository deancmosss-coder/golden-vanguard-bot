// services/featureRegistry.js
const fs = require("fs");
const path = require("path");
const logger = require("./logger");

const DATA_DIR = path.join(__dirname, "..", "data");
const STATE_PATH = path.join(DATA_DIR, "featureState.json");

const DEFAULT_STATE = {
  warboard: {
    enabled: true,
    failCount: 0,
    lastError: null,
    lastErrorAt: null,
    lastSuccessAt: null,
    pausedReason: null,
  },
  tracker: {
    enabled: true,
    failCount: 0,
    lastError: null,
    lastErrorAt: null,
    lastSuccessAt: null,
    pausedReason: null,
  },
  playerStats: {
    enabled: true,
    failCount: 0,
    lastError: null,
    lastErrorAt: null,
    lastSuccessAt: null,
    pausedReason: null,
  },
  askToPlay: {
    enabled: true,
    failCount: 0,
    lastError: null,
    lastErrorAt: null,
    lastSuccessAt: null,
    pausedReason: null,
  },
  orientation: {
    enabled: true,
    failCount: 0,
    lastError: null,
    lastErrorAt: null,
    lastSuccessAt: null,
    pausedReason: null,
  },
  voiceTracking: {
    enabled: true,
    failCount: 0,
    lastError: null,
    lastErrorAt: null,
    lastSuccessAt: null,
    pausedReason: null,
  },
  leaderboard: {
    enabled: true,
    failCount: 0,
    lastError: null,
    lastErrorAt: null,
    lastSuccessAt: null,
    pausedReason: null,
  },
};

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function cloneDefault() {
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

function buildFeatureState(existing = {}) {
  return {
    enabled: existing.enabled ?? true,
    failCount: existing.failCount ?? 0,
    lastError: existing.lastError ?? null,
    lastErrorAt: existing.lastErrorAt ?? null,
    lastSuccessAt: existing.lastSuccessAt ?? null,
    pausedReason: existing.pausedReason ?? null,
  };
}

function mergeState(existing = {}) {
  const base = cloneDefault();

  for (const [featureName, featureState] of Object.entries(existing || {})) {
    base[featureName] = buildFeatureState(featureState);
  }

  return base;
}

function readState() {
  try {
    ensureDataDir();

    if (!fs.existsSync(STATE_PATH)) {
      const initial = cloneDefault();
      fs.writeFileSync(STATE_PATH, JSON.stringify(initial, null, 2), "utf8");
      return initial;
    }

    const raw = fs.readFileSync(STATE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return mergeState(parsed);
  } catch (err) {
    logger.error("Failed to read feature state", err, {
      location: "featureRegistry.readState",
    });
    return cloneDefault();
  }
}

function writeState(state) {
  try {
    ensureDataDir();
    fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), "utf8");
  } catch (err) {
    logger.error("Failed to write feature state", err, {
      location: "featureRegistry.writeState",
    });
  }
}

function ensureFeatureExists(featureName) {
  const state = readState();

  if (!state[featureName]) {
    state[featureName] = buildFeatureState();
    writeState(state);
  }

  return state;
}

function getAllFeatures() {
  return readState();
}

function getFeature(featureName) {
  const state = ensureFeatureExists(featureName);
  return state[featureName];
}

function isFeatureEnabled(featureName) {
  return Boolean(getFeature(featureName).enabled);
}

function registerSuccess(featureName) {
  const state = ensureFeatureExists(featureName);

  state[featureName].failCount = 0;
  state[featureName].lastSuccessAt = new Date().toISOString();
  state[featureName].pausedReason = null;

  writeState(state);
  return state[featureName];
}

function registerFailure(featureName, err) {
  const state = ensureFeatureExists(featureName);

  state[featureName].failCount += 1;
  state[featureName].lastError = err?.message || String(err || "Unknown error");
  state[featureName].lastErrorAt = new Date().toISOString();

  writeState(state);
  return state[featureName];
}

function disableFeature(featureName, reason = "Disabled after repeated failures") {
  const state = ensureFeatureExists(featureName);

  state[featureName].enabled = false;
  state[featureName].pausedReason = reason;

  writeState(state);
  return state[featureName];
}

function enableFeature(featureName) {
  const state = ensureFeatureExists(featureName);

  state[featureName].enabled = true;
  state[featureName].failCount = 0;
  state[featureName].pausedReason = null;

  writeState(state);
  return state[featureName];
}

function resetFeature(featureName) {
  const state = readState();
  state[featureName] = buildFeatureState();
  writeState(state);
  return state[featureName];
}

module.exports = {
  getAllFeatures,
  getFeature,
  isFeatureEnabled,
  registerSuccess,
  registerFailure,
  disableFeature,
  enableFeature,
  resetFeature,
};
