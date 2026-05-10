const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  PermissionsBitField,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");

const creatorStore = require("./creatorStore");

const MODAL_ID = "creator_apply_modal";
const APPROVE_PREFIX = "creator_approve";
const DENY_PREFIX = "creator_deny";

function parseRoleIds(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function hasApproverAccess(member) {
  if (!member) return false;

  if (member.permissions?.has(PermissionsBitField.Flags.Administrator)) {
    return true;
  }

  const approverRoleIds = parseRoleIds(process.env.CREATOR_APPROVER_ROLE_IDS);

  if (!approverRoleIds.length) return false;

  return approverRoleIds.some((roleId) => member.roles.cache.has(roleId));
}

function normalisePlatformName(name) {
  const lower = String(name || "").toLowerCase();

  if (lower.includes("twitch")) return "twitch";
  if (lower.includes("youtube")) return "youtube";
  if (lower.includes("kick")) return "kick";
  if (lower.includes("tiktok")) return "tiktok";
  if (lower.includes("facebook")) return "facebook";
  if (lower.includes("instagram")) return "instagram";
  if (lower.includes("discord")) return "discord";
  if (lower.includes("twitter") || lower === "x") return "x";

  return lower.trim() || "other";
}

function parseLinesToLinks(rawText) {
  const lines = String(rawText || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.map((line) => {
    const parts = line.split(/[-–—:]/);

    const label = parts.length > 1 ? parts[0].trim() : "other";

    const value =
      parts.length > 1
        ? parts.slice(1).join("-").trim()
        : line;

    return {
      platform: normalisePlatformName(label),
      label,
      url: value,
    };
  });
}

function buildApplicationModal(existing = null) {
  const modal = new ModalBuilder()
    .setCustomId(MODAL_ID)
    .setTitle(existing?.approved ? "Edit Creator Profile" : "Creator Application");

  const platformsInput = new TextInputBuilder()
    .setCustomId("platforms")
    .setLabel("Streaming platforms")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setPlaceholder("Twitch - link")
    .setMaxLength(1000);

  const socialsInput = new TextInputBuilder()
    .setCustomId("socials")
    .setLabel("Social links")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setPlaceholder("Instagram - link")
    .setMaxLength(1000);

  const contentInput = new TextInputBuilder()
    .setCustomId("contentType")
    .setLabel("What do you stream?")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder("Helldivers 2 squad gameplay")
    .setMaxLength(200);

  const scheduleInput = new TextInputBuilder()
    .setCustomId("schedule")
    .setLabel("Typical stream schedule")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder("Evenings / weekends")
    .setMaxLength(200);

  const bioInput = new TextInputBuilder()
    .setCustomId("bio")
    .setLabel("Short creator bio")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setPlaceholder("Tell us about your content")
    .setMaxLength(1000);

  if (existing) {
    platformsInput.setValue(existing.platformsRaw || "");
    socialsInput.setValue(existing.socialsRaw || "");
    contentInput.setValue(existing.contentType || "");
    scheduleInput.setValue(existing.schedule || "");
    bioInput.setValue(existing.bio || "");
  }

  modal.addComponents(
    new ActionRowBuilder().addComponents(platformsInput),
    new ActionRowBuilder().addComponents(socialsInput),
    new ActionRowBuilder().addComponents(contentInput),
    new ActionRowBuilder().addComponents(scheduleInput),
    new ActionRowBuilder().addComponents(bioInput)
  );

  return modal;
}

function buildApplicationEmbed(user, application, statusText = "Pending Review") {
  return new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle("🎥 Creator Application")
    .setDescription(
      [
        `**Applicant:** ${user}`,
        `**User ID:** \`${application.discordUserId}\``,
        `**Status:** ${statusText}`,
        "",
        "**Streaming Platforms**",
        application.platformsRaw || "Not provided",
        "",
        "**Socials**",
        application.socialsRaw || "Not provided",
        "",
        "**Content Type**",
        application.contentType || "Not provided",
        "",
        "**Schedule**",
        application.schedule || "Not provided",
        "",
        "**Bio**",
        application.bio || "Not provided",
      ].join("\n")
    )
    .setFooter({
      text: "Golden Vanguard • Creator Applications",
    })
    .setTimestamp(new Date());
}

function buildProfileUpdatedEmbed(user, creator) {
  return new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle("✏️ Creator Profile Updated")
    .setDescription(
      [
        `**Creator:** ${user}`,
        `**User ID:** \`${creator.discordUserId}\``,
        "",
        "**Streaming Platforms**",
        creator.platformsRaw || "Not provided",
        "",
        "**Socials**",
        creator.socialsRaw || "Not provided",
        "",
        "**Content Type**",
        creator.contentType || "Not provided",
        "",
        "**Schedule**",
        creator.schedule || "Not provided",
        "",
        "**Bio**",
        creator.bio || "Not provided",
      ].join("\n")
    )
    .setFooter({
      text: "Golden Vanguard • Creator Network",
    })
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

  const channel = await interaction.client.channels
    .fetch(channelId)
    .catch(() => null);

  if (!channel || !channel.isTextBased()) {
    throw new Error("Creator applications channel invalid.");
  }

  await channel.send({
    embeds: [buildApplicationEmbed(interaction.user, application)],
    components: buildApprovalRows(application.discordUserId),
    allowedMentions: { parse: [] },
  });
}

async function sendProfileUpdateToStaff(interaction, creator) {
  const channelId = process.env.CREATOR_APPLICATIONS_CHANNEL_ID;

  if (!channelId) return;

  const channel = await interaction.client.channels
    .fetch(channelId)
    .catch(() => null);

  if (!channel || !channel.isTextBased()) return;

  await channel.send({
    embeds: [buildProfileUpdatedEmbed(interaction.user, creator)],
    allowedMentions: { parse: [] },
  });
}

async function handleModalSubmit(interaction) {
  if (interaction.customId !== MODAL_ID) {
    return false;
  }

  const platformsRaw = interaction.fields
    .getTextInputValue("platforms")
    .trim();

  const socialsRaw = interaction.fields
    .getTextInputValue("socials")
    .trim();

  const contentType = interaction.fields
    .getTextInputValue("contentType")
    .trim();

  const schedule = interaction.fields
    .getTextInputValue("schedule")
    .trim();

  const bio = interaction.fields
    .getTextInputValue("bio")
    .trim();

  const payload = {
    discordUserId: interaction.user.id,
    discordTag: interaction.user.tag,
    displayName: interaction.member?.displayName || interaction.user.username,

    platformsRaw,
    socialsRaw,
    contentType,
    schedule,
    bio,

    platforms: parseLinesToLinks(platformsRaw),
    socials: parseLinesToLinks(socialsRaw),
  };

  const existingCreator = creatorStore.getCreatorByUserId(interaction.user.id);

  if (existingCreator) {
    const result = creatorStore.updateCreatorProfile(interaction.user.id, payload);

    if (!result.ok) {
      await interaction.reply({
        content: result.reason || "Could not update your creator profile.",
        flags: 64,
      });

      return true;
    }

    await sendProfileUpdateToStaff(interaction, result.creator);

    await interaction.reply({
      content: "Your creator profile has been updated.",
      flags: 64,
    });

    return true;
  }

  const pendingApplication = creatorStore.upsertPendingApplication(payload);

  await sendApplicationToStaff(interaction, pendingApplication);

  await interaction.reply({
    content: "Your creator application has been submitted.",
    flags: 64,
  });

  return true;
}

async function approveCreator(interaction, discordUserId) {
  const result = creatorStore.approveApplication(
    discordUserId,
    interaction.user.id
  );

  if (!result.ok) {
    await interaction.reply({
      content: result.reason || "Could not approve application.",
      flags: 64,
    });

    return true;
  }

  const creatorRoleId = process.env.CREATOR_ROLE_ID;

  if (creatorRoleId && interaction.guild) {
    const member = await interaction.guild.members
      .fetch(discordUserId)
      .catch(() => null);

    if (member) {
      await member.roles.add(creatorRoleId).catch(() => null);
    }
  }

  await interaction.update({
    content: `✅ Approved <@${discordUserId}>`,
    embeds: [],
    components: [],
  });

  return true;
}

async function denyCreator(interaction, discordUserId) {
  const result = creatorStore.denyApplication(discordUserId);

  if (!result.ok) {
    await interaction.reply({
      content: result.reason || "Could not deny application.",
      flags: 64,
    });

    return true;
  }

  await interaction.update({
    content: `❌ Denied <@${discordUserId}>`,
    embeds: [],
    components: [],
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
      content: "You do not have permission.",
      flags: 64,
    });

    return true;
  }

  const [action, discordUserId] = interaction.customId.split(":");

  if (action === APPROVE_PREFIX) {
    return approveCreator(interaction, discordUserId);
  }

  if (action === DENY_PREFIX) {
    return denyCreator(interaction, discordUserId);
  }

  return false;
}

module.exports = {
  MODAL_ID,
  APPROVE_PREFIX,
  DENY_PREFIX,
  buildApplicationModal,
  handleModalSubmit,
  handleButtonInteraction,
  hasApproverAccess,
};
