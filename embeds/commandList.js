const { EmbedBuilder } = require("discord.js");

// 🟡 PLAYER COMMANDS
function getPlayerCommandsEmbed() {
  return new EmbedBuilder()
    .setColor(0xD4AF37)
    .setTitle("🟡 GOLDEN VANGUARD — COMMAND LIST")
    .setDescription("This is the list of commands that any user can use")

    .addFields(
      {
        name: "🪖 Squad System",
        value:
          "`/asktoplay` — (create a squad recruitment post)\n" +
          "`/join` — (join a squad)\n" +
          "`/leave` — (leave a squad)\n" +
          "`/session` — (view squad)",
      },
      {
        name: "🛰️ War System",
        value:
          "`/war` — (view major order)\n" +
          "`/warstatus` — (planet progress)",
      },
      {
        name: "📊 Player Stats",
        value:
          "`/stats` — (your stats)\n" +
          "`/rank` — (your rank)\n" +
          "`/leaderboard` — (top players)",
      },
      {
        name: "📝 Reports",
        value:
          "`/aar` — (submit report)\n" +
          "`/missions` — (recent ops)",
      },
      {
        name: "📡 Server Tools",
        value:
          "`/server` — (report issue)\n" +
          "`/ping` — (find squad)",
      }
    )

    .setFooter({
      text: "Done reading? Head to #squad-lfg to deploy.",
    });
}

// 🔴 ADMIN COMMANDS
function getAdminCommandsEmbed() {
  return new EmbedBuilder()
    .setColor(0xE74C3C)
    .setTitle("🔴 HIGH COMMAND — ADMIN COMMANDS")
    .setDescription("Restricted to High Command & Moderators")

    .addFields(
      {
        name: "🧠 Rank Management",
        value:
          "`/promote` — promote user\n" +
          "`/demote` — demote user\n" +
          "`/assign` — assign division",
      },
      {
        name: "🗺️ War Control",
        value:
          "`/warupdate` — refresh war board\n" +
          "`/resetleaderboard` — reset stats",
      },
      {
        name: "🧾 Moderation",
        value:
          "`/warn` — warn user\n" +
          "`/mute` — mute user\n" +
          "`/kick` — kick user\n" +
          "`/ban` — ban user",
      },
      {
        name: "🛠️ System Tools",
        value:
          "`/fixsession` — fix session\n" +
          "`/log` — log entry",
      }
    );
}

module.exports = {
  getPlayerCommandsEmbed,
  getAdminCommandsEmbed,
};