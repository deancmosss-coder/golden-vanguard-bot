// =========================
// services/stagingService.js
// DYNAMIC STAGING CONTROL
// =========================

const fs = require("fs");
const path = require("path");
const {
  getAllManagedFeatureNames,
} = require("./managedFeatureStore");

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
  const features = {};
  for (const feature of getAllManagedFeatureNames()) {
    features[feature] = createDefaultFeatureState();
  }

  return {
    features,
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

function getAvailableFeatures() {
  return getAllManagedFeatureNames();
}

function isValidFeature(feature) {
  return getAvailableFeatures().includes(String(feature || "").trim());
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

function getFeatureStage(feature) {
  if (!isValidFeature(feature)) {
    throw new Error(`Invalid feature: ${feature}`);
  }

  const state = readState();
  return state.features[feature] || createDefaultFeatureState();
}

function listFeatureStages() {
  const state = readState();

  return getAvailableFeatures().map((feature) => ({
    feature,
    ...(state.features[feature] || createDefaultFeatureState()),
  }));
}

function setFeatureStage(feature, stage, actor = "Unknown", notes = "", version = null) {
  if (!isValidFeature(feature)) {
    throw new Error(`Invalid feature: ${feature}`);
  }

  const normalStage = String(stage || "").trim().toLowerCase();
  if (!isValidStage(normalStage)) {
    throw new Error(`Invalid stage: ${stage}`);
  }

  const state = readState();
  const current = state.features[feature] || createDefaultFeatureState();

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

  state.features[feature] = next;

  addAuditEntry(state, {
    action: "set_stage",
    feature,
    stage: normalStage,
    actor,
    notes: String(notes || ""),
    version: next.version,
  });

  writeState(state);
  return next;
}

function setFeatureVersion(feature, version, actor = "Unknown", notes = "") {
  if (!isValidFeature(feature)) {
    throw new Error(`Invalid feature: ${feature}`);
  }

  const cleanVersion = String(version || "").trim();
  if (!cleanVersion) {
    throw new Error("Version cannot be empty.");
  }

  const state = readState();
  const current = state.features[feature] || createDefaultFeatureState();

  const next = {
    ...current,
    version: cleanVersion,
    notes: String(notes || current.notes || ""),
    updatedAt: new Date().toISOString(),
    updatedBy: actor,
  };

  state.features[feature] = next;

  addAuditEntry(state, {
    action: "set_version",
    feature,
    actor,
    version: cleanVersion,
    notes: String(notes || ""),
  });

  writeState(state);
  return next;
}

function setFeatureNotes(feature, notes, actor = "Unknown") {
  if (!isValidFeature(feature)) {
    throw new Error(`Invalid feature: ${feature}`);
  }

  const state = readState();
  const current = state.features[feature] || createDefaultFeatureState();

  const next = {
    ...current,
    notes: String(notes || ""),
    updatedAt: new Date().toISOString(),
    updatedBy: actor,
  };

  state.features[feature] = next;

  addAuditEntry(state, {
    action: "set_notes",
    feature,
    actor,
    notes: String(notes || ""),
    version: next.version,
    stage: next.stage,
  });

  writeState(state);
  return next;
}

function getRecentAudit(limit = 10) {
  const state = readState();
  const max = Math.max(1, Math.min(Number(limit) || 10, 25));
  return state.audit.slice(0, max);
}

module.exports = {
  VALID_STAGES,
  getAvailableFeatures,
  isValidFeature,
  isValidStage,
  getFeatureStage,
  listFeatureStages,
  setFeatureStage,
  setFeatureVersion,
  setFeatureNotes,
  getRecentAudit,
};