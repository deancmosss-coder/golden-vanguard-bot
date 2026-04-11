// =========================
// services/featureVersionService.js
// FEATURE VERSION HISTORY + SNAPSHOTS
// =========================

const fs = require("fs");
const path = require("path");

const DATA_PATH = path.join(__dirname, "..", "data", "featureVersions.json");

function defaultState() {
  return {
    features: {},
  };
}

function defaultFeatureRecord() {
  return {
    currentVersion: "1.0.0",
    history: [],
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

    if (parsed?.features && typeof parsed.features === "object") {
      base.features = parsed.features;
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

function sanitiseFeature(feature) {
  return String(feature || "").trim();
}

function ensureFeature(feature) {
  const clean = sanitiseFeature(feature);
  if (!clean) {
    throw new Error("Invalid feature name.");
  }

  const state = readState();

  if (!state.features[clean]) {
    state.features[clean] = defaultFeatureRecord();
    writeState(state);
  }

  return { state, feature: clean };
}

function normaliseVersion(version) {
  const clean = String(version || "").trim();
  if (!clean) return "1.0.0";
  return clean;
}

function bumpPatch(version) {
  const parts = normaliseVersion(version)
    .split(".")
    .map((x) => Number(x));

  const major = Number.isFinite(parts[0]) ? parts[0] : 1;
  const minor = Number.isFinite(parts[1]) ? parts[1] : 0;
  const patch = Number.isFinite(parts[2]) ? parts[2] : 0;

  return `${major}.${minor}.${patch + 1}`;
}

function getFeatureRecord(feature) {
  const { state, feature: clean } = ensureFeature(feature);
  return state.features[clean];
}

function getCurrentVersion(feature) {
  const record = getFeatureRecord(feature);
  return record.currentVersion || "1.0.0";
}

function listCurrentVersions() {
  const state = readState();

  return Object.entries(state.features)
    .map(([feature, record]) => ({
      feature,
      currentVersion: record?.currentVersion || "1.0.0",
      historyCount: Array.isArray(record?.history) ? record.history.length : 0,
    }))
    .sort((a, b) => a.feature.localeCompare(b.feature));
}

function getFeatureHistory(feature, limit = 15) {
  const record = getFeatureRecord(feature);
  const max = Math.max(1, Math.min(Number(limit) || 15, 50));
  return Array.isArray(record.history) ? record.history.slice(0, max) : [];
}

function setCurrentVersion(feature, version) {
  const { state, feature: clean } = ensureFeature(feature);
  const next = normaliseVersion(version);

  state.features[clean].currentVersion = next;
  writeState(state);

  return state.features[clean];
}

function createSnapshot({
  feature,
  version,
  stage = "live",
  reviewId = null,
  actor = "Unknown",
  notes = "",
  sourceAction = "manual",
}) {
  const { state, feature: clean } = ensureFeature(feature);
  const nextVersion = normaliseVersion(version);

  state.features[clean].currentVersion = nextVersion;
  state.features[clean].history = Array.isArray(state.features[clean].history)
    ? state.features[clean].history
    : [];

  state.features[clean].history.unshift({
    id: `VER-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    version: nextVersion,
    stage,
    reviewId,
    actor,
    notes: String(notes || ""),
    sourceAction,
    createdAt: new Date().toISOString(),
  });

  state.features[clean].history = state.features[clean].history.slice(0, 100);
  writeState(state);

  return state.features[clean].history[0];
}

function bumpFeaturePatch(feature, actor = "Unknown", notes = "") {
  const current = getCurrentVersion(feature);
  const next = bumpPatch(current);
  setCurrentVersion(feature, next);

  createSnapshot({
    feature,
    version: next,
    stage: "dev",
    actor,
    notes: notes || "Patch version bumped.",
    sourceAction: "bump_patch",
  });

  return next;
}

function getPreviousLiveSnapshot(feature) {
  const history = getFeatureHistory(feature, 100);

  const liveSnapshots = history.filter(
    (entry) => String(entry.stage || "").toLowerCase() === "live"
  );

  if (liveSnapshots.length < 2) return null;

  return liveSnapshots[1];
}

module.exports = {
  readState,
  writeState,
  bumpPatch,
  getFeatureRecord,
  getCurrentVersion,
  listCurrentVersions,
  getFeatureHistory,
  setCurrentVersion,
  createSnapshot,
  bumpFeaturePatch,
  getPreviousLiveSnapshot,
};