// =========================
// services/stagingService.js
// DYNAMIC STAGING CONTROL
// PHASE 4: VERSION HELPERS
// =========================

const fs = require("fs");
const path = require("path");

const DATA_PATH = path.join(__dirname, "..", "data", "stagingState.json");
const VALID_STAGES = ["live", "staging", "dev", "frozen"];

function createDefaultFeatureState() {
  return {
    stage: "live",
    version: "1.0.0",
    notes: "",
    updatedAt: null,
    updatedBy: null,
    rolloutStatus: "stable",
  };
}

function createDefaultState() {
  return {
    features: {},
    audit: [],
  };
}

function ensureFile() {
  if (!fs.existsSync(DATA_PATH)) {
    fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
    fs.writeFileSync(DATA_PATH, JSON.stringify(createDefaultState(), null, 2), "utf8");
  }
}

function readState() {
  ensureFile();

  try {
    const raw = fs.readFileSync(DATA_PATH, "utf8");
    const parsed = JSON.parse(raw);
    const base = createDefaultState();

    if (parsed?.features && typeof parsed.features === "object") {
      for (const [feature, value] of Object.entries(parsed.features)) {
        base.features[feature] = {
          ...createDefaultFeatureState(),
          ...(value || {}),
        };
      }
    }

    if (Array.isArray(parsed?.audit)) {
      base.audit = parsed.audit;
    }

    return base;
  } catch {
    return createDefaultState();
  }
}

function writeState(state) {
  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify(state, null, 2), "utf8");
}

function isValidStage(stage) {
  return VALID_STAGES.includes(String(stage || "").trim().toLowerCase());
}

function addAuditEntry(state, entry) {
  state.audit.unshift({
    id: `STAGE-${Date.now()}`,
    createdAt: new Date().toISOString(),
    ...entry,
  });

  state.audit = state.audit.slice(0, 250);
}

function ensureFeature(feature) {
  const clean = String(feature || "").trim();
  if (!clean) throw new Error("Invalid feature.");

  const state = readState();
  if (!state.features[clean]) {
    state.features[clean] = createDefaultFeatureState();
    writeState(state);
  }

  return { state, feature: clean };
}

function getFeatureStage(feature) {
  const { state, feature: clean } = ensureFeature(feature);
  return state.features[clean];
}

function listFeatureStages() {
  const state = readState();

  return Object.entries(state.features)
    .map(([feature, value]) => ({
      feature,
      ...value,
    }))
    .sort((a, b) => a.feature.localeCompare(b.feature));
}

function setFeatureStage(feature, stage, actor = "Unknown", notes = "", version = null) {
  const normalStage = String(stage || "").trim().toLowerCase();
  if (!isValidStage(normalStage)) {
    throw new Error(`Invalid stage: ${stage}`);
  }

  const { state, feature: clean } = ensureFeature(feature);
  const current = state.features[clean];

  const next = {
    ...current,
    stage: normalStage,
    notes: String(notes || ""),
    updatedAt: new Date().toISOString(),
    updatedBy: actor,
    rolloutStatus:
      normalStage === "live"
        ? "stable"
        : normalStage === "staging"
        ? "testing"
        : normalStage === "dev"
        ? "in development"
        : "frozen",
  };

  if (version) {
    next.version = String(version).trim();
  }

  state.features[clean] = next;

  addAuditEntry(state, {
    action: "set_stage",
    feature: clean,
    stage: normalStage,
    actor,
    notes: String(notes || ""),
    version: next.version,
  });

  writeState(state);
  return next;
}

function setFeatureVersion(feature, version, actor = "Unknown", notes = "") {
  const cleanVersion = String(version || "").trim();
  if (!cleanVersion) {
    throw new Error("Version cannot be empty.");
  }

  const { state, feature: clean } = ensureFeature(feature);
  const current = state.features[clean];

  const next = {
    ...current,
    version: cleanVersion,
    notes: String(notes || current.notes || ""),
    updatedAt: new Date().toISOString(),
    updatedBy: actor,
  };

  state.features[clean] = next;

  addAuditEntry(state, {
    action: "set_version",
    feature: clean,
    actor,
    version: cleanVersion,
    notes: String(notes || ""),
  });

  writeState(state);
  return next;
}

function setFeatureNotes(feature, notes, actor = "Unknown") {
  const { state, feature: clean } = ensureFeature(feature);
  const current = state.features[clean];

  const next = {
    ...current,
    notes: String(notes || ""),
    updatedAt: new Date().toISOString(),
    updatedBy: actor,
  };

  state.features[clean] = next;

  addAuditEntry(state, {
    action: "set_notes",
    feature: clean,
    actor,
    notes: String(notes || ""),
    version: next.version,
    stage: next.stage,
  });

  writeState(state);
  return next;
}

function bumpPatch(version) {
  const parts = String(version || "1.0.0")
    .split(".")
    .map((n) => Number(n));

  const major = Number.isFinite(parts[0]) ? parts[0] : 1;
  const minor = Number.isFinite(parts[1]) ? parts[1] : 0;
  const patch = Number.isFinite(parts[2]) ? parts[2] : 0;

  return `${major}.${minor}.${patch + 1}`;
}

function bumpFeaturePatchVersion(feature, actor = "Unknown", notes = "") {
  const current = getFeatureStage(feature);
  const nextVersion = bumpPatch(current.version || "1.0.0");
  return setFeatureVersion(feature, nextVersion, actor, notes || "Patch version bump");
}

function getRecentAudit(limit = 10) {
  const state = readState();
  const max = Math.max(1, Math.min(Number(limit) || 10, 25));
  return state.audit.slice(0, max);
}

module.exports = {
  VALID_STAGES,
  readState,
  writeState,
  isValidStage,
  getFeatureStage,
  listFeatureStages,
  setFeatureStage,
  setFeatureVersion,
  setFeatureNotes,
  bumpFeaturePatchVersion,
  getRecentAudit,
};