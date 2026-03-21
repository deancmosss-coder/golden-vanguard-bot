const { EmbedBuilder } = require("discord.js");

function getCommandListEmbed() {
  return new EmbedBuilder()
    .setColor(0xD4AF37)
    .setTitle("🟡 GOLDEN VANGUARD — COMMAND LIST")
    .setDescription("This is the list of commands that any user can use")

    .addFields({
      name: "🪖 Squad System",
      value:
        "`/asktoplay` — (create a squad recruitment post)\n" +
        "`/join` — (join a squad via button system)\n" +
        "`/leave` — (leave a squad/session)\n" +
        "`/session` — (view current squad details)",
    })

    .addFields({
      name: "🛰️ War System",
      value:
        "`/war` — (view current major order & war progress)\n" +
        "`/warstatus` — (see planet progress & faction control)",
    })

    .addFields({
      name: "📊 Player Stats",
      value:
        "`/stats` — (view your personal stats)\n" +
        "`/rank` — (check your current rank & progression)\n" +
        "`/leaderboard` — (view top players)",
    })

    .addFields({
      name: "📝 Reports & Logs",
      value:
        "`/aar` — (submit after action report)\n" +
        "`/missions` — (view recent operations)",
    })

    .addFields({
      name: "📡 Server Tools",
      value:
        "`/server` — (report a server issue)\n" +
        "`/ping` — (ping for squad / teammates)",
    })

    .addFields({
      name: "🔴 ADMIN / HIGH COMMAND",
      value:
        "`/promote` — (promote a user)\n" +
        "`/demote` — (demote a user)\n" +
        "`/assign` — (assign division)\n" +
        "`/warupdate` — (update war board)\n" +
        "`/resetleaderboard` — (reset stats)\n" +
        "`/warn` — (warn user)\n" +
        "`/mute` — (mute user)\n" +
        "`/kick` — (kick user)\n" +
        "`/ban` — (ban user)\n" +
        "`/fixsession` — (fix session)\n" +
        "`/log` — (log entry)",
    })

    .setFooter({
      text: "Done reading? Head to #squad-lfg to deploy.",
    });
}

module.exports = { getCommandListEmbed };