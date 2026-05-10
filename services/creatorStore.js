const fs = require("fs");
const path = require("path");

const DATA_PATH = path.join(
  __dirname,
  "..",
  "data",
  "creators.json"
);

function defaultStore() {
  return {
    creators: [],
    pendingApplications: [],
  };
}

function ensureStoreFile() {
  const dir = path.dirname(DATA_PATH);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(DATA_PATH)) {
    fs.writeFileSync(
      DATA_PATH,
      JSON.stringify(defaultStore(), null, 2),
      "utf8"
    );
  }
}

function readStore() {
  ensureStoreFile();

  try {
    const raw = fs.readFileSync(DATA_PATH, "utf8");
    const parsed = JSON.parse(raw);

    return {
      creators: Array.isArray(parsed.creators)
        ? parsed.creators
        : [],
      pendingApplications: Array.isArray(
        parsed.pendingApplications
      )
        ? parsed.pendingApplications
        : [],
    };
  } catch {
    return defaultStore();
  }
}

function writeStore(store) {
  ensureStoreFile();

  fs.writeFileSync(
    DATA_PATH,
    JSON.stringify(store, null, 2),
    "utf8"
  );
}

function getCreatorByUserId(discordUserId) {
  const store = readStore();

  return (
    store.creators.find(
      (creator) =>
        creator.discordUserId === discordUserId
    ) || null
  );
}

function getPendingApplicationByUserId(
  discordUserId
) {
  const store = readStore();

  return (
    store.pendingApplications.find(
      (application) =>
        application.discordUserId ===
        discordUserId
    ) || null
  );
}

function listCreators() {
  const store = readStore();
  return [...store.creators];
}

function listPendingApplications() {
  const store = readStore();
  return [...store.pendingApplications];
}

function upsertPendingApplication(
  application
) {
  const store = readStore();

  const existingIndex =
    store.pendingApplications.findIndex(
      (entry) =>
        entry.discordUserId ===
        application.discordUserId
    );

  const now = new Date().toISOString();

  const payload = {
    discordUserId:
      application.discordUserId,
    discordTag: application.discordTag,
    displayName: application.displayName,

    platformsRaw:
      application.platformsRaw || "",

    socialsRaw:
      application.socialsRaw || "",

    contentType:
      application.contentType || "",

    schedule:
      application.schedule || "",

    bio: application.bio || "",

    platforms: Array.isArray(
      application.platforms
    )
      ? application.platforms
      : [],

    socials: Array.isArray(
      application.socials
    )
      ? application.socials
      : [],

    status: "pending",

    createdAt:
      existingIndex >= 0
        ? store.pendingApplications[
            existingIndex
          ].createdAt || now
        : now,

    updatedAt: now,
  };

  if (existingIndex >= 0) {
    store.pendingApplications[
      existingIndex
    ] = payload;
  } else {
    store.pendingApplications.push(
      payload
    );
  }

  writeStore(store);

  return payload;
}

function approveApplication(
  discordUserId,
  approvedByUserId
) {
  const store = readStore();

  const application =
    store.pendingApplications.find(
      (entry) =>
        entry.discordUserId ===
        discordUserId
    );

  if (!application) {
    return {
      ok: false,
      reason: "Application not found.",
    };
  }

  const now = new Date().toISOString();

  const creator = {
    discordUserId:
      application.discordUserId,

    discordTag:
      application.discordTag,

    displayName:
      application.displayName,

    approved: true,

    alertsEnabled: true,

    liveNow: false,

    lastLiveAt: null,

    platformsRaw:
      application.platformsRaw || "",

    socialsRaw:
      application.socialsRaw || "",

    platforms: Array.isArray(
      application.platforms
    )
      ? application.platforms
      : [],

    socials: Array.isArray(
      application.socials
    )
      ? application.socials
      : [],

    contentType:
      application.contentType || "",

    schedule:
      application.schedule || "",

    bio: application.bio || "",

    approvedAt: now,

    approvedByUserId,

    createdAt:
      application.createdAt || now,

    updatedAt: now,
  };

  const existingCreatorIndex =
    store.creators.findIndex(
      (entry) =>
        entry.discordUserId ===
        discordUserId
    );

  if (existingCreatorIndex >= 0) {
    store.creators[
      existingCreatorIndex
    ] = {
      ...store.creators[
        existingCreatorIndex
      ],
      ...creator,
    };
  } else {
    store.creators.push(creator);
  }

  store.pendingApplications =
    store.pendingApplications.filter(
      (entry) =>
        entry.discordUserId !==
        discordUserId
    );

  writeStore(store);

  return {
    ok: true,
    creator,
  };
}

function updateCreatorProfile(
  discordUserId,
  updates
) {
  const store = readStore();

  const creatorIndex =
    store.creators.findIndex(
      (creator) =>
        creator.discordUserId ===
        discordUserId
    );

  if (creatorIndex < 0) {
    return {
      ok: false,
      reason: "Creator not found.",
    };
  }

  const existing =
    store.creators[creatorIndex];

  store.creators[creatorIndex] = {
    ...existing,

    platformsRaw:
      updates.platformsRaw ??
      existing.platformsRaw,

    socialsRaw:
      updates.socialsRaw ??
      existing.socialsRaw,

    contentType:
      updates.contentType ??
      existing.contentType,

    schedule:
      updates.schedule ??
      existing.schedule,

    bio:
      updates.bio ??
      existing.bio,

    platforms:
      updates.platforms ??
      existing.platforms,

    socials:
      updates.socials ??
      existing.socials,

    updatedAt:
      new Date().toISOString(),
  };

  writeStore(store);

  return {
    ok: true,
    creator:
      store.creators[creatorIndex],
  };
}

function setCreatorAlerts(
  discordUserId,
  enabled
) {
  const store = readStore();

  const creatorIndex =
    store.creators.findIndex(
      (creator) =>
        creator.discordUserId ===
        discordUserId
    );

  if (creatorIndex < 0) {
    return {
      ok: false,
      reason: "Creator not found.",
    };
  }

  store.creators[
    creatorIndex
  ].alertsEnabled = enabled;

  store.creators[
    creatorIndex
  ].updatedAt =
    new Date().toISOString();

  writeStore(store);

  return {
    ok: true,
    creator:
      store.creators[creatorIndex],
  };
}

function denyApplication(
  discordUserId
) {
  const store = readStore();

  const application =
    store.pendingApplications.find(
      (entry) =>
        entry.discordUserId ===
        discordUserId
    );

  if (!application) {
    return {
      ok: false,
      reason: "Application not found.",
    };
  }

  store.pendingApplications =
    store.pendingApplications.filter(
      (entry) =>
        entry.discordUserId !==
        discordUserId
    );

  writeStore(store);

  return {
    ok: true,
    application,
  };
}

function removeCreator(
  discordUserId
) {
  const store = readStore();

  const existing =
    store.creators.find(
      (creator) =>
        creator.discordUserId ===
        discordUserId
    );

  if (!existing) {
    return {
      ok: false,
      reason: "Creator not found.",
    };
  }

  store.creators =
    store.creators.filter(
      (creator) =>
        creator.discordUserId !==
        discordUserId
    );

  writeStore(store);

  return {
    ok: true,
    creator: existing,
  };
}

module.exports = {
  readStore,
  writeStore,
  getCreatorByUserId,
  getPendingApplicationByUserId,
  listCreators,
  listPendingApplications,
  upsertPendingApplication,
  approveApplication,
  updateCreatorProfile,
  setCreatorAlerts,
  denyApplication,
  removeCreator,
};