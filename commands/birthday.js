const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} = require("discord.js");

const birthdayConfig = require("../config/birthdayMessages.json");

const cooldowns = new Map();
const COOLDOWN_SECONDS = 60;

function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("birthday")
    .setDescription("Send a funny and kind birthday message to a member.")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("Who is celebrating their birthday?")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("message")
        .setDescription("Optional custom birthday message.")
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    const targetUser = interaction.options.getUser("user");
    const customMessage = interaction.options.getString("message");

    if (!interaction.guild) {
      return interaction.reply({
        content: "This command can only be used inside the server.",
        ephemeral: true,
      });
    }

    if (targetUser.bot) {
      return interaction.reply({
        content: "Bots do not age. They just collect errors and existential dread.",
        ephemeral: true,
      });
    }

    const cooldownKey = `${interaction.guild.id}:${interaction.user.id}`;
    const now = Date.now();
    const existingCooldown = cooldowns.get(cooldownKey);

    if (existingCooldown && now < existingCooldown) {
      const secondsLeft = Math.ceil((existingCooldown - now) / 1000);

      return interaction.reply({
        content: `Slow down birthday wizard. Try again in **${secondsLeft} seconds**.`,
        ephemeral: true,
      });
    }

    cooldowns.set(cooldownKey, now + COOLDOWN_SECONDS * 1000);

    const birthdayMessage =
      customMessage || pickRandom(birthdayConfig.messages);

    const birthdayGif = pickRandom(birthdayConfig.gifs);

    const embed = new EmbedBuilder()
      .setColor(0xffd700)
      .setTitle(`🎉 HAPPY BIRTHDAY ${targetUser.username}! 🎂`)
      .setDescription(
        [
          `${targetUser}`,
          "",
          birthdayMessage,
          "",
          "Everyone drop them some birthday love, Vanguard style 💛",
        ].join("\n")
      )
      .setImage(birthdayGif)
      .setFooter({
        text: `Birthday shoutout sent by ${interaction.user.username}`,
        iconURL: interaction.user.displayAvatarURL({ dynamic: true }),
      })
      .setTimestamp();

    await interaction.reply({
      content: `🎂 Birthday chaos has been delivered for ${targetUser}!`,
      ephemeral: true,
    });

    await interaction.channel.send({
      content: `${targetUser}`,
      embeds: [embed],
      allowedMentions: {
        users: [targetUser.id],
      },
    });
  },
};