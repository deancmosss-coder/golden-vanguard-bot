// =========================================
// deploy-commands.js (FULL, DEPLOYS ALL)
// =========================================
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { REST, Routes } = require("discord.js");

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID; // Application ID
const guildId = process.env.GUILD_ID;   // Server ID

if (!token || !clientId || !guildId) {
  console.error("Missing env vars: DISCORD_TOKEN, CLIENT_ID, GUILD_ID");
  process.exit(1);
}

const commands = [];
const commandsPath = path.join(__dirname, "commands");

const commandFiles = fs.existsSync(commandsPath)
  ? fs.readdirSync(commandsPath).filter((file) => file.endsWith(".js"))
  : [];

for (const file of commandFiles) {
  const command = require(`./commands/${file}`);

  if (command?.data) commands.push(command.data.toJSON());
  if (command?.adminData) commands.push(command.adminData.toJSON());
}

const rest = new REST({ version: "10" }).setToken(token);

(async () => {
  try {
    console.log(`Deploying ${commands.length} command(s)…`);
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
      body: commands,
    });
    console.log("✅ Commands deployed.");
  } catch (error) {
    console.error(error);
  }
})();