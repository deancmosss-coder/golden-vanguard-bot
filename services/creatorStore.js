const fs = require("fs");
const path = require("path");

const DATA_PATH = path.join(__dirname, "..", "data", "creators.json");

function ensureStore() {
  if (!fs.existsSync(DATA_PATH)) {
    fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
    fs.writeFileSync(
      DATA_PATH,
      JSON.stringify({ creators: [], pendingApplications: [] }, null, 2),
      "utf8"
    );
  }

  const raw = fs.readFileSync(DATA_PATH, "utf8");
  let parsed;

  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    parsed = { creators: [], pendingApplications: [] };
  }

  if (!Array.isArray(parsed.creators)) parsed.creators = [];
  if (!Array.isArray(parsed.pendingApplications)) parsed.pendingApplications = [];

  return parsed;
}

function saveStore(store) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(store, null, 2), "utf8");
}

function getStore() {
  return ensureStore();
}

function getCreatorByUserId(discordUserId) {
  const store = ensureStore();
  return store.creators.find((c) => c.discordUserId === discordUserId) || null;
}

function getPendingApplicationByUserId(discordUserId) {
  const store = ensureStore();
  return (
    store.pendingApplications.find((a) => a.discordUserId === discordUserId) ||
    null
  );
}

function upsertPendingApplication(application) {
  const store = ensureStore();
  const existingIndex = store.pendingApplications.findIndex(
    (a) => a.discordUserId === application.discordUserId
  );

  if (existingIndex >= 0) {
    store.pendingApplications[existingIndex] = {
      ...store.pendingApplications[existingIndex],
      ...application,
      updatedAt: new Date().toISOString(),
    };
  } else {
    store.pendingApplications.push({
      ...application,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: "pending",
    });
  }

  saveStore(store);
  return getPendingApplicationByUserId(application.discordUserId);
}

function removePendingApplication(discordUserId) {
  const store = ensureStore();
  store.pendingApplications = store.pendingApplications.filter(
    (a) => a.discordUserId !== discordUserId
  );
  saveStore(store);
}

function approveApplication(discordUserId, approvedByUserId) {
  const store = ensureStore();
  const application = store.pendingApplications.find(
    (a) => a.discordUserId === discordUserId
  );

  if (!application) {
    return { ok: false, reason: "Application not found." };
  }

  const creator = {
    discordUserId: application.discordUserId,
    discordTag: application.discordTag,
    displayName: application.displayName,
    application: {
      platforms: application.platforms,
      socials: application.socials,
      contentType: application.contentType,
      schedule: application.schedule,
      bio: application.bio,
    },
    approved: true,
    alertsEnabled: true,
    liveNow: false,
    lastLiveKey: "",
    approvedAt: new Date().toISOString(),
    approvedByUserId,
    createdAt: application.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const creatorIndex = store.creators.findIndex(
    (c) => c.discordUserId === discordUserId
  );

  if (creatorIndex >= 0) {
    store.creators[creatorIndex] = {
      ...store.creators[creatorIndex],
      ...creator,
    };
  } else {
    store.creators.push(creator);
  }

  store.pendingApplications = store.pendingApplications.filter(
    (a) => a.discordUserId !== discordUserId
  );

  saveStore(store);

  return { ok: true, creator };
}

function denyApplication(discordUserId) {
  const store = ensureStore();
  const application = store.pendingApplications.find(
    (a) => a.discordUserId === discordUserId
  );

  if (!application) {
    return { ok: false, reason: "Application not found." };
  }

  store.pendingApplications = store.pendingApplications.filter(
    (a) => a.discordUserId !== discordUserId
  );

  saveStore(store);

  return { ok: true, application };
}

function listCreators() {
  const store = ensureStore();
  return [...store.creators];
}

module.exports = {
  getStore,
  getCreatorByUserId,
  getPendingApplicationByUserId,
  upsertPendingApplication,
  removePendingApplication,
  approveApplication,
  denyApplication,
  listCreators,
};