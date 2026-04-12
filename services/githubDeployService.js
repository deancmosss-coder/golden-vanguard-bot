const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { EmbedBuilder } = require("discord.js");

const logger = require("./logger");
const { sendAlert } = require("./alertService");
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

function getEntryById(entryId) {
  const state = readState();
  const history = Array.isArray(state.history) ? state.history : [];

  return (
    history.find((item) => item?.id === entryId) ||
    (state.lastDeployment?.id === entryId ? state.lastDeployment : null) ||
    (state.lastOperation?.id === entryId ? state.lastOperation : null) ||
    null
  );
}

function updateEntryById(entryId, updates = {}) {
  const state = readState();
  const history = Array.isArray(state.history) ? state.history : [];
  const existing =
    history.find((item) => item?.id === entryId) ||
    (state.lastDeployment?.id === entryId ? state.lastDeployment : null) ||
    (state.lastOperation?.id === entryId ? state.lastOperation : null);

  if (!existing) {
    return null;
  }

  const next = {
    ...existing,
    ...updates,
    restart: {
      ...(existing.restart || {}),
      ...(updates.restart || {}),
    },
    scan: updates.scan === undefined ? existing.scan || null : updates.scan,
    updatedAt: new Date().toISOString(),
  };

  upsertHistory(state, next);

  if (state.lastOperation?.id === entryId || next.action === "deploy") {
    state.lastOperation = next;
  }

  if (state.lastDeployment?.id === entryId || next.action === "deploy") {
    state.lastDeployment = next;
  }

  if (state.pendingDeployment?.id === entryId) {
    state.pendingDeployment = next.status === "pending_restart" ? next : null;
  }

  writeState(state);
  return next;
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

function attachOperation(error, operation) {
  error.operation = operation;
  return error;
}

function getRemoteRef(config) {
  return `refs/remotes/${config.remote}/${config.branch}`;
}

function parseCommit(stdout) {
  const lines = String(stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) return null;

  return {
    hash: lines[0] || null,
    shortHash: lines[1] || null,
    subject: lines[2] || null,
    committedAt: lines[3] || null,
  };
}

function parseDirtyFiles(stdout) {
  return String(stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseAheadBehind(stdout) {
  const parts = String(stdout || "0 0")
    .trim()
    .split(/\s+/)
    .map((part) => Number(part) || 0);

  return {
    ahead: parts[0] || 0,
    behind: parts[1] || 0,
  };
}

function buildBlockers(status, config, options = {}) {
  const force = Boolean(options.force);
  const blockers = {
    hard: [],
    soft: [],
  };

  if (status.detachedHead) {
    blockers.hard.push("Repository is in detached HEAD state.");
  }

  if (!status.branchMatchesExpected) {
    blockers.hard.push(
      `Repository is on branch ${status.currentBranch || "unknown"}, expected ${config.branch}.`
    );
  }

  if (Number(status.ahead || 0) > 0) {
    blockers.hard.push(
      `Repository is ahead of ${config.remote}/${config.branch} by ${status.ahead} commit(s).`
    );
  }

  if (status.dirty && !force && !config.allowDirty) {
    blockers.soft.push(
      `Repository has ${status.dirtyFiles.length} uncommitted change(s).`
    );
  }

  blockers.all = [...blockers.hard, ...blockers.soft];
  blockers.forceUsed = force;
  blockers.allowDirtyByConfig = config.allowDirty;

  return blockers;
}

function assertSafeToSync(status, config, options = {}) {
  const blockers = buildBlockers(status, config, options);

  if (blockers.all.length) {
    throw new GitHubDeployError(
      "Repository is not in a safe state for pull/deploy.",
      "UNSAFE_STATE",
      {
        blockers,
        status,
      }
    );
  }

  return blockers;
}

function runCommand(file, args, options = {}) {
  const cwd = options.cwd;
  const timeoutMs = Number(options.timeoutMs || 60000);
  const label = options.label || file;

  return new Promise((resolve, reject) => {
    const startedAt = Date.now();

    execFile(
      file,
      args,
      {
        cwd,
        timeout: timeoutMs,
        maxBuffer: 1024 * 1024,
        windowsHide: true,
      },
      (error, stdout = "", stderr = "") => {
        const result = {
          file,
          args,
          stdout: String(stdout || "").trim(),
          stderr: String(stderr || "").trim(),
          durationMs: Date.now() - startedAt,
          exitCode: typeof error?.code === "number" ? error.code : 0,
          signal: error?.signal || null,
        };

        if (error) {
          const code =
            error.code === "ENOENT"
              ? "COMMAND_NOT_FOUND"
              : error.killed
              ? "COMMAND_TIMEOUT"
              : "COMMAND_FAILED";

          const wrapped = new GitHubDeployError(
            `${label} failed.`,
            code,
            {
              commandResult: result,
              causeMessage: error.message,
            }
          );

          return reject(wrapped);
        }

        return resolve(result);
      }
    );
  });
}

function runGit(config, args, options = {}) {
  return runCommand("git", args, {
    cwd: config.repoPath,
    timeoutMs: options.timeoutMs || 90000,
    label: options.label || "git command",
  });
}

function runPm2(config, args, options = {}) {
  return runCommand("pm2", args, {
    cwd: config.repoPath,
    timeoutMs: options.timeoutMs || 90000,
    label: options.label || "pm2 command",
  });
}

async function readCommit(config, ref) {
  const result = await runGit(
    config,
    ["log", "-1", "--pretty=format:%H%n%h%n%s%n%cI", ref],
    {
      label: `git log ${ref}`,
    }
  );

  return parseCommit(result.stdout);
}

async function readChangedFiles(config, fromHash, toHash) {
  if (!fromHash || !toHash || fromHash === toHash) return [];

  const result = await runGit(
    config,
    ["diff", "--name-only", `${fromHash}..${toHash}`],
    {
      label: "git diff changed files",
    }
  );

  return String(result.stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, MAX_CHANGED_ITEMS);
}

async function readChangedCommits(config, fromHash, toHash) {
  if (!fromHash || !toHash || fromHash === toHash) return [];

  const result = await runGit(
    config,
    ["log", "--pretty=format:%h %s", `${fromHash}..${toHash}`],
    {
      label: "git log changed commits",
    }
  );

  return String(result.stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, MAX_CHANGED_ITEMS);
}

async function collectStatus(config, options = {}) {
  const fetch = options.fetch !== false;
  const remoteRef = getRemoteRef(config);

  const branchResult = await runGit(config, ["rev-parse", "--abbrev-ref", "HEAD"], {
    label: "git rev-parse --abbrev-ref HEAD",
  });

  const currentBranch = branchResult.stdout.trim();
  const localCommit = await readCommit(config, "HEAD");

  let fetchResult = null;
  if (fetch) {
    fetchResult = await runGit(config, ["fetch", "--prune", config.remote], {
      label: "git fetch",
      timeoutMs: 120000,
    });
  }

  const remoteCommit = await readCommit(config, remoteRef);

  const aheadBehindResult = await runGit(
    config,
    ["rev-list", "--left-right", "--count", `HEAD...${remoteRef}`],
    {
      label: "git rev-list ahead/behind",
    }
  );

  const dirtyResult = await runGit(
    config,
    ["status", "--porcelain", "--untracked-files=normal"],
    {
      label: "git status --porcelain",
    }
  );

  const { ahead, behind } = parseAheadBehind(aheadBehindResult.stdout);
  const dirtyFiles = parseDirtyFiles(dirtyResult.stdout);

  return {
    currentBranch,
    branchMatchesExpected: currentBranch === config.branch,
    detachedHead: currentBranch === "HEAD",
    ahead,
    behind,
    dirty: dirtyFiles.length > 0,
    dirtyFiles,
    localCommit,
    remoteCommit,
    fetchResult,
    aheadBehindResult,
    dirtyResult,
  };
}

async function syncRepository(config, options = {}) {
  const force = Boolean(options.force);
  const statusBefore = await collectStatus(config, { fetch: true });
  const blockers = assertSafeToSync(statusBefore, config, { force });

  if (!statusBefore.behind) {
    return {
      statusBefore,
      statusAfter: statusBefore,
      blockers,
      wasPulled: false,
      beforeCommit: statusBefore.localCommit,
      afterCommit: statusBefore.localCommit,
      changedFiles: [],
      changedCommits: [],
      pullResult: null,
    };
  }

  const pullResult = await runGit(
    config,
    ["pull", "--ff-only", config.remote, config.branch],
    {
      label: "git pull --ff-only",
      timeoutMs: 120000,
    }
  );

  const statusAfter = await collectStatus(config, { fetch: false });
  const beforeHash = statusBefore.localCommit?.hash;
  const afterHash = statusAfter.localCommit?.hash;

  return {
    statusBefore,
    statusAfter,
    blockers,
    wasPulled: beforeHash !== afterHash,
    beforeCommit: statusBefore.localCommit,
    afterCommit: statusAfter.localCommit,
    changedFiles: await readChangedFiles(config, beforeHash, afterHash),
    changedCommits: await readChangedCommits(config, beforeHash, afterHash),
    pullResult,
  };
}

async function checkStatus(options = {}) {
  const actor = options.actor || "Unknown";
  let config = null;

  try {
    config = getConfig();
    const status = await collectStatus(config, { fetch: true });
    const blockers = buildBlockers(status, config);

    const entry = persistEntry(
      createBaseEntry("status", actor, config, {
        status: blockers.all.length ? "blocked" : "success",
        message: blockers.all.length
          ? "Repository has issues that block safe pull/deploy."
          : "Repository status fetched successfully.",
        blockers,
        currentBranch: status.currentBranch,
        branchMatchesExpected: status.branchMatchesExpected,
        detachedHead: status.detachedHead,
        ahead: status.ahead,
        behind: status.behind,
        dirty: status.dirty,
        dirtyFiles: clampList(status.dirtyFiles),
        localCommit: status.localCommit,
        remoteCommit: status.remoteCommit,
        outputs: {
          fetch: serialiseCommandResult(status.fetchResult),
        },
      })
    );

    return entry;
  } catch (error) {
    const entry = persistEntry(createFailureEntry("status", actor, config, error));
    throw attachOperation(error, entry);
  }
}

async function pullLatest(options = {}) {
  const actor = options.actor || "Unknown";
  const force = Boolean(options.force);
  let config = null;

  try {
    config = getConfig();
    const sync = await syncRepository(config, { force });

    return persistEntry(
      createBaseEntry("pull", actor, config, {
        status: "success",
        message: sync.wasPulled
          ? "Latest code pulled from GitHub successfully."
          : "Repository was already up to date.",
        force,
        blockers: sync.blockers,
        currentBranch: sync.statusAfter.currentBranch,
        branchMatchesExpected: sync.statusAfter.branchMatchesExpected,
        detachedHead: sync.statusAfter.detachedHead,
        ahead: sync.statusAfter.ahead,
        behind: sync.statusAfter.behind,
        dirty: sync.statusAfter.dirty,
        dirtyFiles: clampList(sync.statusAfter.dirtyFiles),
        localCommit: sync.statusAfter.localCommit,
        remoteCommit: sync.statusAfter.remoteCommit,
        beforeCommit: sync.beforeCommit,
        afterCommit: sync.afterCommit,
        wasPulled: sync.wasPulled,
        changedFiles: clampList(sync.changedFiles),
        changedCommits: clampList(sync.changedCommits),
        outputs: {
          fetch: serialiseCommandResult(sync.statusBefore.fetchResult),
          pull: serialiseCommandResult(sync.pullResult),
        },
      })
    );
  } catch (error) {
    const entry = persistEntry(createFailureEntry("pull", actor, config, error));
    throw attachOperation(error, entry);
  }
}

async function beginDeployment(options = {}) {
  const actor = options.actor || "Unknown";
  const force = Boolean(options.force);
  let config = null;

  try {
    config = getConfig({ requirePm2: true });
    const sync = await syncRepository(config, { force });

    return persistEntry(
      createBaseEntry("deploy", actor, config, {
        status: "success",
        message: sync.wasPulled
          ? "Latest GitHub code pulled. PM2 restart scheduled. Your normal startup discovery scan will run after reboot."
          : "Repository already matched GitHub. PM2 restart scheduled. Your normal startup discovery scan will run after reboot.",
        force,
        blockers: sync.blockers,
        currentBranch: sync.statusAfter.currentBranch,
        branchMatchesExpected: sync.statusAfter.branchMatchesExpected,
        detachedHead: sync.statusAfter.detachedHead,
        ahead: sync.statusAfter.ahead,
        behind: sync.statusAfter.behind,
        dirty: sync.statusAfter.dirty,
        dirtyFiles: clampList(sync.statusAfter.dirtyFiles),
        localCommit: sync.statusAfter.localCommit,
        remoteCommit: sync.statusAfter.remoteCommit,
        beforeCommit: sync.beforeCommit,
        afterCommit: sync.afterCommit,
        wasPulled: sync.wasPulled,
        changedFiles: clampList(sync.changedFiles),
        changedCommits: clampList(sync.changedCommits),
        restart: {
          processName: config.pm2ProcessName,
          delayMs: config.restartDelayMs,
          scheduledAt: new Date().toISOString(),
          requestedAt: null,
          completedAt: null,
          failedAt: null,
          error: null,
        },
        scan: {
          mode: "startup",
          status: "pending",
          note: "The bot's normal startup discovery scan will run after PM2 restart.",
        },
        outputs: {
          fetch: serialiseCommandResult(sync.statusBefore.fetchResult),
          pull: serialiseCommandResult(sync.pullResult),
        },
      })
    );
  } catch (error) {
    const entry = persistEntry(createFailureEntry("deploy", actor, config, error));
    throw attachOperation(error, entry);
  }
}

function updatePendingDeployment(deploymentId, updates = {}) {
  const state = readState();
  const pending = state.pendingDeployment;

  if (!pending || pending.id !== deploymentId) {
    return null;
  }

  const next = {
    ...pending,
    ...updates,
    restart: {
      ...(pending.restart || {}),
      ...(updates.restart || {}),
    },
    scan: updates.scan === undefined ? pending.scan || null : updates.scan,
    updatedAt: new Date().toISOString(),
  };

  upsertHistory(state, next);
  state.lastOperation = next;
  state.pendingDeployment = next;
  writeState(state);

  return next;
}

function completePendingDeployment(deploymentId, updates = {}) {
  const state = readState();
  const pending = state.pendingDeployment;

  if (!pending || pending.id !== deploymentId) {
    return null;
  }

  const next = {
    ...pending,
    ...updates,
    restart: {
      ...(pending.restart || {}),
      ...(updates.restart || {}),
    },
    scan: updates.scan === undefined ? pending.scan || null : updates.scan,
    completedAt: updates.completedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  upsertHistory(state, next);
  state.lastOperation = next;
  state.lastDeployment = next;
  state.pendingDeployment = null;
  writeState(state);

  return next;
}

async function sendReleaseMessage(client, entry) {
  if (!RELEASE_CHANNEL_ID) {
    logger.warn("BOT_RELEASE_CHANNEL_ID is missing for GitHub deploy release posts");
    return false;
  }

  const channel = await client.channels.fetch(RELEASE_CHANNEL_ID).catch(() => null);
  if (!channel?.isTextBased?.()) {
    logger.warn("GitHub deploy release channel is unavailable", {
      channelId: RELEASE_CHANNEL_ID,
    });
    return false;
  }

  const embed = new EmbedBuilder()
    .setColor(
      entry.status === "success"
        ? 0x2ecc71
        : entry.status === "success_with_warnings"
        ? 0xf1c40f
        : 0xe74c3c
    )
    .setTitle("GitHub Deployment Result")
    .setDescription(
      entry.status === "success"
        ? "GitHub-to-server deployment completed successfully."
        : entry.status === "success_with_warnings"
        ? "GitHub-to-server deployment completed with warnings."
        : "GitHub-to-server deployment failed."
    )
    .addFields(
      { name: "Status", value: entry.status, inline: true },
      { name: "Actor", value: entry.actor || "Unknown", inline: true },
      {
        name: "Commit",
        value:
          entry.afterCommit?.shortHash && entry.afterCommit?.subject
            ? `${entry.afterCommit.shortHash} - ${entry.afterCommit.subject}`
            : "Unknown",
        inline: false,
      },
      {
        name: "Changed Files",
        value: entry.changedFiles?.length
          ? entry.changedFiles.slice(0, 10).join("\n")
          : "No changed files.",
        inline: false,
      },
      {
        name: "Discovery Scan",
        value: entry.scan?.note
          ? entry.scan.note
          : entry.scan?.error
          ? `Warning: ${entry.scan.error.message}`
          : `Created ${entry.scan?.createdCount || 0} review item(s).`,
        inline: false,
      }
    )
    .setTimestamp(new Date(entry.updatedAt || entry.createdAt || Date.now()));

  await channel.send({ embeds: [embed] }).catch(() => null);
  return true;
}

function scheduleRestart(client, deploymentId) {
  const deployment = getEntryById(deploymentId);
  if (!deployment) {
    return false;
  }

  const config = getConfig({ requirePm2: true });

  sendAlert(client, {
    title: "GitHub Deploy Queued",
    description: deployment.message,
    severity: "success",
    fields: [
      { name: "Deployment", value: deployment.id, inline: true },
      { name: "Actor", value: deployment.actor || "Unknown", inline: true },
      {
        name: "Commit",
        value:
          deployment.afterCommit?.shortHash && deployment.afterCommit?.subject
            ? `${deployment.afterCommit.shortHash} - ${deployment.afterCommit.subject}`
            : "Unknown",
        inline: false,
      },
      {
        name: "Discovery Scan",
        value: deployment.scan?.note || "Startup discovery scan will run after reboot.",
        inline: false,
      },
    ],
  }).catch(() => {});

  sendReleaseMessage(client, deployment).catch(() => {});

  logger.info("Scheduling GitHub deployment restart", {
    deploymentId,
    processName: config.pm2ProcessName,
    delayMs: config.restartDelayMs,
  });

  setTimeout(async () => {
    const current = updateEntryById(deploymentId, {
      restart: {
        requestedAt: new Date().toISOString(),
      },
    });

    if (!current) return;

    try {
      await runPm2(config, ["restart", config.pm2ProcessName], {
        label: `pm2 restart ${config.pm2ProcessName}`,
        timeoutMs: 120000,
      });

      updateEntryById(deploymentId, {
        completedAt: new Date().toISOString(),
        restart: {
          completedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      const failedEntry = updateEntryById(deploymentId, {
        status: "failed",
        message: "PM2 restart failed after pulling code from GitHub.",
        completedAt: new Date().toISOString(),
        restart: {
          failedAt: new Date().toISOString(),
          error: {
            message: error.message,
            code: error.code || "PM2_RESTART_FAILED",
            command: serialiseCommandResult(error.details?.commandResult),
          },
        },
      });

      logger.error("GitHub deployment restart failed", error, {
        deploymentId,
        processName: config.pm2ProcessName,
      });

      await sendAlert(client, {
        title: "GitHub Deploy Failed",
        description: "PM2 restart failed after pulling code from GitHub.",
        severity: "error",
        fields: [
          { name: "Deployment", value: deploymentId, inline: true },
          { name: "Process", value: config.pm2ProcessName, inline: true },
          {
            name: "Reason",
            value: compactText(error.message || "Unknown restart failure", 1024),
            inline: false,
          },
          {
            name: "Commit",
            value:
              failedEntry?.afterCommit?.shortHash && failedEntry?.afterCommit?.subject
                ? `${failedEntry.afterCommit.shortHash} - ${failedEntry.afterCommit.subject}`
                : "Unknown",
            inline: false,
          },
        ],
      }).catch(() => {});

      await sendReleaseMessage(client, failedEntry || current).catch(() => {});
    }
  }, config.restartDelayMs);

  return true;
}

async function resumePendingDeployment(client) {
  return {
    handled: false,
    scanPerformed: false,
    entry: null,
  };
}

module.exports = {
  GitHubDeployError,
  checkStatus,
  pullLatest,
  beginDeployment,
  scheduleRestart,
  resumePendingDeployment,
  getPendingDeployment,
  getLastDeployment,
  getHistory,
};
