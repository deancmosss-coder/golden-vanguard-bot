const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("division-panel")
    .setDescription("Post the Vanguard Division Terminal panel"),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle("🪖 VANGUARD DIVISION TERMINAL")
      .setDescription(
        [
          "Divisions represent different **Helldiver playstyles** within **The Golden Vanguard**.",
          "",
          "They are optional and simply highlight how you prefer to approach missions.",
          "",
          "━━━━━━━━━━━━━━━━━━",
          "",
          "🌑 **Eclipse Vanguard**",
          "Precision operators who favour stealth, mobility, and tactical positioning.",
          "",
          "🛡 **Bastion Guard**",
          "Defensive specialists who stabilise objectives and hold strong positions during combat.",
          "",
          "🔥 **Purifier Corps**",
          "Enemy-clearing specialists focused on aggressive engagement and battlefield control.",
          "",
          "☄ **Orbital Directive**",
          "Strategic support operators who maximise stratagems and orbital firepower.",
          "",
          "━━━━━━━━━━━━━━━━━━",
          "",
          "Use the buttons below to **join or transfer divisions** at any time.",
          "",
          "Divisions represent playstyle identity, **not restrictions**.",
        ].join("\n")
      )
      .setFooter({ text: "The Golden Vanguard" })
      .setTimestamp();

    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("division_eclipse")
        .setLabel("Eclipse Vanguard")
        .setEmoji("🌑")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("division_bastion")
        .setLabel("Bastion Guard")
        .setEmoji("🛡")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("division_purifier")
        .setLabel("Purifier Corps")
        .setEmoji("🔥")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("division_orbital")
        .setLabel("Orbital Directive")
        .setEmoji("☄")
        .setStyle(ButtonStyle.Primary)
    );

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("division_leave")
        .setLabel("Leave Division")
        .setStyle(ButtonStyle.Success)
    );

    await interaction.reply({
      embeds: [embed],
      components: [row1, row2],
    });
  },
};