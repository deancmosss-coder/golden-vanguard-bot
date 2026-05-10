const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

const fs = require("fs");
const path = require("path");

const creatorStore = require("../services/creatorStore");

const {
  buildApplicationModal,
} = require("../services/creatorApplication");

const STREAM_ALERTS_PATH = path.join(
  __dirname,
  "..",
  "data",
  "streamAlerts.json"
);

const MULTISTREAMS_PATH = path.join(
  __dirname,
  "..",
  "data",
  "multistreams.json"
);

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) {
      return fallback;
    }

    return JSON.parse(
      fs.readFileSync(filePath, "utf8")
    );
  } catch {
    return fallback;
  }
}

function getLiveStreams() {
  const data = readJson(STREAM_ALERTS_PATH, {
    liveStreams: [],
  });

  return Array.isArray(data.liveStreams)
    ? data.liveStreams
    : [];
}

function getMultiStreams() {
  const data = readJson(MULTISTREAMS_PATH, {
    activeMultiStreams: [],
  });

  return Array.isArray(data.activeMultiStreams)
    ? data.activeMultiStreams
    : [];
}

function buildTwitchUrl(username) {
  return `https://twitch.tv/${username}`;
}

function buildMultiStreamUrl(usernames) {
  return `https://multitwitch.tv/${usernames.join("/")}`;
}

async function findMemberVoice(client, creatorId) {
  for (const guild of client.guilds.cache.values()) {
    const member = await guild.members
      .fetch(creatorId)
      .catch(() => null);

    if (!member?.voice?.channel) {
      continue;
    }

    return member.voice.channel.name;
  }

  return null;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("creator")
    .setDescription("Creator tools")

    .addSubcommand((sub) =>
      sub
        .setName("apply")
        .setDescription(
          "Apply for the creator network"
        )
    )

    .addSubcommand((sub) =>
      sub
        .setName("edit")
        .setDescription(
          "Edit your creator profile"
        )
    )

    .addSubcommand((sub) =>
      sub
        .setName("live")
        .setDescription(
          "View all live Vanguard creators"
        )
    ),

  async execute(interaction) {
    const subcommand =
      interaction.options.getSubcommand();

    if (subcommand === "apply") {
      const existing =
        creatorStore.getCreatorByUserId(
          interaction.user.id
        );

      if (existing) {
        return interaction.reply({
          content:
            "You are already an approved creator. Use `/creator edit` instead.",
          flags: 64,
        });
      }

      const modal = buildApplicationModal();

      return interaction.showModal(modal);
    }

    if (subcommand === "edit") {
      const creator =
        creatorStore.getCreatorByUserId(
          interaction.user.id
        );

      if (!creator) {
        return interaction.reply({
          content:
            "You are not an approved creator.",
          flags: 64,
        });
      }

      const modal =
        buildApplicationModal(creator);

      return interaction.showModal(modal);
    }

    if (subcommand === "live") {
      const liveStreams = getLiveStreams();

      if (!liveStreams.length) {
        return interaction.reply({
          content:
            "No Vanguard creators are currently live.",
          flags: 64,
        });
      }

      const multiStreams =
        getMultiStreams();

      const embed = new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle(
          "🔴 Vanguard Creator Network"
        )
        .setDescription(
          "Currently live Vanguard creators."
        )
        .setFooter({
          text: "The Golden Vanguard",
        })
        .setTimestamp();

      const rows = [];

      for (const stream of liveStreams) {
        const creator =
          creatorStore.getCreatorByUserId(
            stream.creatorId
          );

        if (!creator) {
          continue;
        }

        const vcName =
          await findMemberVoice(
            interaction.client,
            stream.creatorId
          );

        embed.addFields({
          name: `🎥 ${creator.displayName}`,
          value: [
            `**Platform:** Twitch`,
            `**Channel:** ${stream.twitchUsername}`,
            `**Voice Channel:** ${
              vcName || "Not in VC"
            }`,
          ].join("\n"),
          inline: false,
        });

        rows.push(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setLabel(
                `Watch ${creator.displayName}`
              )
              .setStyle(ButtonStyle.Link)
              .setURL(
                buildTwitchUrl(
                  stream.twitchUsername
                )
              )
          )
        );
      }

      for (const multi of multiStreams) {
        const usernames =
          Array.isArray(multi.streamers)
            ? multi.streamers
            : [];

        if (usernames.length < 2) {
          continue;
        }

        rows.push(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setLabel(
                `Watch Multi-Stream (${usernames.length})`
              )
              .setStyle(ButtonStyle.Link)
              .setURL(
                buildMultiStreamUrl(
                  usernames
                )
              )
          )
        );
      }

      return interaction.reply({
        embeds: [embed],
        components: rows.slice(0, 5),
      });
    }
  },
};