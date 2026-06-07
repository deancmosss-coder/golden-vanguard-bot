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

function cleanUrl(value) {
  return String(value || "").trim();
}

function buildPlatformList({ twitchUrl, youtubeUrl, kickUrl }) {
  const platforms = [];

  if (twitchUrl) {
    platforms.push({
      platform: "twitch",
      label: "Twitch",
      url: twitchUrl,
    });
  }

  if (youtubeUrl) {
    platforms.push({
      platform: "youtube",
      label: "YouTube",
      url: youtubeUrl,
    });
  }

  if (kickUrl) {
    platforms.push({
      platform: "kick",
      label: "Kick",
      url: kickUrl,
    });
  }

  return platforms;
}

function buildPlatformsRaw(platforms) {
  if (!Array.isArray(platforms) || !platforms.length) {
    return "";
  }

  return platforms
    .map((platform) => `${platform.label} - ${platform.url}`)
    .join("\n");
}

function parseSocials(rawText) {
  const lines = String(rawText || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.map((line) => {
    const lower = line.toLowerCase();

    let platform = "other";
    let label = "Other";

    if (lower.includes("discord")) {
      platform = "discord";
      label = "Discord";
    } else if (lower.includes("facebook")) {
      platform = "facebook";
      label = "Facebook";
    } else if (lower.includes("instagram")) {
      platform = "instagram";
      label = "Instagram";
    } else if (lower.includes("tiktok")) {
      platform = "tiktok";
      label = "TikTok";
    } else if (lower.includes("twitter") || lower.includes("x.com")) {
      platform = "x";
      label = "X";
    } else if (lower.includes("youtube")) {
      platform = "youtube";
      label = "YouTube";
    } else if (lower.includes("twitch")) {
      platform = "twitch";
      label = "Twitch";
    }

    return {
      platform,
      label,
      url: line,
    };
  });
}

function getExistingPlatformUrl(existing, platformName) {
  if (!existing || !Array.isArray(existing.platforms)) {
    return "";
  }

  const match = existing.platforms.find(
    (item) => String(item.platform || "").toLowerCase() === platformName
  );

  return match?.url || "";
}

function buildApplicationModal(existing = null) {
  const modal = new ModalBuilder()
    .setCustomId(MODAL_ID)
    .setTitle(existing?.approved ? "Edit Creator Profile" : "Creator Application");

  const twitchInput = new TextInputBuilder()
    .setCustomId("twitchUrl")
    .setLabel("Twitch channel link")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setPlaceholder("https://www.twitch.tv/yourname")
    .setMaxLength(300);

  const youtubeInput = new TextInputBuilder()
    .setCustomId("youtubeUrl")
    .setLabel("YouTube channel link")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setPlaceholder("https://www.youtube.com/channel/UC...")
    .setMaxLength(300);

  const kickInput = new TextInputBuilder()
    .setCustomId("kickUrl")
    .setLabel("Kick channel link")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setPlaceholder("https://kick.com/yourname")
    .setMaxLength(300);

  const socialsInput = new TextInputBuilder()
    .setCustomId("socials")
    .setLabel("Social links")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setPlaceholder("Instagram - link\nTikTok - link\nFacebook - link\nDiscord - link")
    .setMaxLength(1000);

  const creatorInfoInput = new TextInputBuilder()
    .setCustomId("creatorInfo")
    .setLabel("Creator info / bio")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setPlaceholder("Tell us what you create, what games you play, and why people should check you out.")
    .setMaxLength(1000);

  if (existing) {
    twitchInput.setValue(getExistingPlatformUrl(existing, "twitch"));
    youtubeInput.setValue(getExistingPlatformUrl(existing, "youtube"));
    kickInput.setValue(getExistingPlatformUrl(existing, "kick"));
    socialsInput.setValue(existing.socialsRaw || "");
    creatorInfoInput.setValue(existing.bio || existing.contentType || "");
  }

  modal.addComponents(
    new ActionRowBuilder().addComponents(twitchInput),
    new ActionRowBuilder().addComponents(youtubeInput),
    new ActionRowBuilder().addComponents(kickInput),
    new ActionRowBuilder().addComponents(socialsInput),
    new ActionRowBuilder().addComponents(creatorInfoInput)
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
        "**Creator Info**",
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
        "**Creator Info**",
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

  const twitchUrl = cleanUrl(interaction.fields.getTextInputValue("twitchUrl"));
  const youtubeUrl = cleanUrl(interaction.fields.getTextInputValue("youtubeUrl"));
  const kickUrl = cleanUrl(interaction.fields.getTextInputValue("kickUrl"));
  const socialsRaw = cleanUrl(interaction.fields.getTextInputValue("socials"));
  const creatorInfo = cleanUrl(interaction.fields.getTextInputValue("creatorInfo"));

  const platforms = buildPlatformList({
    twitchUrl,
    youtubeUrl,
    kickUrl,
  });

  if (!platforms.length) {
    await interaction.reply({
      content:
        "Please add at least one streaming platform link: Twitch, YouTube, or Kick.",
      flags: 64,
    });

    return true;
  }

  const platformsRaw = buildPlatformsRaw(platforms);

  const payload = {
    discordUserId: interaction.user.id,
    discordTag: interaction.user.tag,
    displayName: interaction.member?.displayName || interaction.user.username,

    platformsRaw,
    socialsRaw,

    contentType: creatorInfo,
    schedule: "Listed on creator platforms",
    bio: creatorInfo,

    platforms,
    socials: parseSocials(socialsRaw),
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