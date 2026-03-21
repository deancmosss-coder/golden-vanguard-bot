// =========================================
// deploy-commands.js (FULL, DEPLOYS ONLY REAL COMMANDS)
// =========================================
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { REST, Routes } = require("discord.js");

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID; // Application ID
const guildId = process.env.GUILD_ID;   // Server ID

if (!token || !clientId || !guildId) {
  console.error("❌ Missing env vars: DISCORD_TOKEN, CLIENT_ID, GUILD_ID");
  process.exit(1);
}

const commands = [];
const commandsPath = path.join(__dirname, "commands");

const commandFiles = fs.existsSync(commandsPath)
  ? fs.readdirSync(commandsPath).filter((file) => file.endsWith(".js"))
  : [];

for (const file of commandFiles) {
  const command = require(`./commands/${file}`);

  // ✅ Normal slash commands
  if (command?.data) {
    commands.push(command.data.toJSON());
  }

  // ✅ Admin slash commands (if you use adminData)
  if (command?.adminData) {
    commands.push(command.adminData.toJSON());
  }
}

const rest = new REST({ version: "10" }).setToken(token);

(async () => {
  try {
    console.log(`🚀 Deploying ${commands.length} command(s)...`);

    await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands }
    );

    console.log("✅ Commands deployed successfully.");
  } catch (error) {
    console.error("❌ Deployment failed:", error);
  }
})();