const fs = require("fs");
const path = require("path");

const { EmbedBuilder } = require("discord.js");

const config = require("../config/commendConfig");

const DATA_PATH = path.join(
  __dirname,
  "../data/commendations.json"
);

function loadData() {
  try {
    if (!fs.existsSync(DATA_PATH)) {
      fs.writeFileSync(
        DATA_PATH,
        JSON.stringify(
          {
            reviews: [],
          },
          null,
          2
        )
      );
    }

    return JSON.parse(fs.readFileSync(DATA_PATH));
  } catch {
    return {
      reviews: [],
    };
  }
}

function saveData(data) {
  fs.writeFileSync(
    DATA_PATH,
    JSON.stringify(data, null, 2)
  );
}

function containsFoulLanguage(text) {
  const lower = String(text || "").toLowerCase();

  return config.foulWords.some((word) =>
    lower.includes(word.toLowerCase())
  );
}

function buildStars(rating) {
  return "⭐".repeat(rating);
}

function getGameSelectOptions() {
  return Object.values(config.games).map((game) => ({
    label: game.name,
    value: game.id,
  }));
}

function checkCooldown(reviewerId, reviewedUserId) {
  const data = loadData();

  const existing = data.reviews
    .filter(
      (r) =>
        r.reviewerId === reviewerId &&
        r.reviewedUserId === reviewedUserId
    )
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() -
        new Date(a.createdAt).getTime()
    )[0];

  if (!existing) {
    return {
      allowed: true,
    };
  }

  const now = Date.now();
  const diff = now - new Date(existing.createdAt).getTime();
  const hours = diff / (1000 * 60 * 60);

  return {
    allowed: hours >= config.reviewCooldownHours,
  };
}

async function handleReviewModal(interaction) {
  const parts = interaction.customId.split(":");

  const reviewedUserId = parts[1];
  const gameId = parts[2];

  const reviewedUser = await interaction.client.users.fetch(reviewedUserId);

  const rating = parseInt(
    interaction.fields.getTextInputValue("rating"),
    10
  );

  const anonymousRaw = interaction.fields.getTextInputValue("anonymous");
  const promotion = interaction.fields.getTextInputValue("promotion");
  const review = interaction.fields.getTextInputValue("review");

  if (Number.isNaN(rating) || rating < 1 || rating > 5) {
    return interaction.reply({
      content: "Combat rating must be between 1 and 5.",
      ephemeral: true,
    });
  }

  const anonymousValue = anonymousRaw.trim().toLowerCase();

  if (!["yes", "no"].includes(anonymousValue)) {
    return interaction.reply({
      content: "Anonymous must be answered with yes or no.",
      ephemeral: true,
    });
  }

  const anonymous = anonymousValue === "yes";

  const game = config.games[gameId];

  if (!game) {
    return interaction.reply({
      content: "That game option is not configured.",
      ephemeral: true,
    });
  }

  const foul = containsFoulLanguage(review);

  const publicChannel = interaction.client.channels.cache.get(
    process.env.PLAYER_REVIEW_CHANNEL_ID
  );

  const staffChannel = interaction.client.channels.cache.get(
    process.env.PLAYER_REVIEW_STAFF_CHANNEL_ID
  );

  const publicEmbed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setDescription(
`# ⭐ PLAYER COMMENDATION

🎖 **Reviewed Vanguard**
${reviewedUser}

🎮 **Operation Front**
${game.name}

🎯 **Combat Rating**
${buildStars(rating)}

📝 **Field Report**
"${review}"

👤 **Submitted By**
${anonymous ? "Anonymous Vanguard" : interaction.user}

━━━━━━━━━━━━━━━━━━
⚔ *The Golden Vanguard Commendation Network*
━━━━━━━━━━━━━━━━━━`
    )
    .setTimestamp();

  const staffEmbed = new EmbedBuilder()
    .setColor(foul ? 0xe74c3c : 0x3498db)
    .setTitle("Commendation Staff Log")
    .addFields(
      {
        name: "Reviewed User",
        value: `${reviewedUser.tag} (${reviewedUser.id})`,
      },
      {
        name: "Reviewer",
        value: `${interaction.user.tag} (${interaction.user.id})`,
      },
      {
        name: "Anonymous",
        value: anonymous ? "Yes" : "No",
        inline: true,
      },
      {
        name: "Promotion Support",
        value: promotion,
        inline: true,
      },
      {
        name: "Foul Language",
        value: foul ? "Detected" : "Clean",
        inline: true,
      },
      {
        name: "Game",
        value: game.name,
        inline: true,
      },
      {
        name: "Rating",
        value: `${rating}/5`,
        inline: true,
      },
      {
        name: "Review",
        value: review,
      }
    )
    .setTimestamp();

  const data = loadData();

  data.reviews.push({
    reviewerId: interaction.user.id,
    reviewedUserId,
    rating,
    anonymous,
    promotion,
    review,
    foul,
    gameId,
    createdAt: new Date().toISOString(),
  });

  saveData(data);

  if (staffChannel) {
    await staffChannel.send({
      embeds: [staffEmbed],
    });
  }

  if (!foul && publicChannel) {
    await publicChannel.send({
      embeds: [publicEmbed],
    });
  }

  if (foul) {
    return interaction.reply({
      content: "Your commendation was submitted for staff review.",
      ephemeral: true,
    });
  }

  return interaction.reply({
    content: "Commendation submitted successfully.",
    ephemeral: true,
  });
}

module.exports = {
  getGameSelectOptions,
  handleReviewModal,
  checkCooldown,
};