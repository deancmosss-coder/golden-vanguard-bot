const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { EmbedBuilder } = require("discord.js");

const logger = require("./logger");
const { sendAlert } = require("./alertService");
const { scanForReviews } = require("./discoveryReviewService");
const { readJson, writeJson } = require("./jsonStore");

const STATE_PATH = path.join(__dirname, "..", "data", "githubDeployState.json");
const RELEASE_CHANNEL_ID = (process.env.BOT_RELEASE_CHANNEL_ID || "").trim();

const DEFAULT_REMOTE = "origin";
const DEFAULT_BRANCH = "main";
const DEFAULT_RESTART_DELAY_MS = 1500;
const MAX_HISTORY = 100;
const MAX_OUTPUT_LENGTH = 1800;
const MAX_CHANGED_ITEMS = 25;

class GitHubDeployError extends Error {
  constructor(message, code = "GITHUB_DEPLOY_ERROR", details = {}) {
    super(message);
    this.name = "GitHubDeployError";
    this.code = code;
    this.details = details;
  }
}

function createId(prefix = "GHDEPLOY") {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function compactText(value, maxLength = MAX_OUTPUT_LENGTH) {
  const clean = String(value || "").trim();
  if (!clean) return "";

  return clean.length > maxLength
    ? `${clean.slice(0, maxLength - 18)}\n...[truncated]`
    : clean;
}

function clampList(list, limit = MAX_CHANGED_ITEMS) {
  return Array.isArray(list) ? list.slice(0, limit) : [];
}

function defaultState() {
  return {
    lastOperation: null,
    lastDeployment: null,
    pendingDeployment: null,
    history: [],
  };
}

function readState() {
  const parsed = readJson(STATE_PATH, defaultState);
  const base = defaultState();

  return {
    ...base,
    ...(parsed || {}),
    lastOperation: parsed?.lastOperation || null,
    lastDeployment: parsed?.lastDeployment || null,
    pendingDeployment: parsed?.pendingDeployment || null,
    history: Array.isArray(parsed?.history) ? parsed.history : [],
  };
}

function writeState(state) {
  writeJson(STATE_PATH, {
    ...defaultState(),
    ...(state || {}),
    history: Array.isArray(state?.history) ? state.history.slice(0, MAX_HISTORY) : [],
  });
}

function upsertHistory(state, entry) {
  const history = Array.isArray(state.history) ? [...state.history] : [];
  const index = history.findIndex((item) => item?.id === entry.id);

  if (index >= 0) {
    history[index] = entry;
  } else {
    history.unshift(entry);
  }

  history.sort((a, b) => {
    const aTime = new Date(a?.updatedAt || a?.createdAt || 0).getTime();
    const bTime = new Date(b?.updatedAt || b?.createdAt || 0).getTime();
    return bTime - aTime;
  });

  state.history = history.slice(0, MAX_HISTORY);
}

function persistEntry(entry) {
  const next = {
    ...entry,
    updatedAt: new Date().toISOString(),
  };

  const state = readState();
  upsertHistory(state, next);
  state.lastOperation = next;

  if (next.action === "deploy" && next.status === "pending_restart") {
    state.pendingDeployment = next;
  }

  if (next.action === "deploy" && next.status !== "pending_restart") {
    if (state.pendingDeployment?.id === next.id) {
      state.pendingDeployment = null;
    }

    state.lastDeployment = next;
  }

  writeState(state);
  return next;
}

function getPendingDeployment() {
  return readState().pendingDeployment || null;
}

function getLastDeployment() {
  return readState().lastDeployment || null;
}

function getHistory(limit = 10) {
  const state = readState();
  const max = Math.max(1, Math.min(Number(limit) || 10, 25));
  return state.history.slice(0, max);
}

function validateIdentifier(name, value, pattern) {
  if (!pattern.test(value)) {
    throw new GitHubDeployError(`Invalid ${name}: ${value}`, "INVALID_CONFIG", {
      name,
      value,
    });
  }
}

function getConfig(options = {}) {
  const requirePm2 = Boolean(options.requirePm2);

  const repoPathRaw = String(process.env.GITHUB_DEPLOY_REPO_PATH || "").trim();
  const remote = String(process.env.GITHUB_DEPLOY_REMOTE || DEFAULT_REMOTE).trim();
  const branch = String(process.env.GITHUB_DEPLOY_BRANCH || DEFAULT_BRANCH).trim();
  const pm2ProcessName = String(process.env.GITHUB_PM2_PROCESS_NAME || "").trim();
  const allowDirty = /^true$/i.test(String(process.env.GITHUB_DEPLOY_ALLOW_DIRTY || "").trim());
  const restartDelayMs = Math.max(
    500,
    Number(process.env.GITHUB_DEPLOY_RESTART_DELAY_MS || DEFAULT_RESTART_DELAY_MS) ||
      DEFAULT_RESTART_DELAY_MS
  );

  if (!repoPathRaw) {
    throw new GitHubDeployError(
      "GITHUB_DEPLOY_REPO_PATH is missing from .env.",
      "MISSING_CONFIG"
    );
  }

  validateIdentifier("GITHUB_DEPLOY_REMOTE", remote, /^[A-Za-z0-9._/-]+$/);
  validateIdentifier("GITHUB_DEPLOY_BRANCH", branch, /^[A-Za-z0-9._/-]+$/);

  const repoPath = path.resolve(repoPathRaw);

  if (!fs.existsSync(repoPath)) {
    throw new GitHubDeployError(
      `Configured repo path does not exist: ${repoPath}`,
      "INVALID_CONFIG",
      { repoPath }
    );
  }

  if (!fs.existsSync(path.join(repoPath, ".git"))) {
    throw new GitHubDeployError(
      `Configured repo path is not a git repository: ${repoPath}`,
      "INVALID_CONFIG",
      { repoPath }
    );
  }

  if (requirePm2) {
    if (!pm2ProcessName) {
      throw new GitHubDeployError(
        "GITHUB_PM2_PROCESS_NAME is missing from .env.",
        "MISSING_CONFIG"
      );
    }

    validateIdentifier("GITHUB_PM2_PROCESS_NAME", pm2ProcessName, /^[A-Za-z0-9._:-]+$/);
  }

  return {
    repoPath,
    remote,
    branch,
    pm2ProcessName: pm2ProcessName || null,
    allowDirty,
    restartDelayMs,
  };
}

function serialiseCommandResult(result) {
  if (!result) return null;

  return {
    stdout: compactText(result.stdout),
    stderr: compactText(result.stderr),
    exitCode: Number.isFinite(result.exitCode) ? result.exitCode : 0,
    signal: result.signal || null,
    durationMs: Number(result.durationMs || 0),
  };
}

function createBaseEntry(action, actor, config, extra = {}) {
  return {
    id: createId(action === "deploy" ? "GHDEPLOY" : "GH"),
    action,
    actor,
    status: "success",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    repoPath: config?.repoPath || null,
    remote: config?.remote || null,
    expectedBranch: config?.branch || null,
    ...extra,
  };
}

function createFailureEntry(action, actor, config, error) {
  const details = error?.details || {};
  const status = details.blockers?.all?.length ? "blocked" : "failed";

  return createBaseEntry(action, actor, config, {
    status,
    message: error?.message || "GitHub deployment action failed.",
    code: error?.code || "GITHUB_DEPLOY_ERROR",
    blockers: details.blockers || null,
    currentBranch: details.status?.currentBranch || null,
    branchMatchesExpected: details.status?.branchMatchesExpected ?? null,
    detachedHead: details.status?.detachedHead ?? null,
    ahead: Number(details.status?.ahead || 0),
    behind: Number(details.status?.behind || 0),
    dirty: Boolean(details.status?.dirty),
    dirtyFiles: clampList(details.status?.dirtyFiles || []),
    localCommit: details.status?.localCommit || null,
    remoteCommit: details.status?.remoteCommit || null,
    outputs: {
      fetch: serialiseCommandResult(details.status?.fetchResult),
      command: serialiseCommandResult(details.commandResult),
    },
  });
}

i