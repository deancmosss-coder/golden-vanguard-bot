// =========================
// services/deploymentService.js
// DYNAMIC DEPLOYMENT CONTROL
// =========================

const fs = require("fs");
const path = require("path");
const registry = require("./featureRegistry");
const { getAllManagedFeatureNames } = require("./managedFeatureStore");

const AUDIT_PATH = path.join(__dirname, "..", "data", "deploymentAudit.json");

function ensureAuditFile() {
  if (!fs.existsSync(AUDIT_PATH)) {
    fs.mkdirSync(path.dirname(AUDIT_PATH), { recursive: true });
    fs.writeFileSync(AUDIT_PATH, JSON.stringify({ audit: [] }, null, 2), "utf8");
  }
}

function readAudit() {
  ensureAuditFile();

  try {
    const raw = fs.readFileSync(AUDIT_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.audit) ? parsed.audit : [];
  } catch {
    return [];
  }
}

function writeAudit(entries) {
  fs.mkdirSync(path.dirname(AUDIT_PATH), { recursive: true });
  fs.writeFileSync(AUDIT_PATH, JSON.stringify({ audit: entries }, null, 2), "utf8");
}

function addAuditEntry(entry) {
  const audit = readAudit();
  audit.unshift({
    id: `DEPLOY-${Date.now()}`,
    createdAt: new Date().toISOString(),
    ...entry,
  });

  writeAudit(audit.slice(0, 250));
}

function getAvailableFeatures() {
  return getAllManagedFeatureNames();
}

function getFeatureStatus(feature) {
  return registry.getFeature(feature);
}

function listAllFeatureStatuses() {
  return getAvailableFeatures().map((feature) => ({
    feature,
    ...registry.getFeature(feature),
  }));
}

function enableFeature(feature, actor = "Unknown", reason = "") {
  const state = registry.enableFeature(feature);

  addAuditEntry({
    action: "enable",
    feature,
    actor,
    reason,
  });

  return { state };
}

function disableFeature(feature, actor = "Unknown", reason = "") {
  const state = registry.disableFeature(feature, reason || "Disabled manually");

  addAuditEntry({
    action: "disable",
    feature,
    actor,
    reason,
  });

  return { state };
}

function resetFeature(feature, actor = "Unknown", reason = "") {
  const state = registry.resetFeature(feature);

  addAuditEntry({
    action: "reset",
    feature,
    actor,
    reason,
  });

  return { state };
}

function getRecentAudit(limit = 10) {
  const audit = readAudit();
  const max = Math.max(1, Math.min(Number(limit) || 10, 25));
  return audit.slice(0, max);
}

module.exports = {
  getAvailableFeatures,
  getFeatureStatus,
  listAllFeatureStatuses,
  enableFeature,
  disableFeature,
  resetFeature,
  getRecentAudit,
};