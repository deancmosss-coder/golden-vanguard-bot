const cron = require("node-cron");

const { refreshWarBoard } = require("./refreshWarBoard");
const { postWarEffort } = require("./warEffortReport");
const { checkWarAlerts } = require("./highCommandAlerts");
const { postTopRankers } = require("./postTopRankers");
const { postMedalHall } = require("./postMedalHall");

function startScheduler(client) {
  console.log("[SCHEDULER] Starting jobs...");

  // 🔄 WAR BOARD (every 5 minutes)
  cron.schedule("*/5 * * * *", async () => {
    console.log("[CRON] War Board Refresh");
    await refreshWarBoard(client);
  });

  // ⚠️ WAR ALERTS (every 10 minutes)
  cron.schedule("*/10 * * * *", async () => {
    console.log("[CRON] War Alerts Check");
    await checkWarAlerts(client);
  });

  // 📡 WAR EFFORT REPORT (every 30 minutes)
  cron.schedule("*/30 * * * *", async () => {
    console.log("[CRON] War Effort Report");
    await postWarEffort(client);
  });

  // 🏆 WEEKLY RESET + ANNOUNCEMENTS (Sunday 23:00 UK)
  cron.schedule("0 23 * * 0", async () => {
    console.log("[CRON] Weekly Results");

    await postTopRankers(client, "weekly");
    await postMedalHall(client);

    // OPTIONAL: reset weekly stats after posting
    try {
      const fs = require("fs");
      const path = require("path");
      const STORE = path.join(__dirname, "..", "tracker_store.json");

      const store = JSON.parse(fs.readFileSync(STORE, "utf8"));

      store.weekly = {
        players: {},
        divisions: {},
        enemies: {},
      };

      fs.writeFileSync(STORE, JSON.stringify(store, null, 2), "utf8");

      console.log("[CRON] Weekly reset complete");
    } catch (err) {
      console.error("[CRON] Weekly reset failed:", err.message);
    }
  });

  // 🏅 MONTHLY ANNOUNCEMENT (1st of month at 00:05)
  cron.schedule("5 0 1 * *", async () => {
    console.log("[CRON] Monthly Results");

    await postTopRankers(client, "monthly");
  });

  console.log("[SCHEDULER] All jobs running");
}

module.exports = { startScheduler };