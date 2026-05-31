// =========================
// services/lfgNotificationService.js
// Handles:
// - creating missing game LFG ping roles
// - saving pingRoleId into askToPlayGames.json
// - notification settings panel buttons
// =========================

const fs = require("fs");
const path = require("path");

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

const CONFIG_PATH = path.join(__dirname, "../config/askToPlayGames.json");

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
        "Your game role gives you access to the game section.",
        "Your LFG role decides whether you get pinged when players are looking for teammates.",
        "",
        "Press a button to toggle that game's LFG pings on or off.",
      ].join("\n")
    )
    .setFooter({ text: "The Golden Vanguard" })
    .setTimestamp();
}

function buildNotificationRows() {
  const config = readConfig();
  const buttons = [];

  for (const [gameKey, game] of Object.entries(config)) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`lfg_notify:toggle:${gameKey}`)
        .setLabel(game.displayName)
        .setStyle(ButtonStyle.Secondary)
    );
  }

  const rows = [];

  for (let i = 0; i < buttons.length; i += 5) {
    rows.push(
      new ActionRowBuilder().addComponents(buttons.slice(i, i + 5))
    );
  }

  return rows;
}

async function postNotificationPanel(channel) {
  const guild = channel.guild;

  await ensureAllPingRoles(guild);

  return channel.send({
    embeds: [buildNotificationEmbed()],
    components: buildNotificationRows(),
  });
}

async function handleNotificationButton(interaction) {
  if (!interaction.isButton()) return false;
  if (!interaction.customId?.startsWith("lfg_notify:toggle:")) return false;

  const gameKey = interaction.customId.split(":")[2];
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
      content: `🔕 ${game.displayName} LFG pings disabled.`,
      flags: 64,
    });

    return true;
  }

  await member.roles.add(role);

  await interaction.reply({
    content: `🔔 ${game.displayName} LFG pings enabled.`,
    flags: 64,
  });

  return true;
}

module.exports = {
  ensurePingRole,
  ensureAllPingRoles,
  postNotificationPanel,
  handleNotificationButton,
};
