// =========================
// loaders/commandLoader.js
// Loads slash commands from ./commands
// =========================

const fs = require("fs");
const path = require("path");

const logger = require("../services/logger");

function loadCommands() {
  const commands = new Map();
  const commandsPath = path.join(__dirname, "..", "commands");

  if (!fs.existsSync(commandsPath)) {
    logger.warn("Commands folder not found", {
      location: "loaders/commandLoader.js",
      commandsPath,
    });

    return commands;
  }

  const files = fs
    .readdirSync(commandsPath)
    .filter((file) => file.endsWith(".js"));

  for (const file of files) {
    try {
      const mod = require(path.join(commandsPath, file));

      if (mod?.data?.name && typeof mod.execute === "function") {
        commands.set(mod.data.name, mod);
      }

      if (mod?.adminData?.name && typeof mod.executeAdmin === "function") {
        commands.set(mod.adminData.name, {
          execute: mod.executeAdmin,
        });
      }
    } catch (err) {
      logger.error("Failed to load command file", err, {
        location: "loaders/commandLoader.js",
        file,
      });
    }
  }

  logger.info(`Loaded ${commands.size} slash command(s) from ./commands`);

  return commands;
}

module.exports = {
  loadCommands,
};
