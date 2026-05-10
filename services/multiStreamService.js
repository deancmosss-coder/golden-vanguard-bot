const fs = require("fs");
const path = require("path");

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

const logger = require("./logger");
const creatorStore = require("./creatorStore");

const MULTISTREAM_STORE_PATH = path.join(
  __dirname,
  "..",
  "data",
  "multistreams.json"
);

const STREAM_ALERT_STORE_PATH = path.join(
  __dirname,
  "..",
  "data",
  "streamAlerts.json"
);

function defaultStore() {
  return {
    activeMultiStreams: [],
  };
}

function ensureStoreFile() {
  const dir = path.dirname(MULTISTREAM_STORE_PATH);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(MULTISTREAM_STORE_PATH)) {
    fs.writeFileSync(
      MULTISTREAM_STORE_PATH,
      JSON.stringify(defaultStore(), null, 2),
      "utf8"
    );
  }
}

function readStore() {
  ensureStoreFile();

  try {
    const raw = fs.readFileSync(MULTISTREAM_STORE_PATH, "utf8");
    const parsed = JSON.parse(raw);

    return {
      activeMultiStreams: Array.isArray(parsed.activeMultiStreams)
        ? parsed.activeMultiStreams
        : [],
    };
  } catch (err) {
    logger.error("