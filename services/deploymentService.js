// =========================
// services/deploymentService.js
// STRICT ADMIN DEPLOYMENT CONTROL
// =========================

const fs = require("fs");
const path = require("path");
const registry = require("./featureRegistry");

const AUDIT_PATH = path.join(__dirname, "..", "data", "deploymentAudit.json");

const VALID_FEATURES = [
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

function ensureAuditFile() {
  if (!fs.existsSync(AUDIT_PATH)) {
    fs.mkdirSync(path.dirname(AUDIT_PATH), { recursive: true });
    fs.writeFileSync(AUDIT_PATH, JSON.stringify({ entries: [] }, null, 2), "utf8");
  }
}

function readAudit() {
  ensureAuditFile();

  try {
    const raw = fs.readFileSync(AUDIT_PATH, "utf8");
    const parsed = JSON.parse(raw);

    return {
      entries: Array.isArray(parsed?.entries) ? parsed.entries : [],
    };
  } catch {
    return { entries: [] };
  }
}

function writeAudit(data) {
  fs.mkdirSync(path.dirname(AUDIT_PATH), { recursive: true });
  fs.writeFileSync(AUDIT_PATH, JSON.stringify(data, null, 2), "utf8");
}

function addAuditEntry(entry) {
  const audit = readAudit();

  audit.entries.unshift({
    id: `DEP-${Date.now()}`,
    createdAt: new Date().toISOString(),
    ...entry,
  });

  audit.entries = audit.entries.slice(0, 250);
  writeAudit(audit);

  return audit.entries[0];
}

function normaliseFeatureName(name) {
  return String(name || "").trim();
}

function isValidFeature(name) {
  return VALID_FEATURES.includes(normaliseFeatureName(name));
}

function getFeatureStatus(name) {
  if (!isValidFeature(name)) {
    throw new Error(`Invalid feature: ${name}`);
  }

  return registry.getFeature(name);
}

function listAllFeatureStatuses() {
  const all = registry.getAllFeatures();

  return VALID_FEATURES.map((feature) => ({
    feature,
    ...(all[feature] || registry.createDefault()),
  }));
}

function enableFeature(feature, actor = "Unknown", reason = "Enabled manually") {
  if (!isValidFeature(feature)) {
    throw new Error(`Invalid feature: ${feature}`);
  }

  const state = registry.enableFeature(feature);

  const audit = addAuditEntry({
    action: "enable",
    feature,
    actor,
    reason,
    stateAfter: state,
  });

  return { state, audit };
}

function disableFeature(feature, actor = "Unknown", reason = "Disabled manually") {
  if (!isValidFeature(feature)) {
    throw new Error(`Invalid feature: ${feature}`);
  }

  const state = registry.disableFeature(feature, reason);

  const audit = addAuditEntry({
    action: "disable",
    feature,
    actor,
    reason,
    stateAfter: state,
  });

  return { state, audit };
}

function resetFeature(feature, actor = "Unknown", reason = "Reset manually") {
  if (!isValidFeature(feature)) {
    throw new Error(`Invalid feature: ${feature}`);
  }

  const state = registry.resetFeature(feature);

  const audit = addAuditEntry({
    action: "reset",
    feature,
    actor,
    reason,
    stateAfter: state,
  });

  return { state, audit };
}

function getRecentAudit(limit = 10) {
  const audit = readAudit();
  return audit.entries.slice(0, Math.max(1, Math.min(Number(limit) || 10, 25)));
}

module.exports = {
  VALID_FEATURES,
  isValidFeature,
  getFeatureStatus,
  listAllFeatureStatuses,
  enableFeature,
  disableFeature,
  resetFeature,
  getRecentAudit,
};