const fs = require("fs");
const path = require("path");

function resolveValue(defaultValue) {
  return typeof defaultValue === "function" ? defaultValue() : defaultValue;
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readJson(filePath, defaultValue = {}) {
  try {
    if (!fs.existsSync(filePath)) {
      return resolveValue(defaultValue);
    }

    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return resolveValue(defaultValue);
  }
}

function writeJson(filePath, value) {
  ensureParentDir(filePath);
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

module.exports = {
  ensureParentDir,
  readJson,
  writeJson,
};
