const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionsBitField,
} = require("discord.js");

const creatorStore = require("./creatorStore");

const MODAL_ID = "creator_apply_modal";
const APPROVE_PREFIX = "creator_approve";
const DENY_PREFIX = "creator_deny";

function parseRoleIds(value) {
  return String(value || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function hasApproverAccess(member) {
  const approverRoleIds = parseRoleIds(process.env.CREATOR_APPROVER_ROLE_IDS);

  if (!member) return false;

  if (member.permissions?.has(PermissionsBitField.Flags.Administrator)) {
    return true;
  }

  if (!approverRoleIds.length) return false;

  return approverRoleIds.some((roleId) => member.roles.cache.has(roleId));
}

function buildApplicationModal(existing = null) {
  const modal = new ModalBuilder()
    .setCustomId(MODAL_ID)
    .setTitle("Creator Application");

  const platforms = new TextInputBuilder()
    .setCustomId("platforms")
    .setLabel("Streaming platforms + links")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setPlaceholder(
      "Example:\nTwitch - https://twitch.tv/name\nYouTube - https://youtube.com/@name"
    )
    .setMaxLength(1000);

  const socials = new TextInputBuilder()
    .setCustomId("socials")
    .setLabel("Socials + links")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setPlaceholder(
      "Example:\nDiscord - username\nInstagram - https://instagram.com/name"
    )
    .setMaxLength(1000);

  const contentType = new TextInputBuilder()
    .setCustomId("contentType")
    .setLabel("What do you stream?")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder("Helldivers 2, squad play, challenge runs")
    .setMaxLength(200);

  const schedule = new TextInputBuilder()
    .setCustomId("schedule")
    .setLabel("Typical schedule")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder("Evenings and weekends")
    .setMaxLength(200);

  const bio = new TextInputBuilder()
    .setCustomId("bio")
    .setLabel("Short creator bio")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setPlaceholder("Tell us about your vibe and whether you play with viewers.")
    .setMaxLength(1000);

  if (existing) {
    platforms.setValue(existing.platforms || "");
    socials.setValue(existing.socials || "");
    contentType.setValue(existing.contentType || "");
    schedule.setValue(existing.schedule || "");
    bio.setValue(existing.bio || "");
  }

  modal.addComponents(
    new ActionRowBuilder().addComponents(platforms),
    new ActionRowBuilder().addComponents(socials),
    new ActionRowBuilder().addComponents(contentType),
    new ActionRowBuilder().addComponents(schedule),
    new ActionRowBuilder().addComponents(bio)
  );

  return modal;
}

function buildApplicationEmbed({ user, application, statusText = "Pending Review" }) {
  return new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle("Creator Application")
    .setDescription(
      [
        `**Applicant:** ${user}`,
        `**User ID:** \`${application.discordUserId}\``,
        `**Status:** ${statusText}`,
        "",
        "**Streaming Platforms**",
        application.platforms || "Not provided",
        "",
        "**Socials**",
        application.socials || "Not provided",
        "",
        `**Content**\n${application.contentType || "Not provided"}`,
        "",
        `**Schedule**\n${application.schedule || "Not provided"}`,
        "",
        `**Bio**\n${application.bio || "Not provided"}`,
      ].join("\n")
    )
    .setFooter({ text: "Golden Vanguard • Creator Applications" })
    .setTimestamp(new Date());
}

function buildApprovalRows(discordUserId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${APPROVE_PREFIX}:${discordUserId}`)
        .setLabel("Approve")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`${DENY_PREFIX}:${discordUserId}`)
        .setLabel("Deny")
        .setStyle(ButtonStyle.Danger)
    ),
  ];
}

async function sendApplicationToStaff(interaction, application) {
  const channelId = process.env.CREATOR_APPLICATIONS_CHANNEL_ID;
  if (!channelId) {
    throw new Error("Missing CREATOR_APPLICATIONS_CHANNEL_ID in .env");
  }

  const channel = await interaction.client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) {
    throw new Error("Creator applications channel could not be found or is not text based.");
  }

  return channel.send({
    embeds: [buildApplicationEmbed({ user: interaction.user, application })],
    components: buildApprovalRows(application.discordUserId),
    allowedMentions: { parse: [] },
  });
}

async function handleModalSubmit(interaction) {
  if (interaction.customId !== MODAL_ID) return false;

  const existingCreator = creatorStore.getCreatorByUserId(interaction.user.id);
  if (existingCreator) {
    await interaction.reply({
      content: "You are already an approved creator.",
      ephemeral: true,
    });
    return true;
  }

  const application = {
    discordUserId: interaction.user.id,
    discordTag: interaction.user.tag,
    displayName: interaction.member?.displayName || interaction.user.username,
    platforms: interaction.fields.getTextInputValue("platforms").trim(),
    socials: interaction.fields.getTextInputValue("socials").trim(),
    contentType: interaction.fields.getTextInputValue("contentType").trim(),
    schedule: interaction.fields.getTextInputValue("schedule").trim(),
    bio: interaction.fields.getTextInputValue("bio").trim(),
  };

  const pending = creatorStore.upsertPendingApplication(application);

  await sendApplicationToStaff(interaction, pending);

  await interaction.reply({
    content:
      "Your creator application has been submitted to staff for review.",
    ephemeral: true,
  });

  return true;
}

async function handleButtonInteraction(interaction) {
  if (
    !interaction.customId.startsWith(APPROVE_PREFIX) &&
    !interaction.customId.startsWith(DENY_PREFIX)
  ) {
    return false;
  }

  if (!hasApproverAccess(interaction.member)) {
    await interaction.reply({
      content: "You do not have permission to review creator applications.",
      ephemeral: true,
    });
    return true;
  }

  const [action, discordUserId] = interaction.customId.split(":");
  if (!discordUserId) {
    await interaction.reply({
      content: "That application button is invalid.",
      ephemeral: true,
    });
    return true;
  }

  if (action === APPROVE_PREFIX) {
    const result = creatorStore.approveApplication(discordUserId, interaction.user.id);

    if (!result.ok) {
      await interaction.reply({
        content: result.reason || "Could not approve that application.",
        ephemeral: true,
      });
      return true;
    }

    const creatorRoleId = process.env.CREATOR_ROLE_ID;
    if (creatorRoleId && interaction.guild) {
      const member = await interaction.guild.members.fetch(discordUserId).catch(() => null);
      if (member) {
        await member.roles.add(creatorRoleId).catch(() => null);
      }
    }

    const approvedUser = await interaction.client.users.fetch(discordUserId).catch(() => null);
    if (approvedUser) {
      await approvedUser.send(
        "Your Golden Vanguard creator application has been approved. Welcome to the creator system."
      ).catch(() => null);
    }

    const embed = EmbedBuilder.from(interaction.message.embeds[0] || buildApplicationEmbed({
      user: approvedUser || { toString: () => `<@${discordUserId}>` },
      application: result.creator.application,
    }))
      .setColor(0x2ecc71)
      .setTitle("Creator Application • Approved")
      .setFooter({
        text: `Approved by ${interaction.user.tag}`,
      })
      .setTimestamp(new Date());

    await interaction.update({
      embeds: [embed],
      components: [],
      allowedMentions: { parse: [] },
    });

    return true;
  }

  if (action === DENY_PREFIX) {
    const result = creatorStore.denyApplication(discordUserId);

    if (!result.ok) {
      await interaction.reply({
        content: result.reason || "Could not deny that application.",
        ephemeral: true,
      });
      return true;
    }

    const deniedUser = await interaction.client.users.fetch(discordUserId).catch(() => null);
    if (deniedUser) {
      await deniedUser.send(
        "Your Golden Vanguard creator application was not approved this time. You can reapply later."
      ).catch(() => null);
    }

    const embed = EmbedBuilder.from(interaction.message.embeds[0] || buildApplicationEmbed({
      user: deniedUser || { toString: () => `<@${discordUserId}>` },
      application: result.application,
    }))
      .setColor(0xe74c3c)
      .setTitle("Creator Application • Denied")
      .setFooter({
        text: `Denied by ${interaction.user.tag}`,
      })
      .setTimestamp(new Date());

    await interaction.update({
      embeds: [embed],
      components: [],
      allowedMentions: { parse: [] },
    });

    return true;
  }

  return false;
}

module.exports = {
  MODAL_ID,
  buildApplicationModal,
  handleModalSubmit,
  handleButtonInteraction,
  hasApproverAccess,
};