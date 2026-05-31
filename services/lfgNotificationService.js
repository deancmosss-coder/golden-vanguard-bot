// =========================
// services/lfgNotificationService.js
// Dropdown LFG notification settings
// =========================

const fs = require("fs");
const path = require("path");

const {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} = require("discord.js");

const CONFIG_PATH = path.join(__dirname, "../config/askToPlayGames.json");

const SELECT_ID = "lfg_notify_select";

function readConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
}

function writeConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
}

function roleNameForGame(game) {
  return `${game.displayName} LFG`;
}

async function ensurePingRole(guild, gameKey, game) {
  if (game.pingRoleId) {
    const existing = guild.roles.cache.get(game.pingRoleId);
    if (existing) return existing;
  }

  const roleName = roleNameForGame(game);

  let role = guild.roles.cache.find((r) => r.name === roleName);

  if (!role) {
    role = await guild.roles.create({
      name: roleName,
      mentionable: true,
      reason: `Created LFG ping role for ${game.displayName}`,
    });
  }

  const config = readConfig();
  config[gameKey].pingRoleId = role.id;
  writeConfig(config);

  return role;
}

async function ensureAllPingRoles(guild) {
  const config = readConfig();

  for (const [gameKey, game] of Object.entries(config)) {
    await ensurePingRole(guild, gameKey, game);
  }

  return readConfig();
}

function buildNotificationEmbed() {
  return new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle("🔔 LFG Notification Settings")
    .setDescription(
      [
        "Choose which games you want **Ask-to-Play / LFG pings** for.",
        "",
        "**Game roles** give you access to game sections.",
        "**LFG roles** decide whether you get pinged when players are looking for teammates.",
        "",
        "Use the dropdown below to toggle notifications on or off.",
      ].join("\n")
    )
    .setFooter({ text: "The Golden Vanguard" })
    .setTimestamp();
}

function buildNotificationRows() {
  const config = readConfig();

  const options = Object.entries(config).slice(0, 25).map(([gameKey, game]) => ({
    label: game.displayName,
    value: gameKey,
    description: `Toggle ${game.displayName} LFG pings`,
  }));

  const menu = new StringSelectMenuBuilder()
    .setCustomId(SELECT_ID)
    .setPlaceholder("Choose a game to toggle LFG pings…")
    .addOptions(options);

  return [new ActionRowBuilder().addComponents(menu)];
}

async function postNotificationPanel(channel) {
  await ensureAllPingRoles(channel.guild);

  return channel.send({
    embeds: [buildNotificationEmbed()],
    components: buildNotificationRows(),
  });
}

async function handleNotificationInteraction(interaction) {
  if (!interaction.isStringSelectMenu()) return false;
  if (interaction.customId !== SELECT_ID) return false;

  const gameKey = interaction.values[0];
  const config = readConfig();
  const game = config[gameKey];

  if (!game) {
    await interaction.reply({
      content: "That game is no longer configured.",
      flags: 64,
    });
    return true;
  }

  const member = interaction.member;

  if (!member) {
    await interaction.reply({
      content: "Could not find your server profile.",
      flags: 64,
    });
    return true;
  }

  if (game.accessRoleId && !member.roles.cache.has(game.accessRoleId)) {
    await interaction.reply({
      content: `You need the **${game.displayName}** game role before enabling ${game.displayName} LFG pings.`,
      flags: 64,
    });
    return true;
  }

  const role = await ensurePingRole(interaction.guild, gameKey, game);

  if (member.roles.cache.has(role.id)) {
    await member.roles.remove(role);

    await interaction.reply({
      content: `🔕 **${game.displayName}** LFG pings disabled.`,
      flags: 64,
    });

    return true;
  }

  await member.roles.add(role);

  await interaction.reply({
    content: `🔔 **${game.displayName}** LFG pings enabled.`,
    flags: 64,
  });

  return true;
}

module.exports = {
  ensurePingRole,
  ensureAllPingRoles,
  postNotificationPanel,
  handleNotificationInteraction,
};
