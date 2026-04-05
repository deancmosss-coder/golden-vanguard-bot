// services/logger.js
const fs = require("fs");
const path = require("path");

const LOG_DIR = path.join(__dirname, "..", "logs");
const ERROR_LOG = path.join(LOG_DIR, "errors.log");
const ACTIVITY_LOG = path.join(LOG_DIR, "activity.log");
const DEBUG_LOG = path.join(LOG_DIR, "debug.log");

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function stringifyMeta(meta) {
  if (!meta) return "";
  try {
    return JSON.stringify(meta, null, 2);
  } catch (err) {
    return String(meta);
  }
}

function buildLogEntry(level, message, meta) {
  const timestamp = new Date().toISOString();
  let entry = `[${timestamp}] [${level}] ${message}`;

  if (meta) {
    entry += `\n${stringifyMeta(meta)}`;
  }

  entry += "\n\n";
  return entry;
}

function appendToFile(filePath, entry) {
  ensureLogDir();
  fs.appendFileSync(filePath, entry, "utf8");
}

function info(message, meta = null) {
  const entry = buildLogEntry("INFO", message, meta);
  console.log(entry.trim());
  appendToFile(ACTIVITY_LOG, entry);
}

function warn(message, meta = null) {
  const entry = buildLogEntry("WARN", message, meta);
  console.warn(entry.trim());
  appendToFile(ACTIVITY_LOG, entry);
}

function debug(message, meta = null) {
  const entry = buildLogEntry("DEBUG", message, meta);
  console.log(entry.trim());
  appendToFile(DEBUG_LOG, entry);
}

function error(message, err = null, meta = null) {
  const payload = {
    ...(meta || {}),
  };

  if (err) {
    payload.errorMessage = err.message || String(err);
    payload.stack = err.stack || null;
    payload.name = err.name || null;
  }

  const entry = buildLogEntry("ERROR", message, payload);
  console.error(entry.trim());
  appendToFile(ERROR_LOG, entry);
}

function getLastLines(filePath, lineCount = 20) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split("\n");
    return lines.slice(-lineCount);
  } catch (err) {
    return [`Failed to read log file: ${err.message}`];
  }
}

function getErrorLogPath() {
  ensureLogDir();
  return ERROR_LOG;
}

function getActivityLogPath() {
  ensureLogDir();
  return ACTIVITY_LOG;
}

function getDebugLogPath() {
  ensureLogDir();
  return DEBUG_LOG;
}

module.exports = {
  info,
  warn,
  debug,
  error,
  getLastLines,
  getErrorLogPath,
  getActivityLogPath,
  getDebugLogPath,
};