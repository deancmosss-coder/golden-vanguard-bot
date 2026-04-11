// =========================
// services/managedFeatureStore.js
// CORE + DYNAMIC FEATURE STORE
// =========================

const fs = require("fs");
const path = require("path");

const DATA_PATH = path.join(__dirname, "..", "data", "managedFeatures.json");

const CORE_FEATURES = [
  "warboard",
  "tracker",
  "playerStats",
  "askToPlay",
  "orientation",
  "voiceTracking",
  "leaderboard",
  "commands",
  "enlistment",
  "registry",
];

function createDefault() {
  const features = {};

  for (const feature of CORE_FEATURES) {
    features[feature] = {
      name: feature,
      approved: true,
      source: "core",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      notes: "Core managed feature",
    };
  }

  return {
    features,
  };
}

function ensureFile() {
  if (!fs.existsSync(DATA_PATH)) {
    fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
    fs.writeFileSync(DATA_PATH, JSON.stringify(createDefault(), null, 2), "utf8");
  }
}

function readState() {
  ensureFile();

  try {
    const raw = fs.readFileSync(DATA_PATH, "utf8");
    const parsed = JSON.parse(raw);
    const base = createDefault();

    if (parsed?.features && typeof parsed.features === "object") {
      for (const [name, value] of Object.entries(parsed.features)) {
        base.features[name] = {
          ...base.features[name],
          ...(value || {}),
          name,
        };
      }
    }

    return base;
  } catch {
    return createDefault();
  }
}

function writeState(state) {
  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify(state, null, 2), "utf8");
}

function sanitiseFeatureName(name) {
  return String(name || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .replace(/^[^a-zA-Z]+/, "");
}

function getAllManagedFeatureNames() {
  const state = readState();
  return Object.keys(state.features).sort((a, b) => a.localeCompare(b));
}

function getAllManagedFeatures() {
  const state = readState();
  return Object.values(state.features).sort((a, b) => a.name.localeCompare(b.name));
}

function hasManagedFeature(name) {
  const clean = sanitiseFeatureName(name);
  if (!clean) return false;

  const state = readState();
  return Boolean(state.features[clean]);
}

function getManagedFeature(name) {
  const clean = sanitiseFeatureName(name);
  if (!clean) return null;

  const state = readState();
  return state.features[clean] || null;
}

function addManagedFeature(name, meta = {}) {
  const clean = sanitiseFeatureName(name);
  if (!clean) {
    throw new Error("Invalid feature name.");
  }

  const state = readState();
  const now = new Date().toISOString();

  state.features[clean] = {
    name: clean,
    approved: true,
    source: meta.source || "discovered",
    createdAt: state.features[clean]?.createdAt || now,
    updatedAt: now,
    notes: meta.notes || state.features[clean]?.notes || "",
    detectedFrom: meta.detectedFrom || state.features[clean]?.detectedFrom || null,
    detectedType: meta.detectedType || state.features[clean]?.detectedType || null,
  };

  writeState(state);
  return state.features[clean];
}

module.exports = {
  CORE_FEATURES,
  sanitiseFeatureName,
  getAllManagedFeatureNames,
  getAllManagedFeatures,
  hasManagedFeature,
  getManagedFeature,
  addManagedFeature,
};