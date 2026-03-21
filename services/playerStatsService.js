const fs = require("fs");
const path = require("path");

const STORE_PATH = path.join(__dirname, "..", "tracker_store.json");

function readStore() {
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
  } catch {
    return {};
  }
}

function writeStore(store) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

function ensurePlayer(store, userId) {
  store.playerStats = store.playerStats || {};

  if (!store.playerStats[userId]) {
    store.playerStats[userId] = {
      runs: 0,
      kills: 0,
      deaths: 0,
      accidentals: 0,
      wins: 0,
      losses: 0,
      totalScore: 0,
      enemies: {
        Terminids: 0,
        Automatons: 0,
        Illuminate: 0,
      },
    };
  }

  return store.playerStats[userId];
}

function recordRunStats(run) {
  const store = readStore();
  const player = ensurePlayer(store, run.loggerId);

  player.runs += 1;
  player.kills += Number(run.kills || 0);
  player.deaths += Number(run.deaths || 0);
  player.accidentals += Number(run.accidentals || 0);
  player.totalScore += Number(run.scoreAwarded || 0);

  if (run.mainObjective === "Yes") player.wins += 1;
  else player.losses += 1;

  if (player.enemies[run.enemy] !== undefined) {
    player.enemies[run.enemy] += Number(run.kills || 0);
  }

  writeStore(store);
}

function removeRunStats(run) {
  const store = readStore();
  const player = ensurePlayer(store, run.loggerId);

  player.runs -= 1;
  player.kills -= Number(run.kills || 0);
  player.deaths -= Number(run.deaths || 0);
  player.accidentals -= Number(run.accidentals || 0);
  player.totalScore -= Number(run.scoreAwarded || 0);

  if (run.mainObjective === "Yes") player.wins -= 1;
  else player.losses -= 1;

  if (player.enemies[run.enemy] !== undefined) {
    player.enemies[run.enemy] -= Number(run.kills || 0);
  }

  writeStore(store);
}

function getKD(player) {
  if (!player || player.deaths === 0) return player?.kills || 0;
  return (player.kills / player.deaths).toFixed(2);
}

function getWinRate(player) {
  const total = player.wins + player.losses;
  if (total === 0) return "0%";
  return `${Math.round((player.wins / total) * 100)}%`;
}

function getPlayerStats(userId) {
  const store = readStore();
  const player = store.playerStats?.[userId];

  if (!player) return null;

  return {
    ...player,
    kd: getKD(player),
    winRate: getWinRate(player),
  };
}

module.exports = {
  recordRunStats,
  removeRunStats,
  getPlayerStats,
};